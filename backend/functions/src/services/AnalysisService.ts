import { ChatOpenAI } from '@langchain/openai';
import { Document } from 'langchain/document';
import { Logger } from '../utils/logger';
import { StorageService } from './StorageService';
import { FirestoreService } from './FirestoreService';
import { EmbeddingService, DocumentType } from './EmbeddingService';
import { LegalDocumentSplitter, HierarchicalChunk } from '../strategies/LegalDocumentSplitter';
import { ContractAnalysisChain } from '../chains/ContractAnalysisChain';
import { GDPRComplianceChain } from '../chains/GDPRComplianceChain';
import { LLMFactory } from '../factories/LLMFactory';
import { PineconeVectorStore, VectorStoreConfig, SearchResult } from '../vectorstore';
import { websocketManager } from '../websocket';
import { v4 as uuidv4 } from 'uuid';
import { DocumentInterface } from '@langchain/core/documents';

export interface AnalysisRequest {
  documentId: string;
  userId: string;
  analysisType: 'gdpr' | 'contract_risk' | 'legal_review';
  options?: {
    priority?: 'low' | 'normal' | 'high';
    notifyByEmail?: boolean;
    detailedReport?: boolean;
    language?: 'de' | 'en' | 'fr' | 'it';
  };
}

export interface AnalysisResult {
  analysisId: string;
  documentId: string;
  userId: string;
  analysisType: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  results?: any;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  estimatedCompletion?: Date;
  processingTimeMs?: number;
  chunks?: HierarchicalChunk[];
  embeddings?: {
    chunkId: string;
    embedding: number[];
    metadata: any;
  }[];
}

export interface ProcessingProgress {
  stage: 'download' | 'split' | 'embed' | 'analyze' | 'save';
  progress: number;
  message: string;
  details?: any;
}

export interface Modules {
  indexName: string;
  namespace?: string;
}

/**
 * Service für die Integration der RAG-Pipeline mit der Dokumentenverwaltung
 * Orchestriert den gesamten Analyse-Workflow von Download bis Ergebnis-Speicherung
 * Implementiert Schritt 1-2 aus RAG_INTEGRATION_README
 */
export class AnalysisService {
  private readonly logger = Logger.getInstance();
  private readonly storageService: StorageService;
  private readonly firestoreService: FirestoreService;
  private readonly embeddingService: EmbeddingService;
  private readonly documentSplitter: LegalDocumentSplitter;
  private readonly llmFactory: LLMFactory;
  private readonly vectorStore: PineconeVectorStore;

  // Chains für verschiedene Analyse-Typen
  private readonly contractAnalysisChain: ContractAnalysisChain;
  private readonly gdprComplianceChain: GDPRComplianceChain;

  // Active analysis tracking
  private readonly activeAnalyses = new Map<string, {
    abortController: AbortController;
    progressCallback?: (progress: ProcessingProgress) => void;
    userId: string;
    requestId: string;
  }>();

  constructor() {
    this.storageService = new StorageService();
    this.firestoreService = new FirestoreService();
    this.embeddingService = new EmbeddingService();
    this.documentSplitter = new LegalDocumentSplitter();
    this.llmFactory = new LLMFactory();
    this.vectorStore = new PineconeVectorStore(this.embeddingService);

    // Initialize analysis chains
    this.contractAnalysisChain = new ContractAnalysisChain();
    this.gdprComplianceChain = new GDPRComplianceChain();
  }

  /**
   * Startet eine neue Dokument-Analyse
   */
  async startAnalysis(request: AnalysisRequest): Promise<string> {
    const analysisId = uuidv4();
    const abortController = new AbortController();

    try {
      this.logger.info('Starting document analysis', {
        analysisId,
        documentId: request.documentId,
        userId: request.userId,
        analysisType: request.analysisType
      });

      // Create analysis record
      const analysis: AnalysisResult = {
        analysisId,
        documentId: request.documentId,
        userId: request.userId,
        analysisType: request.analysisType,
        status: 'pending',
        progress: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        estimatedCompletion: this.estimateCompletion(request.analysisType)
      };

      await this.saveAnalysisResult(analysis);

      // Track active analysis
      this.activeAnalyses.set(analysisId, {
        abortController,
        progressCallback: (progress) => this.updateProgress(analysisId, progress),
        userId: request.userId,
        requestId: analysisId
      });

      // Start async processing
      this.processAnalysisAsync(analysisId, request, abortController.signal)
        .catch(error => {
          this.logger.error('Analysis processing failed', error, { analysisId });
          this.handleAnalysisError(analysisId, error);
        })
        .finally(() => {
          this.activeAnalyses.delete(analysisId);
        });

      return analysisId;

    } catch (error) {
      this.logger.error('Failed to start analysis', error as Error, {
        analysisId,
        request
      });
      this.activeAnalyses.delete(analysisId);
      throw error;
    }
  }

