import { Storage } from '@google-cloud/storage';
import * as admin from 'firebase-admin';
import { Logger } from '../utils/logger';
import { config } from '../config/environment';

export interface DocumentMetadata {
  userId: string;
  fileName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  processedAt?: string;
  status: 'uploading' | 'uploaded' | 'processing' | 'processed' | 'error';
  category?: 'contract' | 'legal_document' | 'policy' | 'other';
  description?: string;
  tags?: string[];
  analyses?: string[];
}

export interface StorageQuotaInfo {
  used: number;
  limit: number;
  available: number;
  percentage: number;
}

export class StorageService {
  private readonly logger = Logger.getInstance();
  private readonly storage: Storage;
  private readonly bucket: admin.storage.Bucket;

  constructor() {
    // Initialize Firebase Admin if not already done
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.firebase.projectId,
          privateKey: config.firebase.privateKey.replace(/\\n/g, '\n'),
          clientEmail: config.firebase.clientEmail,
        }),
        storageBucket: `${config.firebase.projectId}.appspot.com`
      });
    }

    this.storage = new Storage({
      projectId: config.firebase.projectId,
    });

    this.bucket = admin.storage().bucket();
  }

  /**
   * Generate a signed upload URL for document upload
   */
  async generateUploadUrl(
    documentId: string, 
    fileName: string, 
    contentType: string,
    userId: string
  ): Promise<{ uploadUrl: string; expiresAt: Date }> {
    try {
      const filePath = this.getDocumentPath(userId, documentId, fileName);
      const file = this.bucket.file(filePath);

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry

      const [uploadUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: expiresAt,
        contentType,
        extensionHeaders: {
          'x-goog-meta-user-id': userId,
          'x-goog-meta-document-id': documentId,
          'x-goog-meta-original-name': fileName
        }
      });

      this.logger.info('Generated upload URL', {
        documentId,
        userId,
        fileName,
        expiresAt: expiresAt.toISOString()
      });

      return { uploadUrl, expiresAt };
    } catch (error) {
      this.logger.error('Failed to generate upload URL', error as Error, {
        documentId,
        userId,
        fileName
      });
      throw new Error('Failed to generate upload URL');
    }
  }

  /**
   * Generate a signed download URL for document download
   */
  async generateDownloadUrl(
    documentId: string, 
    fileName: string, 
    userId: string
  ): Promise<{ downloadUrl: string; expiresAt: Date }> {
    try {
      const filePath = this.getDocumentPath(userId, documentId, fileName);
      const file = this.bucket.file(filePath);

      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        throw new Error('Document not found in storage');
      }

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry

      const [downloadUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: expiresAt,
        responseDisposition: `attachment; filename="${fileName}"`
      });

      this.logger.info('Generated download URL', {
        documentId,
        userId,
        fileName,
        expiresAt: expiresAt.toISOString()
      });

      return { downloadUrl, expiresAt };
    } catch (error) {
      this.logger.error('Failed to generate download URL', error as Error, {
        documentId,
        userId,
        fileName
      });
      throw new Error('Failed to generate download URL');
    }
  }

  /**
   * Get document content as buffer
   */
  async getDocumentContent(
    documentId: string, 
    fileName: string, 
    userId: string
  ): Promise<Buffer> {
    try {
      const filePath = this.getDocumentPath(userId, documentId, fileName);
      const file = this.bucket.file(filePath);

      const [exists] = await file.exists();
      if (!exists) {
        throw new Error('Document not found in storage');
      }

      const [content] = await file.download();

      this.logger.debug('Downloaded document content', {
        documentId,
        userId,
        fileName,
        size: content.length
      });

      return content;
    } catch (error) {
      this.logger.error('Failed to get document content', error as Error, {
        documentId,
        userId,
        fileName
      });
      throw new Error('Failed to get document content');
    }
  }

  /**
   * Delete document from storage
   */
  async deleteDocument(
    documentId: string, 
    fileName: string, 
    userId: string
  ): Promise<void> {
    try {
      const filePath = this.getDocumentPath(userId, documentId, fileName);
      const file = this.bucket.file(filePath);

      await file.delete({ ignoreNotFound: true });

      this.logger.info('Deleted document from storage', {
        documentId,
        userId,
        fileName
      });
    } catch (error) {
      this.logger.error('Failed to delete document', error as Error, {
        documentId,
        userId,
        fileName
      });
      throw new Error('Failed to delete document');
    }
  }

  /**
   * Check user storage quota
   */
  async checkStorageQuota(userId: string, additionalSize: number = 0): Promise<StorageQuotaInfo> {
    try {
      const userFolder = `users/${userId}/documents/`;
      const [files] = await this.bucket.getFiles({
        prefix: userFolder
      });

      let totalUsed = 0;
      for (const file of files) {
        const [metadata] = await file.getMetadata();
        totalUsed += parseInt(metadata.size || '0');
      }

      const limit = this.getUserStorageLimit(userId);
      const available = Math.max(0, limit - totalUsed - additionalSize);
      const percentage = (totalUsed + additionalSize) / limit;

      const quotaInfo: StorageQuotaInfo = {
        used: totalUsed,
        limit,
        available,
        percentage
      };

      this.logger.debug('Storage quota check', {
        userId,
        ...quotaInfo,
        additionalSize
      });

      return quotaInfo;
    } catch (error) {
      this.logger.error('Failed to check storage quota', error as Error, {
        userId,
        additionalSize
      });
      throw new Error('Failed to check storage quota');
    }
  }

  /**
   * Validate file upload constraints
   */
  validateFileUpload(contentType: string, size: number): void {
    const allowedTypes = config.documents.allowedTypes.map((type: string) => {
      switch (type.trim()) {
        case 'pdf':
          return 'application/pdf';
        case 'docx':
          return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        case 'doc':
          return 'application/msword';
        case 'txt':
          return 'text/plain';
        case 'md':
          return 'text/markdown';
        case 'csv':
          return 'text/csv';
        default:
          return type;
      }
    });

    if (!allowedTypes.includes(contentType)) {
      throw new Error(`Unsupported file type: ${contentType}. Allowed types: ${config.documents.allowedTypes.join(', ')}`);
    }

    const maxSize = config.documents.maxFileSizeMB * 1024 * 1024;
    if (size > maxSize) {
      throw new Error(`File too large. Maximum size is ${config.documents.maxFileSizeMB}MB, got ${(size / 1024 / 1024).toFixed(2)}MB`);
    }

    if (size === 0) {
      throw new Error('File cannot be empty');
    }
  }

  /**
   * Move document to processed folder after successful processing
   */
  async moveToProcessed(
    documentId: string, 
    fileName: string, 
    userId: string
  ): Promise<void> {
    try {
      const sourcePath = this.getDocumentPath(userId, documentId, fileName);
      const destinationPath = this.getProcessedDocumentPath(userId, documentId, fileName);

      const sourceFile = this.bucket.file(sourcePath);
      const destinationFile = this.bucket.file(destinationPath);

      await sourceFile.copy(destinationFile);
      await sourceFile.delete();

      this.logger.info('Moved document to processed folder', {
        documentId,
        userId,
        fileName,
        sourcePath,
        destinationPath
      });
    } catch (error) {
      this.logger.error('Failed to move document to processed folder', error as Error, {
        documentId,
        userId,
        fileName
      });
      throw new Error('Failed to move document to processed folder');
    }
  }

  /**
   * Get document file size and metadata
   */
  async getDocumentInfo(
    documentId: string, 
    fileName: string, 
    userId: string
  ): Promise<{ size: number; contentType: string; uploadedAt: Date }> {
    try {
      const filePath = this.getDocumentPath(userId, documentId, fileName);
      const file = this.bucket.file(filePath);

      const [metadata] = await file.getMetadata();

      return {
        size: parseInt(metadata.size || '0'),
        contentType: metadata.contentType || 'application/octet-stream',
        uploadedAt: new Date(metadata.timeCreated || Date.now())
      };
    } catch (error) {
      this.logger.error('Failed to get document info', error as Error, {
        documentId,
        userId,
        fileName
      });
      throw new Error('Failed to get document info');
    }
  }

  // ==========================================
  // PRIVATE HELPER METHODS
  // ==========================================

  private getDocumentPath(userId: string, documentId: string, fileName: string): string {
    // Structure: users/{userId}/documents/{documentId}/{fileName}
    return `users/${userId}/documents/${documentId}/${fileName}`;
  }

  private getProcessedDocumentPath(userId: string, documentId: string, fileName: string): string {
    // Structure: users/{userId}/processed/{documentId}/{fileName}
    return `users/${userId}/processed/${documentId}/${fileName}`;
  }

  private getUserStorageLimit(userId: string): number {
    // TODO: Implement user-based storage limits based on subscription tier
    // For now, return default limit from environment
    return 1024 * 1024 * 1024; // 1GB default
  }
}
