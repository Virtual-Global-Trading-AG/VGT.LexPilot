import { HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
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
      await this.firestoreService.createDocument(userId, documentId, {
        fileName,
        contentType,
        size,
        uploadedAt: new Date().toISOString(),
        status: 'uploaded',
        ...metadata
      });

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