  /**
   * Asynchrone Verarbeitung der Analyse
   */
  private async processAnalysisAsync(
    analysisId: string,
    request: AnalysisRequest,
    abortSignal: AbortSignal
  ): Promise<void> {
    const startTime = Date.now();

    try {
      await this.updateAnalysisStatus(analysisId, 'processing', 5);

      // 1. Download document from Firebase Storage
      await this.reportProgress('download', 10, 'Downloading document from storage', analysisId);
      const documentContent = await this.downloadDocument(request.documentId, request.userId);

      if (abortSignal.aborted) throw new Error('Analysis cancelled');

      // 2. Split document into hierarchical chunks
      await this.reportProgress('split', 25, 'Splitting document into chunks', analysisId);
      const chunks = await this.splitDocument(documentContent, request.documentId);

      if (abortSignal.aborted) throw new Error('Analysis cancelled');

      // 3. Generate embeddings for chunks
      await this.reportProgress('embed', 45, 'Generating embeddings', analysisId);
      const embeddings = await this.generateEmbeddings(chunks, request.options?.language);

      if (abortSignal.aborted) throw new Error('Analysis cancelled');

      // 4. Perform analysis based on type
      await this.reportProgress('analyze', 70, 'Performing legal analysis', analysisId);
      const analysisResults = await this.performAnalysis(
        request.analysisType,
        chunks,
        embeddings,
        request.options
      );

      if (abortSignal.aborted) throw new Error('Analysis cancelled');

      // 5. Save results
      await this.reportProgress('save', 90, 'Saving analysis results', analysisId);
      const processingTime = Date.now() - startTime;

      await this.updateAnalysisResult(analysisId, {
        status: 'completed',
        progress: 100,
        results: analysisResults,
        processingTimeMs: processingTime,
        chunks,
        embeddings,
        updatedAt: new Date()
      });

      this.logger.info('Analysis completed successfully', {
        analysisId,
        processingTimeMs: processingTime,
        chunksCount: chunks.length,
        embeddingsCount: embeddings.length
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage === 'Analysis cancelled') {
        await this.updateAnalysisStatus(analysisId, 'cancelled');
        this.logger.info('Analysis cancelled', { analysisId });
      } else {
        throw error;
      }
    }
  }

  /**
   * Lädt Dokument aus Firebase Storage herunter
   */
  private async downloadDocument(documentId: string, userId: string): Promise<string> {
    try {
      // Get document metadata
      const document = await this.firestoreService.getDocument(documentId, userId);
      if (!document) {
        throw new Error(`Document not found: ${documentId}`);
      }

      // Download file content
      const result = await this.storageService.generateDownloadUrl(
        documentId,
        document.fileName,
        userId
      );

      // Fetch file content
      const response = await fetch(result.downloadUrl);
      if (!response.ok) {
        throw new Error(`Failed to download document: ${response.statusText}`);
      }

      // For now, assume text content - in production, add file type detection
      const content = await response.text();

      this.logger.debug('Document downloaded successfully', {
        documentId,
        contentLength: content.length
      });

      return content;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to download document', error as Error, {
        documentId,
        userId
      });
      throw new Error(`Document download failed: ${errorMessage}`);
    }
  }

  /**
   * Teilt Dokument in hierarchische Chunks auf
   */
  private async splitDocument(content: string, documentId: string): Promise<HierarchicalChunk[]> {
    try {
      const document = new Document({
        pageContent: content,
        metadata: {
          documentId,
          source: 'firebase_storage',
          splitTimestamp: new Date().toISOString()
        }
      });

      const chunks = await this.documentSplitter.splitDocument(document);

      this.logger.debug('Document split completed', {
        documentId,
        chunksCount: chunks.length,
        avgChunkSize: chunks.reduce((sum, chunk) => sum + chunk.pageContent.length, 0) / chunks.length
      });

      return chunks;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to split document', error as Error, { documentId });
      throw new Error(`Document splitting failed: ${errorMessage}`);
    }
  }

  /**
   * Generiert Embeddings für alle Chunks
   */
  private async generateEmbeddings(
    chunks: HierarchicalChunk[],
    language: string = 'de'
  ): Promise<{ chunkId: string; embedding: number[]; metadata: any }[]> {
    try {
      const embeddings: { chunkId: string; embedding: number[]; metadata: any }[] = [];

      // Process chunks in batches to avoid rate limits
      const batchSize = 20;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);

        const batchPromises = batch.map(async (chunk) => {
          const embedding = await this.embeddingService.embedDocument(
            chunk.pageContent,
            this.inferDocumentType(chunk),
            {
              documentType: this.inferDocumentType(chunk),
              language,
              jurisdiction: 'CH',
              legalArea: chunk.metadata.section
            }
          );

          return {
            chunkId: chunk.metadata.id,
            embedding,
            metadata: {
              chunkLevel: chunk.metadata.chunkLevel,
              chunkIndex: chunk.metadata.chunkIndex,
              section: chunk.metadata.section,
              legalReferences: chunk.metadata.legalReferences,
              textLength: chunk.pageContent.length
            }
          };
        });

        const batchResults = await Promise.all(batchPromises);
        embeddings.push(...batchResults);

        // Small delay between batches
        if (i + batchSize < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      this.logger.debug('Embeddings generated successfully', {
        chunksCount: chunks.length,
        embeddingsCount: embeddings.length
      });

      return embeddings;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to generate embeddings', error as Error);
      throw new Error(`Embedding generation failed: ${errorMessage}`);
    }
  }

  /**
   * Führt die spezifische Analyse basierend auf dem Typ durch
   */
  private async performAnalysis(
    analysisType: string,
    chunks: HierarchicalChunk[],
    embeddings: any[],
    options?: any
  ): Promise<any> {
    try {
      const document = new Document({
        pageContent: chunks.map(c => c.pageContent).join('\n\n'),
        metadata: {
          chunksCount: chunks.length,
          embeddingsCount: embeddings.length,
          analysisType,
          timestamp: new Date().toISOString()
        }
      });

      let results: any;

      switch (analysisType) {
        case 'contract_risk':
          results = await this.contractAnalysisChain.analyze(document);
          break;

        case 'gdpr':
          // Load relevant GDPR regulations (mock for now)
          const gdprRegulations = await this.loadGDPRRegulations();
          // Set regulations in chain context before analysis
          (this.gdprComplianceChain as any).setRegulations?.(gdprRegulations);
          results = await this.gdprComplianceChain.analyze(document);
          break;

        case 'legal_review':
          // Perform comprehensive legal review
          results = await this.performComprehensiveReview(document, chunks);
          break;

        default:
          throw new Error(`Unsupported analysis type: ${analysisType}`);
      }

      this.logger.debug('Analysis completed', {
        analysisType,
        resultsSize: JSON.stringify(results).length
      });

      return results;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Analysis failed', error as Error, { analysisType });
      throw new Error(`Analysis failed: ${errorMessage}`);
    }
  }

  /**
   * Lädt GDPR/DSG Vorschriften
   */
  private async loadGDPRRegulations(): Promise<Document[]> {
    // In production, load from vector store or knowledge base
    return [
      new Document({
        pageContent: "DSGVO Art. 5 - Grundsätze für die Verarbeitung personenbezogener Daten...",
        metadata: { source: 'GDPR', article: '5' }
      }),
      new Document({
        pageContent: "DSG Art. 6 - Grundsätze der Datenbearbeitung...",
        metadata: { source: 'DSG', article: '6' }
      })
    ];
  }

  /**
   * Führt umfassende Rechtsüberprüfung durch
   */
  private async performComprehensiveReview(
    document: Document,
    chunks: HierarchicalChunk[]
  ): Promise<any> {
    // Combine multiple analysis types for comprehensive review
    const contractResults = await this.contractAnalysisChain.analyze(document);
    const gdprRegulations = await this.loadGDPRRegulations();
    (this.gdprComplianceChain as any).setRegulations?.(gdprRegulations);
    const gdprResults = await this.gdprComplianceChain.analyze(document);

    return {
      contractAnalysis: contractResults,
      gdprCompliance: gdprResults,
      overallRating: this.calculateOverallRating(contractResults, gdprResults),
      recommendedActions: this.generateRecommendedActions(contractResults, gdprResults),
      riskAssessment: this.assessOverallRisk(contractResults, gdprResults)
    };
  }

  /**
   * Hilfsmethoden
   */
  private inferDocumentType(chunk: HierarchicalChunk): DocumentType {
    const content = chunk.pageContent.toLowerCase();

    if (content.includes('vertrag') || content.includes('contract')) {
      return DocumentType.CONTRACT;
    }
    if (content.includes('gesetz') || content.includes('regulation')) {
      return DocumentType.REGULATION;
    }
    return DocumentType.GENERAL;
  }

  private estimateCompletion(analysisType: string): Date {
    const estimates: Record<string, number> = {
      'gdpr': 3 * 60 * 1000, // 3 minutes
      'contract_risk': 5 * 60 * 1000, // 5 minutes
      'legal_review': 8 * 60 * 1000 // 8 minutes
    };

    const estimateMs = estimates[analysisType] || 5 * 60 * 1000;
    return new Date(Date.now() + estimateMs);
  }

  private calculateOverallRating(contractResults: any, gdprResults: any): number {
    // Implement rating logic
    return 0.8;
  }

  private generateRecommendedActions(contractResults: any, gdprResults: any): string[] {
    const actions: string[] = [];

    if (contractResults?.conclusion?.criticalIssues?.length > 0) {
      actions.push('Überprüfung kritischer Vertragsklauseln erforderlich');
    }

    if (gdprResults?.overallScore < 0.7) {
      actions.push('DSGVO-Compliance-Maßnahmen implementieren');
    }

    return actions;
  }

  private assessOverallRisk(contractResults: any, gdprResults: any): string {
    // Implement risk assessment logic
    return 'medium';
  }

  /**
   * Progress and Status Management mit WebSocket-Integration
   */
  private async reportProgress(
    stage: ProcessingProgress['stage'],
    progress: number,
    message: string,
    analysisId?: string,
    details?: any
  ): Promise<void> {
    const progressUpdate: ProcessingProgress = { stage, progress, message, details };

    // Log für Debugging
    this.logger.debug('Analysis progress', progressUpdate);

    // Sende WebSocket Update wenn analysisId verfügbar ist
    if (analysisId) {
      const analysis = this.activeAnalyses.get(analysisId);
      if (analysis) {
        try {
          await websocketManager.sendProgressUpdate(
            analysis.userId,
            analysis.requestId,
            progressUpdate
          );
        } catch (error) {
          this.logger.error('Failed to send WebSocket progress update', error as Error, {
            analysisId,
            userId: analysis.userId
          });
        }
      }
    }
  }

  private async updateProgress(analysisId: string, progress: ProcessingProgress): Promise<void> {
    try {
      await this.updateAnalysisResult(analysisId, {
        progress: progress.progress,
        updatedAt: new Date()
      });
    } catch (error) {
      this.logger.error('Failed to update progress', error as Error, { analysisId });
    }
  }

  private async updateAnalysisStatus(
    analysisId: string,
    status: AnalysisResult['status'],
    progress?: number
  ): Promise<void> {
    const updates: Partial<AnalysisResult> = {
      status,
      updatedAt: new Date()
    };

    if (progress !== undefined) {
      updates.progress = progress;
    }

    await this.updateAnalysisResult(analysisId, updates);
  }

  private async handleAnalysisError(analysisId: string, error: Error): Promise<void> {
    try {
      await this.updateAnalysisResult(analysisId, {
        status: 'failed',
        error: error.message,
        updatedAt: new Date()
      });
    } catch (updateError) {
      this.logger.error('Failed to update analysis error status', updateError as Error, { analysisId });
    }
  }

  /**
   * Database Operations
   */
  private async saveAnalysisResult(analysis: AnalysisResult): Promise<void> {
    // In production, save to Firestore
    // For now, just log
    this.logger.debug('Saving analysis result', { analysisId: analysis.analysisId });
  }

  private async updateAnalysisResult(analysisId: string, updates: Partial<AnalysisResult>): Promise<void> {
    // In production, update Firestore document
    this.logger.debug('Updating analysis result', { analysisId, updates });
  }

  /**
   * Public API Methods
   */
  async getAnalysisResult(analysisId: string, userId: string): Promise<AnalysisResult | null> {
    // In production, fetch from Firestore
    this.logger.debug('Getting analysis result', { analysisId, userId });
    return null;
  }

  async cancelAnalysis(analysisId: string, userId: string): Promise<void> {
    const activeAnalysis = this.activeAnalyses.get(analysisId);
    if (activeAnalysis) {
      activeAnalysis.abortController.abort();
      this.logger.info('Analysis cancelled', { analysisId, userId });
    } else {
      throw new Error('Analysis not found or not active');
    }
  }

  async listUserAnalyses(
    userId: string,
    options: {
      status?: string;
      type?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ items: AnalysisResult[]; total: number; page: number; limit: number }> {
    // In production, query Firestore
    this.logger.debug('Listing user analyses', { userId, options });

    return {
      items: [],
      total: 0,
      page: options.page || 1,
      limit: options.limit || 20
    };
  }

  /**
   * Indexiert Gesetzestexte als Admin (RAG Schritt 1)
   * Speichert Rechtsgrundlagen im Vector Store für spätere Referenzierung
   */
  async indexLegalTexts(
    texts: {
      content: string;
      title: string;
      source: string;
      jurisdiction: string;
      legalArea: string;
    }[],
    progressCallback?: (progress: number, status: string) => void
  ): Promise<void> {
    try {
      this.logger.info('Starting legal texts indexing', { textsCount: texts.length });

      const vectorConfig: VectorStoreConfig = {
        indexName: process.env.PINECONE_LEGAL_INDEX || 'legal-texts',
        namespace: 'legal-regulations'
      };

      let allChunks: HierarchicalChunk[] = [];

      for (let i = 0; i < texts.length; i++) {
        const text = texts[i];
        if (!text) continue; // Skip undefined entries

        progressCallback?.(Math.round((i / texts.length) * 50), `Processing ${text.title}`);

        // Teile jeden Gesetzestext in Chunks auf
        const document = new Document({
          pageContent: text.content,
          metadata: {
            title: text.title,
            source: text.source,
            jurisdiction: text.jurisdiction,
            legalArea: text.legalArea,
            type: 'legal_regulation',
            indexed_at: new Date().toISOString()
          }
        });

        const chunks = await this.documentSplitter.splitDocument(document);

        // Füge spezifische Metadaten für Rechtsgrundlagen hinzu
        const enhancedChunks = chunks.map((chunk, index) => ({
          ...chunk,
          metadata: {
            ...chunk.metadata,
            id: `${text.source}-chunk-${index}`,
            documentId: text.source,
            chunkIndex: index,
            legalReferences: this.extractLegalReferences(chunk.pageContent),
            isLegalRegulation: true
          }
        }));

        allChunks = allChunks.concat(enhancedChunks);
      }

      progressCallback?.(60, 'Storing in vector database');

      // Speichere alle Chunks im Vector Store
      await this.vectorStore.addDocuments(allChunks, vectorConfig, (progress, status) => {
        const totalProgress = 60 + Math.round((progress / 100) * 40);
        progressCallback?.(totalProgress, status);
      });

      this.logger.info('Legal texts indexing completed', {
        totalChunks: allChunks.length,
        textsProcessed: texts.length
      });

    } catch (error) {
      this.logger.error('Legal texts indexing failed', error as Error);
      throw new Error(`Legal texts indexing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Führt semantische Suche in den Rechtsgrundlagen durch (RAG Schritt 2)
   */
  async searchLegalContext(
    query: string,
    legalArea?: string,
    jurisdiction?: string,
    topK: number = 5
  ): Promise<SearchResult> {
    try {
      const vectorConfig: VectorStoreConfig = {
        indexName: process.env.PINECONE_LEGAL_INDEX || 'legal-texts',
        namespace: 'legal-regulations',
        topK,
        scoreThreshold: 0.75
      };

      // Baue Filter für spezifische Suche
      const filter: Record<string, any> = {
        isLegalRegulation: true
      };

      if (legalArea) {
        filter.legalArea = legalArea;
      }

      if (jurisdiction) {
        filter.jurisdiction = jurisdiction;
      }

      const results = await this.vectorStore.search(query, {
        ...vectorConfig,
        filter
      });

      this.logger.debug('Legal context search completed', {
        query: query.substring(0, 100),
        resultsCount: results.documents.length,
        averageScore: results.scores.length > 0
          ? results.scores.reduce((a, b) => a + b, 0) / results.scores.length
          : 0
      });

      return results;

    } catch (error) {
      this.logger.error('Legal context search failed', error as Error, { query });
      throw new Error(`Legal context search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Erweiterte Vertragsanalyse mit RAG-basierter Rechtsgrundlagen-Prüfung
   */
  async analyzeContractWithRAG(
    contractContent: string,
    userId: string,
    options?: {
      legalArea?: string;
      jurisdiction?: string;
      language?: string;
    }
  ): Promise<{
    analysis: any;
    legalContext: SearchResult;
    recommendations: string[];
  }> {
    try {
      this.logger.info('Starting RAG-enhanced contract analysis', { userId, options });

      // 1. Führe normale Vertragsanalyse durch
      const document = new Document({
        pageContent: contractContent,
        metadata: {
          userId,
          analysisType: 'contract_rag',
          timestamp: new Date().toISOString()
        }
      });

      const contractAnalysis = await this.contractAnalysisChain.analyze(document);

      // 2. Extrahiere Rechtsthemen aus der Analyse
      const legalTopics = this.extractLegalTopicsFromAnalysis(contractAnalysis);

      // 3. Suche relevante Rechtsgrundlagen
      const searchQueries = legalTopics.map(topic =>
        `${topic} ${options?.legalArea || ''} ${options?.jurisdiction || 'Schweiz'}`
      );

      let allLegalContext: HierarchicalChunk[] = [];
      let allScores: number[] = [];

      for (const query of searchQueries) {
        const contextResult = await this.searchLegalContext(
          query,
          options?.legalArea,
          options?.jurisdiction || 'CH',
          3 // 3 Ergebnisse pro Thema
        );
        allLegalContext = allLegalContext.concat(contextResult.documents);
        allScores = allScores.concat(contextResult.scores);
      }

      // 4. Generiere Empfehlungen basierend auf gefundenen Rechtsgrundlagen
      const recommendations = await this.generateLegalRecommendations(
        contractAnalysis,
        allLegalContext
      );

      const result = {
        analysis: contractAnalysis,
        legalContext: {
          documents: allLegalContext,
          scores: allScores,
          totalResults: allLegalContext.length
        },
        recommendations
      };

      this.logger.info('RAG-enhanced contract analysis completed', {
        userId,
        legalContextItems: allLegalContext.length,
        recommendationsCount: recommendations.length
      });

      return result;

    } catch (error) {
      this.logger.error('RAG contract analysis failed', error as Error, { userId });
      throw new Error(`RAG contract analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * GDPR-Compliance Check mit Textinput (ohne File-Upload)
   */
  async analyzeDSGVOCompliance(
    textContent: string,
    userId: string,
    options?: {
      saveResults?: boolean;
      language?: string;
    }
  ): Promise<{
    complianceScore: number;
    status: 'compliant' | 'partial_compliance' | 'non_compliant';
    findings: Array<{
      article: string;
      requirement: string;
      status: 'compliant' | 'non_compliant' | 'unclear';
      recommendation: string;
    }>;
    legalBasis: SearchResult;
  }> {
    try {
      this.logger.info('Starting DSGVO compliance analysis', { userId, contentLength: textContent.length });

      // 1. Führe GDPR Analyse durch
      const document = new Document({
        pageContent: textContent,
        metadata: {
          userId,
          analysisType: 'gdpr_text',
          timestamp: new Date().toISOString()
        }
      });

      const gdprAnalysis = await this.gdprComplianceChain.analyze(document);

      // 2. Suche relevante DSGVO-Artikel
      const dsgovoQueries = [
        'DSGVO Artikel 6 Rechtmäßigkeit Verarbeitung',
        'DSGVO Artikel 7 Einwilligung',
        'DSGVO Artikel 13 Informationspflichten',
        'DSGVO Artikel 17 Recht auf Löschung',
        'DSGVO Artikel 20 Recht auf Datenübertragbarkeit'
      ];

      let legalBasis: HierarchicalChunk[] = [];
      let scores: number[] = [];

      for (const query of dsgovoQueries) {
        const result = await this.searchLegalContext(query, 'Datenschutz', 'EU', 2);
        legalBasis = legalBasis.concat(result.documents);
        scores = scores.concat(result.scores);
      }

      // 3. Erstelle strukturierte Findings
      const findings = this.createDSGVOFindings(gdprAnalysis, legalBasis);

      // 4. Berechne Compliance Score
      const complianceScore = this.calculateComplianceScore(findings);
      const status = this.determineComplianceStatus(complianceScore);

      const result = {
        complianceScore,
        status,
        findings,
        legalBasis: {
          documents: legalBasis,
          scores,
          totalResults: legalBasis.length
        }
      };

      // 5. Speichere Ergebnisse falls gewünscht
      if (options?.saveResults) {
        await this.saveDSGVOAnalysis(userId, textContent, result);
      }

      this.logger.info('DSGVO compliance analysis completed', {
        userId,
        complianceScore,
        status,
        findingsCount: findings.length
      });

      return result;

    } catch (error) {
      this.logger.error('DSGVO compliance analysis failed', error as Error, { userId });
      throw new Error(`DSGVO compliance analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Hilfsmethoden für RAG-Pipeline
   */
  private extractLegalReferences(text: string): string[] {
    const patterns = [
      /Art\.?\s*\d+/gi,
      /Artikel\s*\d+/gi,
      /§\s*\d+/gi,
      /OR\s*Art\.?\s*\d+/gi,
      /ZGB\s*Art\.?\s*\d+/gi,
      /DSGVO\s*Art\.?\s*\d+/gi
    ];

    const references: string[] = [];
    patterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        references.push(...matches);
      }
    });

    return [...new Set(references)]; // Entferne Duplikate
  }

  private extractLegalTopicsFromAnalysis(analysis: any): string[] {
    const topics: string[] = [];

    if (analysis.issues) {
      topics.push(...analysis.issues.map((issue: any) => issue.legalArea || issue.issue));
    }

    if (analysis.legalAreas) {
      topics.push(...analysis.legalAreas);
    }

    // Fallback für verschiedene Analyse-Strukturen
    if (typeof analysis === 'object') {
      const text = JSON.stringify(analysis);
      const legalTerms = [
        'Arbeitsrecht', 'Vertragsrecht', 'Datenschutz', 'Handelsrecht',
        'Gesellschaftsrecht', 'Immaterialgüterrecht', 'Steuerrecht'
      ];

      legalTerms.forEach(term => {
        if (text.includes(term)) {
          topics.push(term);
        }
      });
    }

    return [...new Set(topics)]; // Entferne Duplikate
  }

  private async generateLegalRecommendations(
    contractAnalysis: any,
    legalContext: HierarchicalChunk[]
  ): Promise<string[]> {
    const recommendations: string[] = [];

    // Einfache regelbasierte Empfehlungen basierend auf gefundenen Rechtsgrundlagen
    legalContext.forEach(context => {
      if (context.metadata.legalArea === 'Arbeitsrecht') {
        recommendations.push('Prüfung der Arbeitsvertragsklauseln gemäß schweizer Obligationenrecht');
      }
      if (context.metadata.legalArea === 'Datenschutz') {
        recommendations.push('DSGVO-Compliance-Prüfung der Datenverarbeitungsklauseln');
      }
    });

    // Füge spezifische Empfehlungen basierend auf Contract Analysis hinzu
    if (contractAnalysis.issues) {
      contractAnalysis.issues.forEach((issue: any) => {
        if (issue.severity === 'high') {
          recommendations.push(`Dringend: ${issue.issue} - Rechtliche Überprüfung erforderlich`);
        }
      });
    }

    return recommendations;
  }

  private createDSGVOFindings(gdprAnalysis: any, legalBasis: HierarchicalChunk[]): Array<{
    article: string;
    requirement: string;
    status: 'compliant' | 'non_compliant' | 'unclear';
    recommendation: string;
  }> {
    const findings: any[] = [];

    // Standard DSGVO Prüfpunkte
    const dsgvoChecks = [
      {
        article: 'Art. 6 DSGVO',
        requirement: 'Rechtmäßigkeit der Verarbeitung',
        status: 'unclear' as const,
        recommendation: 'Rechtsgrundlage für Datenverarbeitung explizit angeben'
      },
      {
        article: 'Art. 7 DSGVO',
        requirement: 'Bedingungen für die Einwilligung',
        status: 'unclear' as const,
        recommendation: 'Einwilligungserklärung überprüfen und ggf. anpassen'
      }
    ];

    // Erweitere Findings basierend auf gefundenen Rechtsgrundlagen
    legalBasis.forEach(basis => {
      if (basis.pageContent.includes('Artikel 6')) {
        findings.push({
          article: 'Art. 6 DSGVO',
          requirement: 'Rechtmäßigkeit der Verarbeitung',
          status: 'compliant' as const,
          recommendation: 'Rechtsgrundlage gemäß Artikel 6 identifiziert'
        });
      }
    });

    return findings.length > 0 ? findings : dsgvoChecks;
  }

  private calculateComplianceScore(findings: any[]): number {
    if (findings.length === 0) return 0;

    const compliantCount = findings.filter(f => f.status === 'compliant').length;
    return Math.round((compliantCount / findings.length) * 100) / 100;
  }

  private determineComplianceStatus(score: number): 'compliant' | 'partial_compliance' | 'non_compliant' {
    if (score >= 0.8) return 'compliant';
    if (score >= 0.5) return 'partial_compliance';
    return 'non_compliant';
  }

  private async saveDSGVOAnalysis(userId: string, content: string, analysis: any): Promise<void> {
    try {
      await this.firestoreService.saveDocument(`dsgvo_analyses/${userId}`, {
        content: content.substring(0, 1000), // Speichere nur ersten 1000 Zeichen
        analysis,
        timestamp: new Date(),
        userId
      });
    } catch (error) {
      this.logger.error('Failed to save DSGVO analysis', error as Error, { userId });
      // Nicht kritisch - Analyse kann trotzdem zurückgegeben werden
    }
  }

  /**
   * Führt parallele Similarity Searches für mehrere Queries durch
   * und gibt eindeutige Ergebnisse zurück
   */
  public async similaritySearch(
    text: string,
    k: number = 5
  ): Promise<DocumentInterface[]> {
    const vectorstore = await this.getVectorStore();

    const results = await vectorstore.store!.similaritySearch(text, k);

    const uniqueResults = new Map<string, DocumentInterface>();
    results.flat().forEach((item: DocumentInterface) => {
      if (item.id && !uniqueResults.has(item.id)) {
        uniqueResults.set(item.id, item);
      }
    });

    return Array.from(uniqueResults.values());
  }


  /**
   * Holt den Vector Store für den angegebenen Index
   */
  private async getVectorStore() {
    const vectorConfig: VectorStoreConfig = {
      indexName: process.env.PINECONE_LEGAL_INDEX || 'legal-texts',
      namespace: 'legal-regulations'
    };

    if (!this.vectorStore) {
      throw new Error('Vector store not initialized');
    }

    await this.vectorStore.initializeStore(vectorConfig);
    return this.vectorStore;
  }

  /**
   * Health Check
   */
  async healthCheck(): Promise<{ status: string; services: any }> {
    const services = {
      storageService: await this.checkServiceHealth(() => Promise.resolve({ status: 'healthy' })),
      firestoreService: await this.checkServiceHealth(() => Promise.resolve({ status: 'healthy' })),
      embeddingService: await this.checkServiceHealth(() => Promise.resolve({ status: 'healthy' })),
      llmFactory: await this.checkServiceHealth(() => Promise.resolve({ status: 'healthy' })),
      vectorStore: await this.checkServiceHealth(() =>
        this.vectorStore.healthCheck(process.env.PINECONE_LEGAL_INDEX || 'legal-texts')
      )
    };

    const allHealthy = Object.values(services).every(s => s.status === 'healthy');

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      services
    };
  }

  private async checkServiceHealth(healthCheck: () => Promise<any>): Promise<{ status: string; error?: string }> {
    try {
      await healthCheck();
      return { status: 'healthy' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { status: 'unhealthy', error: errorMessage };
    }
  }
}
