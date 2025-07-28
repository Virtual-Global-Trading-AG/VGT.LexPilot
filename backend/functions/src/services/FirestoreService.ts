import * as admin from 'firebase-admin';
import { Logger } from '../utils/logger';
import { DocumentMetadata } from './StorageService';

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface SortOptions {
  field: string;
  direction: 'asc' | 'desc';
}

export interface DocumentFilters {
  status?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export class FirestoreService {
  private readonly logger = Logger.getInstance();
  private readonly db: admin.firestore.Firestore;

  constructor() {
    this.db = admin.firestore();
  }

  /**
   * Create a new document record
   */
  async createDocument(userId: string, documentId: string, metadata: Partial<DocumentMetadata>): Promise<void> {
    try {
      const docRef = this.db
        .collection('users')
        .doc(userId)
        .collection('documents')
        .doc(documentId);

      const documentData: DocumentMetadata = {
        userId,
        fileName: metadata.fileName!,
        contentType: metadata.contentType!,
        size: metadata.size!,
        uploadedAt: metadata.uploadedAt || new Date().toISOString(),
        status: metadata.status || 'uploading',
        category: metadata.category,
        description: metadata.description,
        tags: metadata.tags || [],
        analyses: metadata.analyses || []
      };

      await docRef.set(documentData);

      this.logger.info('Document record created', {
        userId,
        documentId,
        fileName: documentData.fileName
      });
    } catch (error) {
      this.logger.error('Failed to create document record', error as Error, {
        userId,
        documentId,
        metadata
      });
      throw new Error('Failed to create document record');
    }
  }

  /**
   * Get document by ID
   */
  async getDocument(documentId: string, userId: string): Promise<DocumentMetadata | null> {
    try {
      const docRef = this.db
        .collection('users')
        .doc(userId)
        .collection('documents')
        .doc(documentId);

      const doc = await docRef.get();

      if (!doc.exists) {
        return null;
      }

      const data = doc.data() as DocumentMetadata;
      
      this.logger.debug('Document retrieved', {
        userId,
        documentId,
        fileName: data.fileName
      });

      return data;
    } catch (error) {
      this.logger.error('Failed to get document', error as Error, {
        userId,
        documentId
      });
      throw new Error('Failed to get document');
    }
  }

  /**
   * Get user documents with pagination and filtering
   */
  async getUserDocuments(
    userId: string,
    pagination: PaginationOptions,
    sort: SortOptions,
    filters: DocumentFilters = {}
  ): Promise<PaginatedResult<DocumentMetadata>> {
    try {
      let query: admin.firestore.Query = this.db
        .collection('users')
        .doc(userId)
        .collection('documents');

      // Apply filters
      if (filters.status) {
        query = query.where('status', '==', filters.status);
      }

      if (filters.category) {
        query = query.where('category', '==', filters.category);
      }

      if (filters.startDate) {
        query = query.where('uploadedAt', '>=', filters.startDate);
      }

      if (filters.endDate) {
        query = query.where('uploadedAt', '<=', filters.endDate);
      }

      // Apply sorting
      query = query.orderBy(sort.field, sort.direction);

      // Get total count for pagination
      const totalSnapshot = await query.get();
      const total = totalSnapshot.size;

      // Apply pagination
      const offset = (pagination.page - 1) * pagination.limit;
      const paginatedQuery = query.offset(offset).limit(pagination.limit);
      
      const snapshot = await paginatedQuery.get();
      const documents = snapshot.docs.map(doc => doc.data() as DocumentMetadata);

      const result: PaginatedResult<DocumentMetadata> = {
        items: documents,
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit)
      };

      this.logger.debug('User documents retrieved', {
        userId,
        count: documents.length,
        total,
        page: pagination.page
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to get user documents', error as Error, {
        userId,
        pagination,
        sort,
        filters
      });
      throw new Error('Failed to get user documents');
    }
  }

  /**
   * Update document metadata
   */
  async updateDocument(
    documentId: string,
    userId: string,
    updates: Partial<DocumentMetadata>
  ): Promise<void> {
    try {
      const docRef = this.db
        .collection('users')
        .doc(userId)
        .collection('documents')
        .doc(documentId);

      await docRef.update({
        ...updates,
        updatedAt: new Date().toISOString()
      });

      this.logger.info('Document updated', {
        userId,
        documentId,
        updates: Object.keys(updates)
      });
    } catch (error) {
      this.logger.error('Failed to update document', error as Error, {
        userId,
        documentId,
        updates
      });
      throw new Error('Failed to update document');
    }
  }

  /**
   * Delete document record
   */
  async deleteDocument(documentId: string, userId: string): Promise<void> {
    try {
      const docRef = this.db
        .collection('users')
        .doc(userId)
        .collection('documents')
        .doc(documentId);

      await docRef.delete();

      this.logger.info('Document record deleted', {
        userId,
        documentId
      });
    } catch (error) {
      this.logger.error('Failed to delete document record', error as Error, {
        userId,
        documentId
      });
      throw new Error('Failed to delete document record');
    }
  }

  /**
   * Get active analyses for a document
   */
  async getActiveAnalyses(documentId: string): Promise<any[]> {
    try {
      const analysesRef = this.db
        .collection('analyses')
        .where('documentId', '==', documentId)
        .where('status', 'in', ['pending', 'running']);

      const snapshot = await analysesRef.get();
      const analyses = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      this.logger.debug('Active analyses retrieved', {
        documentId,
        count: analyses.length
      });

      return analyses;
    } catch (error) {
      this.logger.error('Failed to get active analyses', error as Error, {
        documentId
      });
      throw new Error('Failed to get active analyses');
    }
  }

