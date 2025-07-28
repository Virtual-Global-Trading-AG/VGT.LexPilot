import { Request, Response, NextFunction } from 'express';
import { BaseController } from './BaseController';
import { Logger } from '../utils/logger';
import { 
  StorageService, 
  FirestoreService, 
  AnalysisService,
  DocumentMetadata,
  StorageQuotaInfo,
  PaginationOptions,
  SortOptions,
  DocumentFilters 
} from '../services';

interface DocumentUploadRequest {
  fileName: string;
  contentType: string;
  size: number;
  metadata?: {
    category?: 'contract' | 'legal_document' | 'policy' | 'other';
    description?: string;
    tags?: string[];
  };
}

export class DocumentController extends BaseController {
  private readonly storageService: StorageService;
  private readonly firestoreService: FirestoreService;
  private readonly analysisService: AnalysisService;

  constructor() {
    super();
    this.storageService = new StorageService();
    this.firestoreService = new FirestoreService();
    this.analysisService = new AnalysisService();
  }

  /**
   * Upload document
   * POST /api/documents/
   */
  public async uploadDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { fileName, contentType, size, metadata }: DocumentUploadRequest = req.body;

      // Validate request
      const missingFields = this.validateRequiredFields(req.body, ['fileName', 'contentType', 'size']);
      if (missingFields.length > 0) {
        this.sendError(res, 400, 'Missing required fields', `Required: ${missingFields.join(', ')}`);
        return;
      }

      this.logger.info('Document upload requested', {
        userId,
        fileName,
        contentType,
        size
      });

      // Validate file type and size
      this.storageService.validateFileUpload(contentType, size);

      // Check user storage quota
      const quotaInfo = await this.storageService.checkStorageQuota(userId, size);
      if (quotaInfo.available < 0) {
        this.sendError(res, 413, 'Storage quota exceeded', 
          `Upload would exceed storage limit. Used: ${(quotaInfo.used / 1024 / 1024).toFixed(2)}MB, Limit: ${(quotaInfo.limit / 1024 / 1024).toFixed(2)}MB`);
        return;
      }

      // Generate upload URL and document ID
      const documentId = this.generateDocumentId();
      const { uploadUrl, expiresAt } = await this.storageService.generateUploadUrl(
        documentId, 
        fileName, 
        contentType, 
        userId
      );

      // Create document record
      await this.firestoreService.createDocument(userId, documentId, {
        fileName,
        contentType,
        size,
        uploadedAt: new Date().toISOString(),
        status: 'uploading',
        ...metadata
      });

