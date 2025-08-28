import { HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { UserDocument } from '@models/index';
import { NextFunction, Request, Response } from 'express';
import { UserRepository } from '../repositories/UserRepository';
import { AnalysisService, DocumentFilters, FirestoreService, JobQueueService, PaginationOptions, SortOptions, StorageService, SwissObligationLawService, TextExtractionService } from '../services';
import { BaseController } from './BaseController';

interface DocumentUploadRequest {
  fileName: string;
  contentType: string;
  size: number;
  metadata?: {
    category?: 'contract' | 'legal_document' | 'policy' | 'terms_conditions' | 'other';
    description?: string;
    tags?: string[];
  };
}

export class DocumentController extends BaseController {
  private readonly storageService: StorageService;
  private readonly firestoreService: FirestoreService;
  private readonly analysisService: AnalysisService;
  private readonly userRepository: UserRepository;
  private readonly textExtractionService: TextExtractionService;
  private readonly swissObligationLawService: SwissObligationLawService;
  private readonly jobQueueService: JobQueueService;

  constructor() {
    super();
    this.storageService = new StorageService();
    this.firestoreService = new FirestoreService();
    this.analysisService = new AnalysisService();
    this.userRepository = new UserRepository();
    this.textExtractionService = new TextExtractionService();
    this.swissObligationLawService = new SwissObligationLawService(
      this.analysisService,
      this.firestoreService
    );
    this.jobQueueService = new JobQueueService(this.firestoreService);
  }

  /**
   * Upload document directly with base64 content
   * POST /api/documents/upload-direct
   */
  public async uploadDocumentDirect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { fileName, contentType, base64Content, metadata } = req.body;

      // Validate request
      const missingFields = this.validateRequiredFields(req.body, ['fileName', 'contentType', 'base64Content']);
      if (missingFields.length > 0) {
        this.sendError(res, 400, 'Missing required fields', `Required: ${missingFields.join(', ')}`);
        return;
      }

      this.logger.info('Direct document upload requested', {
        userId,
        fileName,
        contentType
      });

      // Calculate size from base64 content
      const buffer = Buffer.from(base64Content, 'base64');
      const size = buffer.length;

      // Validate file type and size
      this.storageService.validateFileUpload(contentType, size);

      // Check user storage quota
      const quotaInfo = await this.storageService.checkStorageQuota(userId, size);
      if (quotaInfo.available < 0) {
        this.sendError(res, 413, 'Storage quota exceeded', 
          `Upload would exceed storage limit. Used: ${(quotaInfo.used / 1024 / 1024).toFixed(2)}MB, Limit: ${(quotaInfo.limit / 1024 / 1024).toFixed(2)}MB`);
        return;
      }

      // Generate document ID and upload directly
      const documentId = this.generateDocumentId();

      const uploadResult = await this.storageService.uploadDocumentDirect(
        documentId,
        fileName,
        contentType,
        base64Content,
        userId
      );

      // Create document record
      await this.firestoreService.createDocument(userId, documentId, uploadResult.downloadUrl, {
        fileName,
        contentType,
        size,
        uploadedAt: new Date().toISOString(),
        status: 'uploaded',
        ...metadata
      });

      // Automatically trigger Swiss obligation analysis after successful upload
      try {
        // Check if analysis already exists for this document
        const existingAnalyses = await this.swissObligationLawService.getAnalysesByDocumentId(documentId, userId);

        if (existingAnalyses.length === 0) {
          // No existing analysis, create background job for analysis
          const jobId = await this.jobQueueService.createJob(
            'swiss-obligation-analysis',
            userId,
            { documentId, userId, fileName }
          );

          this.logger.info('Automatic Swiss obligation law analysis job created after upload', {
            userId,
            documentId,
            jobId,
            fileName
          });
        } else {
          this.logger.info('Swiss obligation law analysis already exists for document, skipping automatic analysis', {
            userId,
            documentId,
            fileName,
            existingAnalysesCount: existingAnalyses.length
          });
        }
      } catch (analysisError) {
        // Log error but don't fail the upload
        this.logger.error('Failed to trigger automatic Swiss obligation law analysis', analysisError as Error, {
          userId,
          documentId,
          fileName
        });
      }

      this.sendSuccess(res, {
        documentId,
        fileName,
        size,
        status: 'uploaded',
        quotaInfo: {
          used: quotaInfo.used + size,
          limit: quotaInfo.limit,
          available: quotaInfo.available - size,
          usagePercentage: Math.round(((quotaInfo.used + size) / quotaInfo.limit) * 100)
        }
      }, 'Document uploaded successfully');

    } catch (error) {
      this.logger.error('Direct document upload failed', error as Error, {
        userId: this.getUserId(req),
        fileName: req.body?.fileName
      });
      next(error);
    }
  }

  /**
   * List user documents
   * GET /api/documents
   */
  public async getDocuments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const pagination: PaginationOptions = this.getPaginationParams(req.query);
      const sortParams = this.getSortParams(req.query, ['uploadedAt', 'fileName', 'size']);
      const sort: SortOptions = {
        field: sortParams.sortBy,
        direction: sortParams.sortOrder
      };
      const filters: DocumentFilters = {
        status: req.query.status as string,
        category: req.query.category as string
      };

      const result = await this.firestoreService.getUserDocuments(userId, pagination, sort, filters);

      this.sendSuccess(res, {
        documents: result.items,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      }, 'Documents retrieved successfully');

    } catch (error) {
      this.logger.error('List documents failed', error as Error, {
        userId: this.getUserId(req),
        query: req.query
      });
      next(error);
    }
  }

  /**
   * Delete document
   * DELETE /api/documents/:documentId
   */
  public async deleteDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { documentId } = req.params;

      if (!documentId) {
        this.sendError(res, 400, 'Missing documentId parameter');
        return;
      }

      // Check if user has access to this document by checking if documentId is in user's documentIds array
      const user = await this.userRepository.findByUid(userId);
      if (!user || !user.documents || !user.documents.some(document => document.documentId === documentId)) {
        this.sendError(res, 404, 'Document not found');
        return;
      }

      // Check if there are active analyses
      const activeAnalyses = await this.firestoreService.getActiveAnalyses(documentId);
      if (activeAnalyses.length > 0) {
        this.sendError(res, 409, 'Cannot delete document with active analyses', 
          'Please stop or complete all analyses before deleting the document');
        return;
      }

      // Delete document from storage, database, and associated Swiss obligation analyses
      await Promise.all([
        this.storageService.deleteDocument(documentId, userId),
        this.firestoreService.deleteDocument(documentId, userId),
        this.swissObligationLawService.deleteAnalysesByDocumentId(documentId, userId)
      ]);

      this.sendSuccess(res, {
        documentId,
        message: 'Document deleted successfully'
      });

    } catch (error) {
      this.logger.error('Delete document failed', error as Error, {
        userId: this.getUserId(req),
        documentId: req.params.documentId
      });
      next(error);
    }
  }

  // ==========================================
  // ADDITIONAL API METHODS
  // ==========================================

  /**
   * Get user storage statistics
   * GET /api/documents/stats
   */
  public async getStorageStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);

      // Get storage statistics from both services
      const [firestoreStats, quotaInfo] = await Promise.all([
        this.firestoreService.getUserStorageStats(userId),
        this.storageService.checkStorageQuota(userId)
      ]);

      this.sendSuccess(res, {
        documents: {
          total: firestoreStats.totalDocuments,
          byStatus: firestoreStats.documentsByStatus,
          byCategory: firestoreStats.documentsByCategory
        },
        storage: {
          used: quotaInfo.used,
          limit: quotaInfo.limit,
          available: quotaInfo.available,
          usagePercentage: Math.round(quotaInfo.percentage * 100),
          usedMB: Math.round(quotaInfo.used / 1024 / 1024 * 100) / 100,
          limitMB: Math.round(quotaInfo.limit / 1024 / 1024 * 100) / 100
        }
      }, 'Storage statistics retrieved successfully');

    } catch (error) {
      this.logger.error('Get storage stats failed', error as Error, {
        userId: this.getUserId(req)
      });
      next(error);
    }
  }

  /**
   * Search documents
   * GET /api/documents/search?q=searchterm
   */
  public async searchDocuments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { q: searchText } = req.query;

      if (!searchText || typeof searchText !== 'string') {
        this.sendError(res, 400, 'Missing search query parameter "q"');
        return;
      }

      const pagination: PaginationOptions = this.getPaginationParams(req.query);
      const filters: DocumentFilters = {
        status: req.query.status as string,
        category: req.query.category as string
      };

      const result = await this.firestoreService.searchDocuments(
        userId,
        searchText,
        filters,
        pagination
      );

      this.sendSuccess(res, {
        documents: result.items,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        },
        searchQuery: searchText
      }, `Found ${result.total} documents matching "${searchText}"`);

    } catch (error) {
      this.logger.error('Search documents failed', error as Error, {
        userId: this.getUserId(req),
        query: req.query
      });
      next(error);
    }
  }

  /**
   * Get document analysis results
   * GET /api/documents/:documentId/analysis/:analysisId
   */
  public async getAnalysisResults(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { documentId, analysisId } = req.params;

      // Validate request
      if (!documentId || !analysisId) {
        this.sendError(res, 400, 'Document ID and Analysis ID are required');
        return;
      }

      // Get analysis results
      const analysis = await this.analysisService.getAnalysisResult(analysisId, userId);
      if (!analysis) {
        this.sendError(res, 404, 'Analysis not found');
        return;
      }

      // Check if analysis belongs to the document
      if (analysis.documentId !== documentId) {
        this.sendError(res, 400, 'Analysis does not belong to this document');
        return;
      }

      this.sendSuccess(res, {
        analysisId: analysis.analysisId,
        documentId: analysis.documentId,
        analysisType: analysis.analysisType,
        status: analysis.status,
        progress: analysis.progress,
        results: analysis.results,
        createdAt: analysis.createdAt,
        updatedAt: analysis.updatedAt,
        processingTimeMs: analysis.processingTimeMs
      });

    } catch (error) {
      this.logger.error('Get analysis results failed', error as Error, {
        userId: this.getUserId(req),
        documentId: req.params.documentId,
        analysisId: req.params.analysisId
      });
      next(error);
    }
  }

  /**
   * Cancel document analysis
   * DELETE /api/documents/:documentId/analysis/:analysisId
   */
  public async cancelAnalysis(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { documentId, analysisId } = req.params;

      // Validate request
      if (!documentId || !analysisId) {
        this.sendError(res, 400, 'Document ID and Analysis ID are required');
        return;
      }

      // Get analysis to verify ownership
      const analysis = await this.analysisService.getAnalysisResult(analysisId, userId);
      if (!analysis) {
        this.sendError(res, 404, 'Analysis not found');
        return;
      }

      if (analysis.documentId !== documentId) {
        this.sendError(res, 400, 'Analysis does not belong to this document');
        return;
      }

      // Cancel analysis
      await this.analysisService.cancelAnalysis(analysisId, userId);

      this.sendSuccess(res, {
        analysisId,
        documentId,
        status: 'cancelled',
        message: 'Analysis cancelled successfully'
      });

    } catch (error) {
      this.logger.error('Cancel analysis failed', error as Error, {
        userId: this.getUserId(req),
        documentId: req.params.documentId,
        analysisId: req.params.analysisId
      });
      next(error);
    }
  }

  /**
   * DSGVO Compliance Check with Text Input
   * POST /api/documents/dsgvo-check
   */
  public async checkDSGVOCompliance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { text, saveResults = false, language = 'de' } = req.body;

      if (!text || typeof text !== 'string') {
        this.sendError(res, 400, 'Text content is required');
        return;
      }

      if (text.length > 50000) {
        this.sendError(res, 400, 'Text content too long (max 50,000 characters)');
        return;
      }

      // Perform DSGVO compliance analysis
      const result = await this.analysisService.analyzeDSGVOCompliance(
        text,
        userId,
        { saveResults, language }
      );

      this.sendSuccess(res, {
        complianceScore: result.complianceScore,
        status: result.status,
        findings: result.findings,
        legalBasis: {
          foundSources: result.legalBasis.documents.length,
          sources: result.legalBasis.documents.map(doc => ({
            title: doc.metadata.title || 'DSGVO Artikel',
            source: doc.metadata.source || 'DSGVO',
            excerpt: doc.pageContent.substring(0, 150) + '...'
          }))
        },
        summary: {
          compliantFindings: result.findings.filter(f => f.status === 'compliant').length,
          nonCompliantFindings: result.findings.filter(f => f.status === 'non_compliant').length,
          unclearFindings: result.findings.filter(f => f.status === 'unclear').length,
          criticalIssues: result.findings
            .filter(f => f.status === 'non_compliant')
            .map(f => f.recommendation)
        },
        timestamp: new Date().toISOString()
      });

      this.logger.info('DSGVO compliance check completed', {
        userId,
        complianceScore: result.complianceScore,
        status: result.status,
        textLength: text.length,
        saved: saveResults
      });

    } catch (error) {
      this.logger.error('DSGVO compliance check failed', error as Error, {
        userId: this.getUserId(req),
        textLength: req.body.text?.length || 0
      });
      next(error);
    }
  }

  public async completeDSGVOCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    try {
      const userId = this.getUserId(req);
      const { question, maxSources = 5, language = 'de', includeContext = true } = req.body;

      // Input Validation
      if (!question || typeof question !== 'string') {
        this.logger.error('DSG Check: Missing or invalid question', undefined, {
          userId,
          questionType: typeof question,
          questionValue: question
        });
        this.sendError(res, 400, 'Benutzerfrage ist erforderlich');
        return;
      }

      if (question.length > 5000) {
        this.logger.error('DSG Check: Question too long', undefined, {
          userId,
          questionLength: question.length,
          maxLength: 5000
        });
        this.sendError(res, 400, 'Frage zu lang (max 5.000 Zeichen)');
        return;
      }

      if (maxSources < 1 || maxSources > 10) {
        this.logger.error('DSG Check: Invalid maxSources parameter', undefined, {
          userId,
          maxSources,
          allowedRange: '1-10'
        });
        this.sendError(res, 400, 'maxSources muss zwischen 1 und 10 liegen');
        return;
      }

      this.logger.info('Data Protection Check: Starting complete check with Swiss DSG and EU DSGVO databases', {
        userId,
        questionLength: question.length,
        maxSources,
        language,
        includeContext,
        timestamp: new Date().toISOString(),
        databaseStatus: 'Pre-populated Swiss DSG and EU DSGVO Vector Stores'
      });

      // ==========================================
      // SCHRITT 1: Optimierte Suchbegriffe für befüllte Datenschutz-Datenbanken
      // ==========================================
      const step1StartTime = Date.now();
      const chatGptQueriesPrompt = `Frage: "${question}"

KONTEXT: Es existiert bereits eine vollständig befüllte Vektor-Datenbank mit dem kompletten Datenschutzgesetz der Schweiz (DSG) und der EU-Datenschutz-Grundverordnung (DSGVO), einschließlich aller Artikel, Absätze, Bestimmungen und Kommentare.

AUFGABE: Erstelle 2-3 präzise deutsche Suchbegriffe, die optimal für die semantische Suche in beiden Datenbanken (Schweizer DSG und EU DSGVO) geeignet sind:

ANFORDERUNGEN:
- Verwende Rechtsterminologie, die sowohl im Schweizer DSG als auch in der EU DSGVO verwendet wird
- Fokussiere auf Datenschutzkonzepte, die in beiden Rechtssystemen relevant sind
- Berücksichtige sowohl schweizer als auch europäische Datenschutzterminologie
- Wähle Begriffe, die in beiden Vektor-Datenbanken hohe semantische Relevanz-Scores erzielen werden
- Nutze Begriffe, die häufig in Datenschutz-Dokumenten beider Jurisdiktionen verwendet werden

BEISPIELE für optimale Suchbegriffe:
- "Personendaten Verarbeitung" (DSG: Bearbeitung, DSGVO: Verarbeitung)
- "Auskunftsrecht Betroffene" (in beiden Gesetzen relevant)
- "Datenschutzerklärung Informationspflicht" (in beiden Gesetzen relevant)
- "Einwilligung Datenverarbeitung" (in beiden Gesetzen relevant)
- "Datensicherheit Schutzmassnahmen" (in beiden Gesetzen relevant)

Da beide Vector Databases bereits vollständig indexiert sind, optimiere die Suchbegriffe für maximale semantische Übereinstimmung mit DSG- und DSGVO-Inhalten:

Suchbegriffe:`;

      this.logger.debug('Data Protection Check Step 1: Generating optimized search queries for both DSG and DSGVO databases', {
        userId,
        promptLength: chatGptQueriesPrompt.length,
        step: 'query_generation_optimized',
        targetDatabases: 'Pre-populated Swiss DSG and EU DSGVO Vector Stores',
        databaseStatus: 'fully_indexed_and_ready',
        estimatedTokens: Math.ceil(chatGptQueriesPrompt.length / 4)
      });

      const chatGptResponse = await this.callChatGPT(chatGptQueriesPrompt);
      const step1Duration = Date.now() - step1StartTime;

      this.logger.debug('Data Protection Check Step 1: Optimized queries for DSG and DSGVO generated successfully', {
        userId,
        responseLength: chatGptResponse.length,
        duration: step1Duration,
        rawResponse: chatGptResponse.substring(0, 200) + (chatGptResponse.length > 200 ? '...' : ''),
        step: 'query_generation_completed'
      });

      // Parse Suchbegriffe aus ChatGPT Response
      const queries = chatGptResponse.split('\n')
      .map(q => q.trim().replace(/^[-*•\d+.]\s*/, '')) // Remove bullet points and numbers
      .filter(q => q.length > 0 &&
        !q.includes('Suchbegriffe:') &&
        !q.includes('BEISPIELE') &&
        !q.includes('AUFGABE') &&
        q.length > 5)
      .slice(0, 3); // Max 3 queries

      if (queries.length === 0) {
        this.logger.error('Data Protection Check Step 1: No valid search queries generated', undefined, {
          userId,
          rawResponse: chatGptResponse,
          step1Duration
        });
        this.sendError(res, 500, 'Fehler beim Generieren der Suchbegriffe');
        return;
      }

      this.logger.debug('Data Protection Check Step 1: Search queries for DSG and DSGVO parsed and validated', {
        userId,
        queriesCount: queries.length,
        queries: queries,
        step1Duration,
        targetDatabases: 'Pre-populated Swiss DSG and EU DSGVO Vector Stores',
        queryOptimization: 'multi_jurisdiction_optimized'
      });

      // ==========================================
      // SCHRITT 2: Similarity Search in Swiss DSG und EU DSGVO Vector Stores
      // ==========================================
      const step2StartTime = Date.now();
      this.logger.debug('Data Protection Check Step 2: Starting parallel similarity search in both DSG and DSGVO databases', {
        userId,
        queriesCount: queries.length,
        maxResultsPerQuery: Math.ceil(maxSources / queries.length) + 1,
        vectorStores: 'Pre-populated Swiss DSG and EU DSGVO Databases',
        databaseStatus: 'Ready, Indexed, and Optimized',
        searchStrategy: 'multi_jurisdiction_parallel_semantic_search',
        jurisdictions: ['ch', 'eu']
      });

      const allResults = await Promise.all(
        queries.map(async (query, index) => {
          const queryStartTime = Date.now();
          const resultsPerQuery = Math.ceil(maxSources / queries.length) + 1;

          this.logger.debug('Data Protection Check Step 2: Processing query in both DSG and DSGVO databases', {
            userId,
            queryIndex: index,
            query: query,
            resultsRequested: resultsPerQuery,
            timestamp: new Date().toISOString(),
            searchContext: 'Pre-populated Swiss DSG and EU DSGVO Vector Stores',
          });

          // Suche in beiden Datenbanken: Swiss DSG und EU DSGVO
          const results = await this.analysisService.similaritySearch(query, resultsPerQuery);
          const queryDuration = Date.now() - queryStartTime;

          this.logger.debug('Data Protection Check Step 2: Query results from both DSG and DSGVO databases', {
            userId,
            queryIndex: index,
            query: query,
            resultsCount: results.length,
            duration: queryDuration,
            foundArticles: results.map(r => r.metadata?.article || r.metadata?.section || 'Unknown').filter(Boolean),
            vectorDatabase: 'Pre-populated Swiss DSG',
            searchPerformance: queryDuration < 1000 ? 'excellent' : queryDuration < 3000 ? 'good' : 'slow'
          });

          return results;
        })
      );

      const step2Duration = Date.now() - step2StartTime;

      // ==========================================
      // SCHRITT 3: Eindeutige Ergebnisse aus DSG und DSGVO zusammenführen
      // ==========================================
      const uniqueResults = new Map<string, any>();
      const duplicateCount = { count: 0 };
      const foundArticles: string[] = [];
      const relevanceScores: number[] = [];
      const jurisdictionStats = { ch: 0, eu: 0 };

      allResults.flat().forEach((item: any, index) => {
        if (item.id && !uniqueResults.has(item.id) && uniqueResults.size < maxSources) {
          uniqueResults.set(item.id, item);

          // Artikel und Relevanz-Scores extrahieren
          const article = item.metadata?.article || item.metadata?.section || `Sektion-${index}`;
            const jurisdiction = (item.metadata?.jurisdiction || 'unknown').toLowerCase();

          if (article && !article.includes('Sektion-')) foundArticles.push(article);
          if (jurisdiction === 'ch') jurisdictionStats.ch++;
          if (jurisdiction === 'eu') jurisdictionStats.eu++;

          if (item.score) relevanceScores.push(item.score);

          this.logger.debug('Data Protection Check Step 2: Added unique result from multi-jurisdiction database', {
            userId,
            resultId: item.id,
            resultIndex: index,
            article: article,
            jurisdiction: jurisdiction,
            relevanceScore: item.score,
            contentPreview: item.pageContent?.substring(0, 100) + '...',
            source: `Pre-populated Vector Store`
          });
        } else if (item.id && uniqueResults.has(item.id)) {
          duplicateCount.count++;
        }
      });

      const vectorSearchResults = Array.from(uniqueResults.values());
      const avgRelevanceScore = relevanceScores.length > 0 ?
        relevanceScores.reduce((a, b) => a + b, 0) / relevanceScores.length : 0;

      this.logger.debug('Data Protection Check Step 2: Multi-jurisdiction vector search completed', {
        userId,
        totalRawResults: allResults.flat().length,
        uniqueResults: vectorSearchResults.length,
        duplicatesFiltered: duplicateCount.count,
        foundArticles: [...new Set(foundArticles)],
        jurisdictionDistribution: jurisdictionStats,
        averageRelevanceScore: avgRelevanceScore,
        step2Duration,
        databasePerformance: {
          searchTime: step2Duration,
          resultsQuality: avgRelevanceScore > 0.8 ? 'excellent' : avgRelevanceScore > 0.6 ? 'good' : 'moderate',
          databaseUtilization: 'multi_jurisdiction_optimized'
        }
      });

      if (vectorSearchResults.length === 0) {
        this.logger.warn('Data Protection Check Step 2: No results found in DSG and DSGVO databases', {
          userId,
          queries: queries,
          databaseStatus: 'Pre-populated but no matches',
          searchedJurisdictions: ['ch', 'eu'],
          possibleIssues: ['query_too_specific', 'database_content_mismatch', 'threshold_too_high']
        });

        this.sendError(res, 404, 'Keine relevanten Datenschutz-Artikel in den Datenbanken gefunden. Möglicherweise ist die Anfrage zu spezifisch.');
        return;
      }

      // ==========================================
      // SCHRITT 4: Context-Aufbereitung mit DSG und DSGVO Informationen
      // ==========================================
      const step3StartTime = Date.now();

      let contextText = '';
      if (includeContext && vectorSearchResults.length > 0) {
        contextText = vectorSearchResults
        .map((doc, index) => {
          const contentLength = Math.min(doc.pageContent.length, 300); // Längerer Context für bessere Analyse
          const shortContent = doc.pageContent.substring(0, contentLength);
          const article = doc.metadata?.article || doc.metadata?.section || 'Datenschutz-Bestimmung';
          const jurisdiction = (doc.metadata?.jurisdiction || 'unknown').toLowerCase();
          const jurisdictionLabel = jurisdiction === 'ch' ? 'DSG' : jurisdiction === 'eu' ? 'DSGVO' : 'Unbekannt';
          const articleInfo = article ? ` (${jurisdictionLabel}: ${article})` : '';
          const score = doc.score ? ` [Relevanz: ${(doc.score * 100).toFixed(1)}%]` : '';

          this.logger.debug('Data Protection Check Step 3: Processing context document from multi-jurisdiction database', {
            userId,
            docIndex: index,
            docId: doc.id,
            article: article,
            jurisdiction: jurisdiction,
            relevanceScore: doc.score,
            originalLength: doc.pageContent.length,
            includedLength: contentLength,
            metadata: doc.metadata,
            source: `Pre-populated ${jurisdiction === 'ch' ? 'Swiss DSG' : jurisdiction === 'eu' ? 'EU DSGVO' : 'Unknown'} Database`
          });

          return `${index + 1}. ${article}${score} [${jurisdictionLabel}]:\n${shortContent}${contentLength < doc.pageContent.length ? '...' : ''}`;
        })
        .join('\n\n');
      }

      this.logger.debug('Data Protection Check Step 3: Multi-jurisdiction context prepared', {
        userId,
        contextLength: contextText.length,
        documentsIncluded: vectorSearchResults.length,
        contextSources: 'Pre-populated Swiss DSG and EU DSGVO Vector Databases',
        jurisdictionDistribution: jurisdictionStats,
        includeContext,
        avgContextLength: contextText.length / Math.max(vectorSearchResults.length, 1)
      });

      // ==========================================
      // SCHRITT 5: Finale Datenschutz-Analyse mit DSG und DSGVO
      // ==========================================
      const finalAnalysisPrompt = `Benutzerfrage: "${question}"

${includeContext && contextText ? `DATENSCHUTZ-KONTEXT aus den indexierten Datenbanken (DSG Schweiz & DSGVO (EU)):
${contextText}

` : ''}AUFGABE: Analysiere die Benutzerfrage basierend auf dem Schweizer Datenschutzgesetz (DSG) und dem EU-Datenschutzgesetz (DSGVO) und gib eine strukturierte, professionelle Antwort als JSON zurück:

ANALYSE-FOKUS:
- Schweizer Dateschutzgesetz der Schweiz (DSG 2023) und EU-Datenschutz (DSGVO)
- Relevante Artikel und Bestimmungen beider Rechtssysteme
- Praktische Umsetzung in der Schweiz und EU
- Compliance-Anforderungen für beide Jurisdiktionen
- Gemeinsamkeiten und Unterschiede zwischen DSG und DSGVO

ANTWORT-STRUKTUR: Gib die Antwort als valides JSON-Objekt mit folgender Struktur zurück:

{
  "legalBasis": "Relevante Artikel des DSG und/oder DSGVO mit Bezug zur Frage",
  "dataProtectionAnswer": "Direkte, präzise Antwort zur gestellten Frage unter Berücksichtigung beider Rechtssysteme",
  "legalAssessment": {
    "status": "KONFORM | NICHT KONFORM | TEILWEISE KONFORM | UNKLARE RECHTSLAGE",
    "reasoning": "Juristische Einschätzung basierend auf DSG und DSGVO"
  },
  "recommendations": [
    "Spezifische Handlungsempfehlung 1 (DSG/DSGVO)",
    "Spezifische Handlungsempfehlung 2 (DSG/DSGVO)",
    "Spezifische Handlungsempfehlung 3 (DSG/DSGVO)"
  ],
  "importantNotes": "Besonderheiten und Unterschiede zwischen DSG und DSGVO, praktische Hinweise",
  "jurisdictionAnalysis": {
    "ch": "Spezifische Aspekte nach Schweizer DSG",
    "eu": "Spezifische Aspekte nach EU DSGVO"
  },
  "references": [
    {
      "article": "DSG Art. X / DSGVO Art. Y",
      "description": "Kurzbeschreibung des Artikels",
      "jurisdiction": "ch | eu"
    }
  ]
}

WICHTIG: Gib NUR das JSON-Objekt zurück, ohne zusätzlichen Text oder Markdown-Formatierung.
STIL: Professionell, präzise, praxisorientiert für beide Jurisdiktionen`;

      this.logger.debug('Data Protection Check Step 4: Starting comprehensive DSG and DSGVO analysis with LangChain', {
        userId,
        finalPromptLength: finalAnalysisPrompt.length,
        estimatedTokens: Math.ceil(finalAnalysisPrompt.length / 4),
        analysisContext: 'Swiss DSG and EU DSGVO with pre-populated database context',
        jurisdictionDistribution: jurisdictionStats,
        includeContext,
        contextDocuments: vectorSearchResults.length
      });

      const finalAnalysisRaw = await this.callChatGPT(finalAnalysisPrompt);
      const step3Duration = Date.now() - step3StartTime;

      // Parse JSON response from ChatGPT
      let parsedAnalysis;
      try {
        // Clean the response to extract only the JSON part
        const cleanedResponse = finalAnalysisRaw.trim();
        const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : cleanedResponse;

        parsedAnalysis = JSON.parse(jsonString);

        this.logger.debug('Data Protection Check Step 4: JSON analysis successfully parsed', {
          userId,
          rawAnalysisLength: finalAnalysisRaw.length,
          parsedStructure: Object.keys(parsedAnalysis),
          step3Duration
        });
      } catch (parseError) {
        this.logger.warn('Data Protection Check Step 4: Failed to parse JSON response, using fallback structure', {
          userId,
          parseError: parseError instanceof Error ? parseError.message : String(parseError),
          rawResponse: finalAnalysisRaw.substring(0, 200) + '...'
        });

        // Fallback structure if JSON parsing fails
        parsedAnalysis = {
          legalBasis: "Fehler beim Parsen der Antwort",
          dataProtectionAnswer: finalAnalysisRaw,
          legalAssessment: {
            status: "UNKLARE RECHTSLAGE",
            reasoning: "Die Antwort konnte nicht korrekt strukturiert werden"
          },
          recommendations: ["Bitte versuchen Sie die Anfrage erneut"],
          importantNotes: "Technischer Fehler bei der Antwortverarbeitung",
          jurisdictionAnalysis: {
            ch: "Fehler bei der Analyse",
            eu: "Fehler bei der Analyse"
          },
          references: []
        };
      }

      this.logger.debug('Data Protection Check Step 4: Comprehensive DSG and DSGVO analysis completed', {
        userId,
        analysisLength: finalAnalysisRaw.length,
        step3Duration,
        analysisQuality: finalAnalysisRaw.length > 500 ? 'comprehensive' : 'basic',
        structuredResponse: true,
        jurisdictionDistribution: jurisdictionStats
      });

      // ==========================================
      // SCHRITT 6: Response zusammenstellen
      // ==========================================
      const totalDuration = Date.now() - startTime;
      const uniqueArticles = [...new Set(foundArticles)];

      const response = {
        question: question,
        searchQueries: {
          generated: queries,
          count: queries.length,
          optimizedFor: 'Pre-populated Swiss DSG and EU DSGVO Vector Databases'
        },
        foundSources: {
          count: vectorSearchResults.length,
          laws: 'Schweizer Datenschutzgesetz (DSG) und EU-Datenschutz-Grundverordnung (DSGVO)',
          articles: uniqueArticles,
          averageRelevance: avgRelevanceScore,
          jurisdictionDistribution: jurisdictionStats,
          database: {
            type: 'Pre-populated Multi-Jurisdiction Vector Store',
            content: 'Complete Swiss DSG and EU DSGVO',
            status: 'Fully Indexed and Optimized'
          },
          sources: vectorSearchResults.map((doc, index) => {
            const article = doc.metadata?.article || doc.metadata?.section || 'Datenschutz-Bestimmung';
            const jurisdiction = doc.metadata?.jurisdiction || 'unknown';
            const lawLabel = jurisdiction === 'ch' ? 'Swiss DSG' : jurisdiction === 'eu' ? 'EU DSGVO' : 'Unknown';

            this.logger.debug('Data Protection Check: Preparing multi-jurisdiction source for response', {
              userId,
              sourceIndex: index,
              sourceId: doc.id,
              article: article,
              jurisdiction: jurisdiction,
              contentLength: doc.pageContent.length,
              relevanceScore: doc.score
            });

            return {
              content: doc.pageContent,
              metadata: {
                ...doc.metadata,
                law: lawLabel,
                article: article,
                jurisdiction: jurisdiction,
                relevanceScore: doc.score,
                source: 'Pre-populated Multi-Jurisdiction Vector Database'
              },
              id: doc.id
            };
          })
        },
        legalBasis: parsedAnalysis.legalBasis,
        dataProtectionAnswer: parsedAnalysis.dataProtectionAnswer,
        legalAssessment: parsedAnalysis.legalAssessment,
        recommendations: parsedAnalysis.recommendations,
        importantNotes: parsedAnalysis.importantNotes,
        jurisdictionAnalysis: parsedAnalysis.jurisdictionAnalysis,
        references: parsedAnalysis.references,
        timestamp: new Date().toISOString(),
        performance: {
          totalDuration,
          step1Duration, // Query generation
          step2Duration, // Vector search
          step3Duration, // Final analysis
          breakdown: {
            queryGeneration: `${step1Duration}ms`,
            databaseSearch: `${step2Duration}ms`,
            finalAnalysis: `${step3Duration}ms`,
            total: `${totalDuration}ms`
          },
          efficiency: totalDuration < 10000 ? 'excellent' : totalDuration < 20000 ? 'good' : 'moderate'
        },
        processingSteps: {
          step1: `Multi-jurisdiktionale Suchbegriffe für DSG und DSGVO Vektor-DBs optimiert (${queries.length} queries)`,
          step2: `${vectorSearchResults.length} relevante Artikel aus DSG und DSGVO Datenbanken gefunden (Swiss: ${jurisdictionStats.ch}, EU: ${jurisdictionStats.eu})`,
          step3: 'Vollständige Datenschutz-Compliance-Analyse für DSG und DSGVO erstellt'
        },
        legalContext: {
          jurisdictions: ['Switzerland', 'European Union'],
          laws: 'Schweizer Datenschutzgesetz (DSG) und EU-Datenschutz-Grundverordnung (DSGVO)',
          frameworks: ['Swiss Data Protection Law', 'EU General Data Protection Regulation'],
          effectiveDates: {
            ch: '2023-09-01',
            eu: '2018-05-25'
          },
          vectorDatabase: {
            name: 'Multi-Jurisdiction Data Protection Vector Store',
            status: 'Pre-populated and Fully Indexed',
            content: 'Complete Swiss DSG and EU DSGVO with Articles and Commentary',
            articlesFound: uniqueArticles.length,
            jurisdictionDistribution: jurisdictionStats,
            searchOptimization: 'Multi-jurisdiction query generation'
          }
        },
        langchainIntegration: {
          model: 'gpt-4',
          framework: 'LangChain',
          version: '0.3.67',
          totalTokensEstimated: Math.ceil((chatGptQueriesPrompt.length + finalAnalysisPrompt.length) / 4),
          databaseIntegration: {
            type: 'Pre-populated Multi-Jurisdiction Vector Store',
            searchMethod: 'Semantic Similarity',
            optimization: 'DSG and DSGVO specific'
          }
        },
        config: {
          maxSources,
          language,
          includeContext,
          databaseOptimized: true
        }
      };

      this.sendSuccess(res, response);

      this.logger.info('Data Protection Check: Complete DSG and DSGVO check with multi-jurisdiction database finished successfully', {
        userId,
        totalDuration,
        questionLength: question.length,
        queriesGenerated: queries.length,
        sourcesFound: vectorSearchResults.length,
        articlesFound: uniqueArticles,
        jurisdictionDistribution: jurisdictionStats,
        analysisLength: finalAnalysisRaw.length,
        responseSize: JSON.stringify(response).length,
        averageRelevance: avgRelevanceScore,
        performance: {
          step1: step1Duration,
          step2: step2Duration,
          step3: step3Duration,
          total: totalDuration,
          efficiency: totalDuration < 10000 ? 'excellent' : 'moderate'
        },
        databaseUtilization: {
          type: 'Pre-populated Multi-Jurisdiction Vector Store',
          performance: 'optimized',
          contentMatch: 'dsg_and_dsgvo_specific',
          jurisdictions: ['ch', 'eu']
        }
      });

    } catch (error) {
      const errorDuration = Date.now() - startTime;

      this.logger.error('Data Protection Check: Complete DSG and DSGVO check with multi-jurisdiction database failed', error as Error, {
        userId: this.getUserId(req),
        questionLength: req.body.question?.length || 0,
        errorAfter: errorDuration,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        databaseStatus: 'Pre-populated Multi-Jurisdiction DSG and DSGVO Vector Store',
        jurisdictions: ['ch', 'eu'],
        possibleCauses: [
          'vector_database_connection_failed',
          'chatgpt_api_error',
          'search_query_generation_failed',
          'database_content_mismatch',
          'multi_jurisdiction_search_failed'
        ]
      });

      // Detaillierte Fehlermeldungen für besseres Debugging
      if (error instanceof Error) {
        if (error.message.includes('OPENAI_API_KEY')) {
          this.sendError(res, 500, 'OpenAI API-Konfiguration fehlt');
        } else if (error.message.includes('PINECONE') || error.message.includes('vector')) {
          this.sendError(res, 500, 'Fehler beim Zugriff auf die Datenschutz-Datenbanken');
        } else if (error.message.includes('timeout')) {
          this.sendError(res, 504, 'Anfrage-Timeout - bitte versuchen Sie es erneut');
        } else {
          this.sendError(res, 500, 'Fehler bei der Datenschutz-Analyse');
        }
      } else {
        this.sendError(res, 500, 'Unerwarteter Fehler bei der Datenschutz-Analyse');
      }

      next(error);
    }
  }

  /**
   * Get document content as text by documentId
   * GET /api/documents/:documentId/text
   */
  public async getDocumentAsText(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { documentId } = req.params;

      if (!documentId) {
        this.sendError(res, 400, 'Missing required parameter', 'documentId is required');
        return;
      }

      this.logger.info('Document text extraction requested', {
        userId,
        documentId
      });

      // Get document metadata from Firestore
      const document = await this.firestoreService.getDocument(documentId, userId);

      if (!document) {
        this.sendError(res, 404, 'Document not found', 'Document not found or access denied');
        return;
      }

      // Get document content from storage
      const documentBuffer = await this.storageService.getDocumentContent(
        documentId,
        document.fileName,
        userId
      );

      // Extract text from document
      const extractedText = await this.textExtractionService.extractText(
        documentBuffer,
        document.contentType,
        document.fileName
      );

      // Clean and normalize the text
      const cleanedText = extractedText; // this.textExtractionService.cleanText(extractedText);

      // Replace specific texts from metadata or use generic replacement
      let sanitizedText: string;
      if (document.anonymizedKeywords?.length) {
        sanitizedText = this.textExtractionService.replaceSpecificTexts(cleanedText, document.anonymizedKeywords);
      } else {
        this.logger.info('No anonymized keywords found, use unanonymized text', { cleanedTextLength: cleanedText.length});
        sanitizedText = cleanedText;
      }

      this.logger.info('Document text extraction and sanitization completed', {
        userId,
        documentId,
        fileName: document.fileName,
        contentType: document.contentType,
        originalLength: extractedText.length,
        cleanedLength: cleanedText.length,
        sanitizedLength: sanitizedText.length
      });

      this.sendSuccess(res, {
        documentId,
        fileName: document.fileName,
        contentType: document.contentType,
        size: document.size,
        text: sanitizedText,
        textLength: sanitizedText.length,
        extractedAt: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to extract document text', error as Error, {
        userId: this.getUserId(req),
        documentId: req.params.documentId
      });

      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          this.sendError(res, 404, 'Document not found', error.message);
        } else if (error.message.includes('Unsupported content type')) {
          this.sendError(res, 400, 'Unsupported file type', error.message);
        } else {
          this.sendError(res, 500, 'Text extraction failed', error.message);
        }
      } else {
        this.sendError(res, 500, 'Unexpected error during text extraction');
      }

      next(error);
    }
  }

  /**
   * Analyze document against Swiss obligation law (Background Processing)
   * POST /api/documents/:documentId/analyze-swiss-obligation-law
   */
  public async analyzeSwissObligationLaw(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { documentId } = req.params;

      if (!documentId) {
        this.sendError(res, 400, 'Missing required parameter', 'documentId is required');
        return;
      }

      this.logger.info('Swiss obligation law analysis requested', {
        userId,
        documentId
      });

      // Verify document exists and user has access
      const document = await this.firestoreService.getDocument(documentId, userId);

      if (!document) {
        this.sendError(res, 404, 'Document not found', 'Document not found or access denied');
        return;
      }

      // Check if analysis already exists for this document and delete old ones
      const existingAnalyses = await this.swissObligationLawService.getAnalysesByDocumentId(documentId, userId);

      if (existingAnalyses.length > 0) {
        this.logger.info('Existing analysis found, deleting old analysis before creating new one', {
          userId,
          documentId,
          existingAnalysesCount: existingAnalyses.length
        });

        // Delete existing analyses
        await this.swissObligationLawService.deleteAnalysesByDocumentId(documentId, userId);

        this.logger.info('Old analyses deleted successfully', {
          userId,
          documentId,
          deletedCount: existingAnalyses.length
        });
      }

      // Create background job for analysis
      const jobId = await this.jobQueueService.createJob(
        'swiss-obligation-analysis',
        userId,
        { documentId, userId, fileName: document.fileName }
      );

      this.logger.info('Swiss obligation law analysis job created', {
        userId,
        documentId,
        jobId
      });

      // Return immediately with job ID
      this.sendSuccess(res, {
        jobId,
        documentId,
        status: 'processing',
        message: 'Analysis started in background. You will receive a notification when completed.'
      }, 'Swiss obligation law analysis started successfully');

    } catch (error) {
      this.logger.error('Swiss obligation law analysis job creation failed', error as Error, {
        userId: this.getUserId(req),
        documentId: req.params.documentId
      });

      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          this.sendError(res, 404, 'Document not found', error.message);
        } else if (error.message.includes('Unsupported content type')) {
          this.sendError(res, 400, 'Unsupported file type', error.message);
        } else {
          this.sendError(res, 500, 'Swiss obligation law analysis failed', error.message);
        }
      } else {
        this.sendError(res, 500, 'Unexpected error during Swiss obligation law analysis');
      }

      next(error);
    }
  }

  /**
   * Get Swiss obligation law analysis result
   * GET /api/documents/swiss-obligation-analysis/:analysisId
   */
  public async getSwissObligationAnalysis(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { analysisId } = req.params;

      if (!analysisId) {
        this.sendError(res, 400, 'Missing required parameter', 'analysisId is required');
        return;
      }

      this.logger.info('Swiss obligation law analysis result requested', {
        userId,
        analysisId
      });

      const analysisResult = await this.swissObligationLawService.getAnalysisResult(analysisId, userId);

      if (!analysisResult) {
        this.sendError(res, 404, 'Analysis not found', 'Analysis not found or access denied');
        return;
      }

      this.sendSuccess(res, analysisResult, 'Swiss obligation law analysis result retrieved successfully');

    } catch (error) {
      this.logger.error('Failed to get Swiss obligation law analysis result', error as Error, {
        userId: this.getUserId(req),
        analysisId: req.params.analysisId
      });

      this.sendError(res, 500, 'Failed to retrieve analysis result');
      next(error);
    }
  }

  /**
   * List user's Swiss obligation law analyses
   * GET /api/documents/swiss-obligation-analyses
   */
  public async listSwissObligationAnalyses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const limit = parseInt(req.query.limit as string) || 10;

      this.logger.info('Swiss obligation law analyses list requested', {
        userId,
        limit
      });

      const analyses = await this.swissObligationLawService.listUserAnalyses(userId, limit);

      this.sendSuccess(res, {
        analyses: analyses.map(analysis => ({
          analysisId: analysis.analysisId,
          documentId: analysis.documentId,
          documentContext: {
            documentType: analysis.documentContext.documentType,
            businessDomain: analysis.documentContext.businessDomain
          },
          overallCompliance: analysis.overallCompliance,
          sectionCount: analysis.sections.length,
          createdAt: analysis.createdAt.toISOString(),
          completedAt: analysis.completedAt?.toISOString()
        })),
        total: analyses.length
      }, 'Swiss obligation law analyses retrieved successfully');

    } catch (error) {
      this.logger.error('Failed to list Swiss obligation law analyses', error as Error, {
        userId: this.getUserId(req)
      });

      this.sendError(res, 500, 'Failed to retrieve analyses list');
      next(error);
    }
  }

  /**
   * Helper method to get user document information including downloadUrl
   */
  private async getUserDocumentInfo(documentId: string, userId: string): Promise<UserDocument | null> {
    try {
      const user = await this.userRepository.findByUid(userId);
      if (!user || !user.documents) {
        return null;
      }

      const document = user.documents.find(doc => doc.documentId === documentId);
      return document || null;
    } catch (error) {
      this.logger.error('Failed to get user document info', error as Error, {
        documentId,
        userId
      });
      return null;
    }
  }

  /**
   * List shared Swiss obligation law analyses for lawyers
   * GET /api/documents/swiss-obligation-analyses-shared
   */
  public async listSharedSwissObligationAnalyses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const limit = parseInt(req.query.limit as string) || 10;

      this.logger.info('Shared Swiss obligation law analyses list requested', {
        userId,
        limit
      });

      const analyses = await this.swissObligationLawService.listSharedAnalyses(userId, limit);

      // For each analysis, fetch the corresponding document information to get downloadUrl
      const analysesWithDocuments = await Promise.all(
        analyses.map(async (analysis) => {
          try {
            // Get document information from the original document owner
            const documentInfo = await this.getUserDocumentInfo(analysis.documentId, analysis.userId);

            return {
              analysisId: analysis.analysisId,
              documentId: analysis.documentId,
              documentContext: analysis.documentContext,
              sections: analysis.sections.map(section => ({
                sectionId: section.sectionId,
                title: section.sectionContent,
                isCompliant: section.complianceAnalysis?.isCompliant || false,
                confidence: section.complianceAnalysis?.confidence || 0,
                violationCount: section.complianceAnalysis?.violations?.length || 0,
                violations: section.complianceAnalysis?.violations || [],
                reasoning: section.complianceAnalysis?.reasoning || '',
                recommendations: section.complianceAnalysis.recommendations || [],
                findings: section.findings || [],
              })),
              overallCompliance: analysis.overallCompliance,
              summary: {
                totalSections: analysis.sections?.length || 0,
                compliantSections: analysis.sections?.filter(s =>
                  s.complianceAnalysis?.isCompliant === true
                ).length || 0,
                totalViolations: analysis.sections?.reduce((sum, s) =>
                  sum + (s.complianceAnalysis?.violations?.length || 0), 0
                ) || 0,
              },
              createdAt: analysis.createdAt.toISOString(),
              completedAt: analysis.completedAt?.toISOString(),
              // Include document information for lawyers to access the document
              document: documentInfo ? {
                downloadUrl: documentInfo.downloadUrl,
                documentMetadata: documentInfo.documentMetadata
              } : null
            };
          } catch (error) {
            this.logger.warn('Failed to fetch document info for shared analysis', {
              analysisId: analysis.analysisId,
              documentId: analysis.documentId,
              error: (error as Error).message
            });

            // Return analysis without document info if document fetch fails
            return {
              analysisId: analysis.analysisId,
              documentId: analysis.documentId,
              documentContext: analysis.documentContext,
              sections: analysis.sections.map(section => ({
                sectionId: section.sectionId,
                title: section.sectionContent,
                isCompliant: section.complianceAnalysis?.isCompliant || false,
                confidence: section.complianceAnalysis?.confidence || 0,
                violationCount: section.complianceAnalysis?.violations?.length || 0,
                violations: section.complianceAnalysis?.violations || [],
                reasoning: section.complianceAnalysis?.reasoning || '',
                recommendations: section.complianceAnalysis.recommendations || [],
                findings: section.findings || [],
              })),
              overallCompliance: analysis.overallCompliance,
              summary: {
                totalSections: analysis.sections?.length || 0,
                compliantSections: analysis.sections?.filter(s =>
                  s.complianceAnalysis?.isCompliant === true
                ).length || 0,
                totalViolations: analysis.sections?.reduce((sum, s) =>
                  sum + (s.complianceAnalysis?.violations?.length || 0), 0
                ) || 0,
              },
              createdAt: analysis.createdAt.toISOString(),
              completedAt: analysis.completedAt?.toISOString(),
              document: null
            };
          }
        })
      );

      this.sendSuccess(res, {
        analyses: analysesWithDocuments,
        total: analyses.length
      }, 'Shared Swiss obligation law analyses retrieved successfully');

    } catch (error) {
      this.logger.error('Failed to list shared Swiss obligation law analyses', error as Error, {
        userId: this.getUserId(req)
      });

      this.sendError(res, 500, 'Failed to retrieve shared analyses list');
      next(error);
    }
  }

  /**
   * Get Swiss obligation law analyses by document ID
   * GET /api/documents/:documentId/swiss-obligation-analyses
   */
  public async getSwissObligationAnalysesByDocumentId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { documentId } = req.params;

      if (!documentId) {
        this.sendError(res, 400, 'Missing required parameter', 'documentId is required');
        return;
      }

      this.logger.info('Swiss obligation law analyses by document ID requested', {
        userId,
        documentId
      });

      const analyses = await this.swissObligationLawService.getAnalysesByDocumentId(documentId, userId);

      this.sendSuccess(res, {
        analyses: analyses.map(analysis => ({
          analysisId: analysis.analysisId,
          documentId: analysis.documentId,
          documentContext: analysis.documentContext,
          sections: analysis.sections.map(section => ({
            sectionId: section.sectionId,
            title: section.sectionContent,
            isCompliant: section.complianceAnalysis?.isCompliant || false,
            confidence: section.complianceAnalysis?.confidence || 0,
            violationCount: section.complianceAnalysis?.violations?.length || 0,
            violations: section.complianceAnalysis?.violations || [],
            reasoning: section.complianceAnalysis?.reasoning || '',
            recommendations: section.complianceAnalysis.recommendations || [],
            findings: section.findings || [],
          })),
          overallCompliance: analysis.overallCompliance,
          summary: {
            totalSections: analysis.sections?.length || 0,
            compliantSections: analysis.sections?.filter(s => 
              s.complianceAnalysis?.isCompliant === true
            ).length || 0,
            totalViolations: analysis.sections?.reduce((sum, s) => 
              sum + (s.complianceAnalysis?.violations?.length || 0), 0
            ) || 0,
          },
          createdAt: analysis.createdAt.toISOString(),
          completedAt: analysis.completedAt?.toISOString()
        })),
        total: analyses.length
      }, 'Swiss obligation law analyses by document ID retrieved successfully');

    } catch (error) {
      this.logger.error('Failed to get Swiss obligation law analyses by document ID', error as Error, {
        userId: this.getUserId(req),
        documentId: req.params.documentId
      });

      this.sendError(res, 500, 'Failed to retrieve analyses by document ID');
      next(error);
    }
  }

  /**
   * Get job status and progress
   * GET /api/documents/jobs/:jobId
   */
  public async getJobStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { jobId } = req.params;

      if (!jobId) {
        this.sendError(res, 400, 'Missing required parameter', 'jobId is required');
        return;
      }

      this.logger.info('Job status requested', {
        userId,
        jobId
      });

      const job = await this.jobQueueService.getJob(jobId, userId);

      if (!job) {
        this.sendError(res, 404, 'Job not found', 'Job not found or access denied');
        return;
      }

      this.sendSuccess(res, {
        jobId: job.id,
        type: job.type,
        status: job.status,
        progress: job.progress || 0,
        progressMessage: job.progressMessage || '',
        result: job.result,
        error: job.error,
        createdAt: job.createdAt.toISOString(),
        startedAt: job.startedAt?.toISOString(),
        completedAt: job.completedAt?.toISOString()
      }, 'Job status retrieved successfully');

    } catch (error) {
      this.logger.error('Failed to get job status', error as Error, {
        userId: this.getUserId(req),
        jobId: req.params.jobId
      });

      this.sendError(res, 500, 'Failed to retrieve job status');
      next(error);
    }
  }

  /**
   * Get user's jobs with pagination
   * GET /api/documents/jobs
   */
  public async getUserJobs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      this.logger.info('User jobs requested', {
        userId,
        limit,
        offset
      });

      const result = await this.jobQueueService.getUserJobs(userId, limit, offset);

      this.sendSuccess(res, {
        jobs: result.jobs.map(job => ({
          jobId: job.id,
          type: job.type,
          status: job.status,
          progress: job.progress || 0,
          progressMessage: job.progressMessage || '',
          data: job.data,
          result: job.result,
          error: job.error,
          createdAt: job.createdAt.toISOString(),
          startedAt: job.startedAt?.toISOString(),
          completedAt: job.completedAt?.toISOString()
        })),
        pagination: {
          limit,
          offset,
          total: result.total,
          hasMore: offset + limit < result.total
        }
      }, 'User jobs retrieved successfully');

    } catch (error) {
      this.logger.error('Failed to get user jobs', error as Error, {
        userId: this.getUserId(req)
      });

      this.sendError(res, 500, 'Failed to retrieve user jobs');
      next(error);
    }
  }

  /**
   * Start lawyer review for Swiss obligation analysis
   * POST /api/documents/:documentId/start-lawyer-review
   */
  public async startLawyerReview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const fixedLawyerUserUiId = 'Bt1IiCfV9KgP3AaJR22d3qfzo1o2';
      const { documentId } = req.params;

      if (!documentId) {
        this.sendError(res, 400, 'Missing required parameter', 'documentId is required');
        return;
      }

      this.logger.info('Lawyer review requested', {
        userId,
        documentId
      });

      // Verify document exists and user has access
      const document = await this.firestoreService.getDocument(documentId, userId);

      if (!document) {
        this.sendError(res, 404, 'Document not found', 'Document not found or access denied');
        return;
      }

      // Find and update the linked analysis in swissObligationAnalyses collection
      const existingAnalyses = await this.swissObligationLawService.getAnalysesByDocumentId(documentId, userId);

      if (existingAnalyses.length > 0) {
        // Update the most recent analysis with lawyer review status
        const latestAnalysis = existingAnalyses[0]; // Assuming they are sorted by creation date
        await this.swissObligationLawService.updateAnalysis(latestAnalysis!.analysisId, fixedLawyerUserUiId, 'CHECK_PENDING');

        this.logger.info('Analysis status updated for lawyer review', {
          userId,
          documentId,
          analysisId: latestAnalysis!.analysisId,
          lawyerStatus: 'CHECK_PENDING'
        });
      }

      this.logger.info('Lawyer review started successfully', {
        userId,
        documentId,
        sharedUserId: fixedLawyerUserUiId
      });

      this.sendSuccess(res, {
        documentId,
        sharedUserId: fixedLawyerUserUiId,
        status: 'Prüfung durch Anwalt',
        message: 'Document has been shared with lawyer for review'
      }, 'Lawyer review started successfully');

    } catch (error) {
      this.logger.error('Failed to start lawyer review', error as Error, {
        userId: this.getUserId(req),
        documentId: req.params.documentId
      });

      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          this.sendError(res, 404, 'Document not found', error.message);
        } else {
          this.sendError(res, 500, 'Failed to start lawyer review', error.message);
        }
      } else {
        this.sendError(res, 500, 'Unexpected error during lawyer review setup');
      }

      next(error);
    }
  }

  // ==========================================
  // PRIVATE HELPER METHODS
  // ==========================================

  /**
   * Helper-Methode für LangChain ChatOpenAI Aufrufe mit detailliertem Logging
   */
  private async callChatGPT(prompt: string): Promise<string> {
    const callStartTime = Date.now();
    try {
      const openaiApiKey = process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        this.logger.error('ChatGPT Call: OpenAI API Key not configured');
        throw new Error('OpenAI API Key nicht konfiguriert');
      }

      this.logger.info('ChatGPT Call: Initializing ChatOpenAI model', {
        promptLength: prompt.length,
        estimatedTokens: Math.ceil(prompt.length / 4),
        model: 'gpt-4',
        maxTokens: 1500
      });

      // Initialisiere ChatOpenAI mit LangChain
      const chatModel = new ChatOpenAI({
        apiKey: openaiApiKey,
        model: 'gpt-4',
        temperature: 0.3,
        maxTokens: 1500,
        timeout: 60000
      });

      // Erstelle Human Message für LangChain
      const message = new HumanMessage({
        content: prompt
      });

      this.logger.info('ChatGPT Call: Sending request to OpenAI', {
        promptPreview: prompt.substring(0, 200) + (prompt.length > 200 ? '...' : ''),
        messageType: 'HumanMessage',
        timestamp: new Date().toISOString()
      });

      // Führe den API-Aufruf durch
      const response = await chatModel.invoke([message]);
      const callDuration = Date.now() - callStartTime;

      const responseContent = response.content.toString();

      this.logger.info('ChatGPT Call: Response received successfully', {
        responseLength: responseContent.length,
        duration: callDuration,
        responsePreview: responseContent.substring(0, 200) + (responseContent.length > 200 ? '...' : ''),
        tokenUsageEstimated: {
          input: Math.ceil(prompt.length / 4),
          output: Math.ceil(responseContent.length / 4),
          total: Math.ceil((prompt.length + responseContent.length) / 4)
        }
      });

      return responseContent;

    } catch (error) {
      const errorDuration = Date.now() - callStartTime;
      this.logger.error('ChatGPT Call: LangChain ChatOpenAI call failed', error as Error, {
        promptLength: prompt.length,
        duration: errorDuration,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      throw new Error('Fehler beim Aufruf der ChatOpenAI API über LangChain');
    }
  }

  private generateDocumentId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}
