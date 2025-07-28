import { Document } from 'langchain/document';
import { Logger } from '../utils/logger';
import { StorageService } from './StorageService';
import { FirestoreService } from './FirestoreService';
import { EmbeddingService, DocumentType } from './EmbeddingService';
import { LegalDocumentSplitter, HierarchicalChunk } from '../strategies/LegalDocumentSplitter';
import { ContractAnalysisChain } from '../chains/ContractAnalysisChain';
import { GDPRComplianceChain } from '../chains/GDPRComplianceChain';
import { LLMFactory } from '../factories/LLMFactory';
import { v4 as uuidv4 } from 'uuid';

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

/**
 * Service für die Integration der RAG-Pipeline mit der Dokumentenverwaltung
 * Orchestriert den gesamten Analyse-Workflow von Download bis Ergebnis-Speicherung
 */
export class AnalysisService {
  private readonly logger = Logger.getInstance();
  private readonly storageService: StorageService;
  private readonly firestoreService: FirestoreService;
  private readonly embeddingService: EmbeddingService;
  private readonly documentSplitter: LegalDocumentSplitter;
  private readonly llmFactory: LLMFactory;
  
  // Chains für verschiedene Analyse-Typen
  private readonly contractAnalysisChain: ContractAnalysisChain;
  private readonly gdprComplianceChain: GDPRComplianceChain;
  
  // Active analysis tracking
  private readonly activeAnalyses = new Map<string, {
    abortController: AbortController;
    progressCallback?: (progress: ProcessingProgress) => void;
  }>();

  constructor() {
    this.storageService = new StorageService();
    this.firestoreService = new FirestoreService();
    this.embeddingService = new EmbeddingService();
    this.documentSplitter = new LegalDocumentSplitter();
    this.llmFactory = new LLMFactory();
    
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
        progressCallback: (progress) => this.updateProgress(analysisId, progress)
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
      this.reportProgress('download', 10, 'Downloading document from storage');
      const documentContent = await this.downloadDocument(request.documentId, request.userId);
      
      if (abortSignal.aborted) throw new Error('Analysis cancelled');

      // 2. Split document into hierarchical chunks
      this.reportProgress('split', 25, 'Splitting document into chunks');
      const chunks = await this.splitDocument(documentContent, request.documentId);
      
      if (abortSignal.aborted) throw new Error('Analysis cancelled');

      // 3. Generate embeddings for chunks
      this.reportProgress('embed', 45, 'Generating embeddings');
      const embeddings = await this.generateEmbeddings(chunks, request.options?.language);
      
      if (abortSignal.aborted) throw new Error('Analysis cancelled');

      // 4. Perform analysis based on type
      this.reportProgress('analyze', 70, 'Performing legal analysis');
      const analysisResults = await this.performAnalysis(
        request.analysisType,
        chunks,
        embeddings,
        request.options
      );
      
      if (abortSignal.aborted) throw new Error('Analysis cancelled');

      // 5. Save results
      this.reportProgress('save', 90, 'Saving analysis results');
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
   * Progress and Status Management
   */
  private reportProgress(stage: ProcessingProgress['stage'], progress: number, message: string): void {
    const progressUpdate: ProcessingProgress = { stage, progress, message };
    
    // In production, this would update the database and notify via WebSocket
    this.logger.debug('Analysis progress', progressUpdate);
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
   * Health Check
   */
  async healthCheck(): Promise<{ status: string; services: any }> {
    const services = {
      storageService: await this.checkServiceHealth(() => Promise.resolve({ status: 'healthy' })),
      firestoreService: await this.checkServiceHealth(() => Promise.resolve({ status: 'healthy' })),
      embeddingService: await this.checkServiceHealth(() => Promise.resolve({ status: 'healthy' })),
      llmFactory: await this.checkServiceHealth(() => Promise.resolve({ status: 'healthy' }))
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
