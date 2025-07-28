import { Request, Response, NextFunction } from 'express';
import { BaseController } from './BaseController';
import { Logger } from '../utils/logger';

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
      await this.validateFileUpload(contentType, size);

      // Check user storage quota
      await this.checkStorageQuota(userId, size);

      // Generate upload URL and document ID
      const documentId = await this.generateDocumentId();
      const uploadUrl = await this.generateUploadUrl(documentId, fileName, contentType);

      // Create document record
      await this.createDocumentRecord(userId, documentId, {
        fileName,
        contentType,
        size,
        metadata,
        status: 'uploading'
      });

      this.sendSuccess(res, {
        documentId,
        uploadUrl,
        expiresIn: 3600 // 1 hour
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

      const document = await this.getDocumentById(documentId, userId);
      
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
        metadata: document.metadata,
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
      const pagination = this.getPaginationParams(req.query);
      const sort = this.getSortParams(req.query, ['uploadedAt', 'fileName', 'size']);
      const { status, category } = req.query;

      const documents = await this.getUserDocuments(userId, {
        ...pagination,
        ...sort,
        status: status as string,
        category: category as string
      });

      this.sendSuccess(res, {
        documents: documents.items,
        pagination: {
          page: documents.page,
          limit: documents.limit,
          total: documents.total,
          totalPages: documents.totalPages
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
      const { title, description, tags } = req.body;

      if (!documentId) {
        this.sendError(res, 400, 'Missing documentId parameter');
        return;
      }

      // Check if document exists and user has access
      const document = await this.getDocumentById(documentId, userId);
      if (!document) {
        this.sendError(res, 404, 'Document not found');
        return;
      }

      // Update document metadata
      await this.updateDocumentMetadata(documentId, userId, {
        title,
        description,
        tags,
        updatedAt: new Date().toISOString()
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
      const document = await this.getDocumentById(documentId, userId);
      if (!document) {
        this.sendError(res, 404, 'Document not found');
        return;
      }

      // Check if there are active analyses
      const activeAnalyses = await this.getActiveAnalyses(documentId);
      if (activeAnalyses.length > 0) {
        this.sendError(res, 409, 'Cannot delete document with active analyses', 
          'Please stop or complete all analyses before deleting the document');
        return;
      }

      // Delete document and associated data
      await this.deleteDocumentAndData(documentId, userId);

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

      const document = await this.getDocumentById(documentId, userId);
      if (!document) {
        this.sendError(res, 404, 'Document not found');
        return;
      }

      // Get processed content if available
      const content = await this.getDocumentProcessedContent(documentId);
      
      this.sendSuccess(res, {
        documentId,
        content: content || null,
        contentType: document.contentType,
        isProcessed: !!content
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

      const document = await this.getDocumentById(documentId, userId);
      if (!document) {
        this.sendError(res, 404, 'Document not found');
        return;
      }

      // Generate signed download URL
      const downloadUrl = await this.generateDownloadUrl(documentId);

      this.sendSuccess(res, {
        downloadUrl,
        fileName: document.fileName,
        contentType: document.contentType,
        size: document.size,
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
  // PRIVATE HELPER METHODS
  // ==========================================

  private async validateFileUpload(contentType: string, size: number): Promise<void> {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/csv'
    ];

    if (!allowedTypes.includes(contentType)) {
      throw new Error(`Unsupported file type: ${contentType}`);
    }

    const maxSize = 50 * 1024 * 1024; // 50MB
    if (size > maxSize) {
      throw new Error(`File too large. Maximum size is ${maxSize / 1024 / 1024}MB`);
    }
  }

  private async checkStorageQuota(userId: string, fileSize: number): Promise<void> {
    // TODO: Implement storage quota check
    return Promise.resolve();
  }

  private async generateDocumentId(): Promise<string> {
    return `doc_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private async generateUploadUrl(documentId: string, fileName: string, contentType: string): Promise<string> {
    // TODO: Implement signed URL generation for Storage
    return `https://storage.googleapis.com/upload/${documentId}`;
  }

  private async createDocumentRecord(userId: string, documentId: string, documentData: any): Promise<void> {
    // TODO: Implement document record creation in Firestore
    return Promise.resolve();
  }

  private async getDocumentById(documentId: string, userId: string): Promise<any> {
    // TODO: Implement document retrieval from Firestore
    return null;
  }

  private async getUserDocuments(userId: string, options: any): Promise<any> {
    // TODO: Implement user documents retrieval
    return {
      items: [],
      page: options.page,
      limit: options.limit,
      total: 0,
      totalPages: 0
    };
  }

  private async updateDocumentMetadata(documentId: string, userId: string, metadata: any): Promise<void> {
    // TODO: Implement document metadata update
    return Promise.resolve();
  }

  private async getActiveAnalyses(documentId: string): Promise<any[]> {
    // TODO: Implement active analyses check
    return [];
  }

  private async deleteDocumentAndData(documentId: string, userId: string): Promise<void> {
    // TODO: Implement document and data deletion
    return Promise.resolve();
  }

  private async getDocumentProcessedContent(documentId: string): Promise<string | null> {
    // TODO: Implement processed content retrieval
    return null;
  }

  private async generateDownloadUrl(documentId: string): Promise<string> {
    // TODO: Implement signed download URL generation
    return `https://storage.googleapis.com/download/${documentId}`;
  }
}