      this.sendSuccess(res, {
        documentId,
        uploadUrl,
        expiresAt: expiresAt.toISOString(),
        expiresIn: 3600, // 1 hour
        quotaInfo: {
          used: quotaInfo.used,
          limit: quotaInfo.limit,
          available: quotaInfo.available,
          usagePercentage: Math.round(quotaInfo.percentage * 100)
        }
      }, 'Upload URL generated successfully');

    } catch (error) {
      this.logger.error('Document upload failed', error as Error, {
        userId: this.getUserId(req),
        body: req.body
      });
      next(error);
    }
  }

  /**
   * Get document details
   * GET /api/documents/:documentId
   */
  public async getDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { documentId } = req.params;

      if (!documentId) {
        this.sendError(res, 400, 'Missing documentId parameter');
        return;
      }

      const document = await this.firestoreService.getDocument(documentId, userId);
      
      if (!document) {
        this.sendError(res, 404, 'Document not found');
        return;
      }

      this.sendSuccess(res, {
        documentId,
        fileName: document.fileName,
        contentType: document.contentType,
        size: document.size,
        status: document.status,
        uploadedAt: document.uploadedAt,
        processedAt: document.processedAt,
        category: document.category,
        description: document.description,
        tags: document.tags,
        analyses: document.analyses || []
      });

    } catch (error) {
      this.logger.error('Get document failed', error as Error, {
        userId: this.getUserId(req),
        documentId: req.params.documentId
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
   * Update document metadata
   * PUT /api/documents/:documentId
   */
  public async updateDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { documentId } = req.params;
      const { title, description, tags, category } = req.body;

      if (!documentId) {
        this.sendError(res, 400, 'Missing documentId parameter');
        return;
      }

      // Check if document exists and user has access
      const document = await this.firestoreService.getDocument(documentId, userId);
      if (!document) {
        this.sendError(res, 404, 'Document not found');
        return;
      }

      // Update document metadata
      await this.firestoreService.updateDocument(documentId, userId, {
        ...(title && { fileName: title }), // Allow renaming via title
        ...(description && { description }),
        ...(tags && { tags }),
        ...(category && { category })
      });

      this.sendSuccess(res, {
        documentId,
        message: 'Document updated successfully'
      });

    } catch (error) {
      this.logger.error('Update document failed', error as Error, {
        userId: this.getUserId(req),
        documentId: req.params.documentId,
        body: req.body
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

      // Check if document exists and user has access
      const document = await this.firestoreService.getDocument(documentId, userId);
      if (!document) {
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

      // Delete document from storage and database
      await Promise.all([
        this.storageService.deleteDocument(documentId, document.fileName, userId),
        this.firestoreService.deleteDocument(documentId, userId)
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

  /**
   * Get document content
   * GET /api/documents/:documentId/content
   */
  public async getDocumentContent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { documentId } = req.params;

      if (!documentId) {
        this.sendError(res, 400, 'Missing documentId parameter');
        return;
      }

      const document = await this.firestoreService.getDocument(documentId, userId);
      if (!document) {
        this.sendError(res, 404, 'Document not found');
        return;
      }

      // Get document content from storage
      let content: string | null = null;
      try {
        const buffer = await this.storageService.getDocumentContent(documentId, document.fileName, userId);
        content = buffer.toString('utf-8');
      } catch (error) {
        this.logger.warn('Failed to get document content from storage', {
          documentId,
          userId,
          error: (error as Error).message
        });
      }
      
      this.sendSuccess(res, {
        documentId,
        content,
        contentType: document.contentType,
        isProcessed: document.status === 'processed',
        fileName: document.fileName,
        size: document.size
      });

    } catch (error) {
      this.logger.error('Get document content failed', error as Error, {
        userId: this.getUserId(req),
        documentId: req.params.documentId
      });
      next(error);
    }
  }

  /**
   * Download document
   * GET /api/documents/:documentId/download
   */
  public async downloadDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { documentId } = req.params;

      if (!documentId) {
        this.sendError(res, 400, 'Missing documentId parameter');
        return;
      }

      const document = await this.firestoreService.getDocument(documentId, userId);
      if (!document) {
        this.sendError(res, 404, 'Document not found');
        return;
      }

      // Generate signed download URL
      const { downloadUrl, expiresAt } = await this.storageService.generateDownloadUrl(
        documentId, 
        document.fileName, 
        userId
      );

      this.sendSuccess(res, {
        downloadUrl,
        fileName: document.fileName,
        contentType: document.contentType,
        size: document.size,
        expiresAt: expiresAt.toISOString(),
        expiresIn: 3600 // 1 hour
      });

    } catch (error) {
      this.logger.error('Download document failed', error as Error, {
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
   * Update document status
   * PATCH /api/documents/:documentId/status
   */
  public async updateDocumentStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { documentId } = req.params;
      const { status } = req.body;

      if (!documentId) {
        this.sendError(res, 400, 'Missing documentId parameter');
        return;
      }

      if (!status) {
        this.sendError(res, 400, 'Missing status in request body');
        return;
      }

      const validStatuses: DocumentMetadata['status'][] = [
        'uploading', 'uploaded', 'processing', 'processed', 'error'
      ];

      if (!validStatuses.includes(status)) {
        this.sendError(res, 400, 'Invalid status', 
          `Valid statuses: ${validStatuses.join(', ')}`);
        return;
      }

      // Check if document exists and user has access
      const document = await this.firestoreService.getDocument(documentId, userId);
      if (!document) {
        this.sendError(res, 404, 'Document not found');
        return;
      }

      // Update document status
      await this.firestoreService.updateDocumentStatus(documentId, userId, status);

      this.sendSuccess(res, {
        documentId,
        status,
        message: 'Document status updated successfully'
      });

    } catch (error) {
      this.logger.error('Update document status failed', error as Error, {
        userId: this.getUserId(req),
        documentId: req.params.documentId,
        body: req.body
      });
      next(error);
    }
  }

  /**
   * Start document analysis
   * POST /api/documents/:documentId/analyze
   */
  public async analyzeDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { documentId } = req.params;
      const { analysisType, options } = req.body;

      // Validate request
      if (!documentId) {
        this.sendError(res, 400, 'Document ID is required');
        return;
      }

      if (!analysisType || !['gdpr', 'contract_risk', 'legal_review'].includes(analysisType)) {
        this.sendError(res, 400, 'Valid analysis type is required', 
          'Supported types: gdpr, contract_risk, legal_review');
        return;
      }

      // Check if document exists
      const document = await this.firestoreService.getDocument(documentId, userId);
      if (!document) {
        this.sendError(res, 404, 'Document not found');
        return;
      }

      // Check if document is processed
      if (document.status !== 'uploaded' && document.status !== 'processed') {
        this.sendError(res, 400, 'Document must be uploaded before analysis');
        return;
      }

      this.logger.info('Starting document analysis', {
        userId,
        documentId,
        analysisType,
        options
      });

      // Start analysis
      const analysisId = await this.analysisService.startAnalysis({
        documentId,
        userId,
        analysisType,
        options: {
          priority: options?.priority || 'normal',
          notifyByEmail: options?.notifyByEmail || false,
          detailedReport: options?.detailedReport || true,
          language: options?.language || 'de'
        }
      });

      this.sendSuccess(res, {
        analysisId,
        documentId,
        analysisType,
        status: 'started',
        message: 'Document analysis started successfully'
      });

      // Set status code manually
      res.status(202);

    } catch (error) {
      this.logger.error('Document analysis start failed', error as Error, {
        userId: this.getUserId(req),
        documentId: req.params.documentId,
        body: req.body
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
   * List document analyses
   * GET /api/documents/:documentId/analyses
   */
  public async getDocumentAnalyses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { documentId } = req.params;
      const { status, type, page = 1, limit = 20 } = req.query;

      // Validate request
      if (!documentId) {
        this.sendError(res, 400, 'Document ID is required');
        return;
      }

      // Check if document exists
      const document = await this.firestoreService.getDocument(documentId, userId);
      if (!document) {
        this.sendError(res, 404, 'Document not found');
        return;
      }

      // Get analyses for this document
      const analyses = await this.analysisService.listUserAnalyses(userId, {
        status: status as string,
        type: type as string,
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      });

      // Filter by documentId (in production, this would be done in the query)
      const filteredAnalyses = {
        ...analyses,
        items: analyses.items.filter(analysis => analysis.documentId === documentId)
      };

      this.sendSuccess(res, filteredAnalyses);

    } catch (error) {
      this.logger.error('Get document analyses failed', error as Error, {
        userId: this.getUserId(req),
        documentId: req.params.documentId,
        query: req.query
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
   * RAG-Enhanced Contract Analysis
   * POST /api/documents/:documentId/analyze-rag
   */
  public async analyzeContractWithRAG(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { documentId } = req.params;
      const { legalArea, jurisdiction, language } = req.body;

      if (!documentId) {
        this.sendError(res, 400, 'Document ID is required');
        return;
      }

      // Validate document ownership
      const document = await this.firestoreService.getDocument(documentId, userId);
      if (!document) {
        this.sendError(res, 404, 'Document not found');
        return;
      }

      // Download document content
      const downloadResult = await this.storageService.generateDownloadUrl(
        documentId,
        document.fileName,
        userId
      );

      const response = await fetch(downloadResult.downloadUrl);
      if (!response.ok) {
        this.sendError(res, 500, 'Failed to download document content');
        return;
      }

      const content = await response.text();

      // Perform RAG-enhanced analysis
      const result = await this.analysisService.analyzeContractWithRAG(
        content,
        userId,
        { legalArea, jurisdiction, language }
      );

      this.sendSuccess(res, {
        documentId,
        analysis: result.analysis,
        legalContext: {
          foundSources: result.legalContext.documents.length,
          averageRelevance: result.legalContext.scores.length > 0 
            ? result.legalContext.scores.reduce((a, b) => a + b, 0) / result.legalContext.scores.length 
            : 0,
          sources: result.legalContext.documents.map(doc => ({
            title: doc.metadata.title,
            source: doc.metadata.source,
            legalArea: doc.metadata.legalArea,
            excerpt: doc.pageContent.substring(0, 200) + '...'
          }))
        },
        recommendations: result.recommendations,
        timestamp: new Date().toISOString()
      });

      this.logger.info('RAG contract analysis completed', {
        userId,
        documentId,
        legalContextItems: result.legalContext.documents.length,
        recommendationsCount: result.recommendations.length
      });

    } catch (error) {
      this.logger.error('RAG contract analysis failed', error as Error, {
        userId: this.getUserId(req),
        documentId: req.params.documentId
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

  // ==========================================
  // PRIVATE HELPER METHODS
  // ==========================================

  private generateDocumentId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}