  /**
   * Update document status
   */
  async updateDocumentStatus(
    documentId: string,
    userId: string,
    status: DocumentMetadata['status'],
    additionalData?: Partial<DocumentMetadata>
  ): Promise<void> {
    try {
      const docRef = this.db
        .collection('users')
        .doc(userId)
        .collection('documents')
        .doc(documentId);

      const updateData: any = {
        status,
        updatedAt: new Date().toISOString(),
        ...additionalData
      };

      if (status === 'processed') {
        updateData.processedAt = new Date().toISOString();
      }

      await docRef.update(updateData);

      this.logger.info('Document status updated', {
        userId,
        documentId,
        status,
        additionalData: additionalData ? Object.keys(additionalData) : []
      });
    } catch (error) {
      this.logger.error('Failed to update document status', error as Error, {
        userId,
        documentId,
        status,
        additionalData
      });
      throw new Error('Failed to update document status');
    }
  }

  /**
   * Add analysis to document
   */
  async addAnalysisToDocument(
    documentId: string,
    userId: string,
    analysisId: string
  ): Promise<void> {
    try {
      const docRef = this.db
        .collection('users')
        .doc(userId)
        .collection('documents')
        .doc(documentId);

      await docRef.update({
        analyses: admin.firestore.FieldValue.arrayUnion(analysisId),
        updatedAt: new Date().toISOString()
      });

      this.logger.info('Analysis added to document', {
        userId,
        documentId,
        analysisId
      });
    } catch (error) {
      this.logger.error('Failed to add analysis to document', error as Error, {
        userId,
        documentId,
        analysisId
      });
      throw new Error('Failed to add analysis to document');
    }
  }

  /**
   * Remove analysis from document
   */
  async removeAnalysisFromDocument(
    documentId: string,
    userId: string,
    analysisId: string
  ): Promise<void> {
    try {
      const docRef = this.db
        .collection('users')
        .doc(userId)
        .collection('documents')
        .doc(documentId);

      await docRef.update({
        analyses: admin.firestore.FieldValue.arrayRemove(analysisId),
        updatedAt: new Date().toISOString()
      });

      this.logger.info('Analysis removed from document', {
        userId,
        documentId,
        analysisId
      });
    } catch (error) {
      this.logger.error('Failed to remove analysis from document', error as Error, {
        userId,
        documentId,
        analysisId
      });
      throw new Error('Failed to remove analysis from document');
    }
  }

  /**
   * Get user storage statistics
   */
  async getUserStorageStats(userId: string): Promise<{
    totalDocuments: number;
    totalSize: number;
    documentsByStatus: Record<string, number>;
    documentsByCategory: Record<string, number>;
  }> {
    try {
      const documentsRef = this.db
        .collection('users')
        .doc(userId)
        .collection('documents');

      const snapshot = await documentsRef.get();
      const documents = snapshot.docs.map(doc => doc.data() as DocumentMetadata);

      const stats = {
        totalDocuments: documents.length,
        totalSize: documents.reduce((sum, doc) => sum + doc.size, 0),
        documentsByStatus: {} as Record<string, number>,
        documentsByCategory: {} as Record<string, number>
      };

      // Count by status
      documents.forEach(doc => {
        stats.documentsByStatus[doc.status] = (stats.documentsByStatus[doc.status] || 0) + 1;
        if (doc.category) {
          stats.documentsByCategory[doc.category] = (stats.documentsByCategory[doc.category] || 0) + 1;
        }
      });

      this.logger.debug('User storage stats calculated', {
        userId,
        ...stats
      });

      return stats;
    } catch (error) {
      this.logger.error('Failed to get user storage stats', error as Error, {
        userId
      });
      throw new Error('Failed to get user storage stats');
    }
  }

  /**
   * Search documents by text
   */
  async searchDocuments(
    userId: string,
    searchText: string,
    filters: DocumentFilters = {},
    pagination: PaginationOptions = { page: 1, limit: 10 }
  ): Promise<PaginatedResult<DocumentMetadata>> {
    try {
      // Note: This is a simple text search. For more advanced search,
      // consider using Algolia or Elasticsearch
      let query: admin.firestore.Query = this.db
        .collection('users')
        .doc(userId)
        .collection('documents');

      // Apply filters
      if (filters.status) {
        query = query.where('status', '==', filters.status);
      }

      if (filters.category) {
        query = query.where('category', '==', filters.category);
      }

      // Simple text search in fileName and description
      // Note: Firestore doesn't support full-text search natively
      const snapshot = await query.get();
      
      const searchLower = searchText.toLowerCase();
      const filteredDocuments = snapshot.docs
        .map(doc => doc.data() as DocumentMetadata)
        .filter(doc => 
          doc.fileName.toLowerCase().includes(searchLower) ||
          (doc.description && doc.description.toLowerCase().includes(searchLower)) ||
          (doc.tags && doc.tags.some(tag => tag.toLowerCase().includes(searchLower)))
        );

      const total = filteredDocuments.length;
      const offset = (pagination.page - 1) * pagination.limit;
      const paginatedDocuments = filteredDocuments.slice(offset, offset + pagination.limit);

      const result: PaginatedResult<DocumentMetadata> = {
        items: paginatedDocuments,
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit)
      };

      this.logger.debug('Document search completed', {
        userId,
        searchText,
        found: total,
        returned: paginatedDocuments.length
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to search documents', error as Error, {
        userId,
        searchText,
        filters
      });
      throw new Error('Failed to search documents');
    }
  }
}
