import { UserDocument } from '@models/index';
import { UserRepository } from '@repositories/UserRepository';
import * as admin from 'firebase-admin';
import { Logger } from '../utils/logger';
import { DocumentMetadata, StorageService } from './StorageService';

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
  public readonly db: admin.firestore.Firestore;
  private readonly userRepo;
  private readonly storageService;

  constructor() {
    this.db = admin.firestore();
    this.userRepo = new UserRepository();
    this.storageService = new StorageService();
  }

  /**
   * Create a new document record
   */
  async createDocument(userId: string, documentId: string, metadata: Partial<DocumentMetadata>): Promise<void> {
    try {

      const user = await this.userRepo.findByUid(userId);
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      const documentData: DocumentMetadata = {
        fileName: metadata.fileName || '',
        size: metadata.size || 0,
        contentType: metadata.contentType || '',
        uploadedAt: metadata.uploadedAt || new Date().toISOString(),
        status: metadata.status || 'uploaded',
        category: metadata.category,
        anonymizedKeywords: metadata.anonymizedKeywords || [],
        description: metadata.description || '',
        tags: metadata.tags || []
      };


      // Create UserDocument object with metadata
      const userDocument: UserDocument = {
        documentId,
        documentMetadata: documentData,
        addedAt: new Date().toISOString()
      };

      // Update user's documents array
      const updatedUser = {
        ...user,
        documents: [...user?.documents ?? [], userDocument]
      };

      await this.userRepo.update(user!.id, updatedUser);


      this.logger.info('Document record created', {
        userId,
        documentId,
        documentData
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
   * Get user documents with pagination and filtering
   */
  async getUserDocuments(
    userId: string,
    pagination: PaginationOptions,
    sort: SortOptions,
    filters: DocumentFilters = {}
  ): Promise<PaginatedResult<UserDocument>> {
    try {

      // Get user document to retrieve documentIds array
      const user = await this.userRepo.findByUid(userId);

      if (!user) {
        throw new Error('User not found');
      }

      const documents: UserDocument[] = user.documents || [];

      if (documents.length === 0) {
        return {
          items: [],
          page: pagination.page,
          limit: pagination.limit,
          total: 0,
          totalPages: 0
        };
      }

      // Fetch documents from storage by their IDs
      const documentsPromises = documents.map(async (doc) => {
        try {
          // Get file information from storage
          const fileInfo = await this.storageService.getDocumentFileInfo(doc.documentId, userId);

          if (!fileInfo) {
            this.logger.warn('No file found in storage for document', { documentId: doc.documentId, userId });
            return null;
          }

          return doc;
        } catch (error) {
          this.logger.error('Failed to get file info for document', error as Error, { docId: doc.documentId, userId });
          return null;
        }
      });

      const allDocuments = (await Promise.all(documentsPromises))
        .filter((doc): doc is UserDocument => doc !== null);

      // Apply filters
      let filteredDocuments = allDocuments;

      if (filters.status) {
        filteredDocuments = filteredDocuments.filter(doc => doc.documentMetadata.status === filters.status);
      }

      if (filters.category) {
        filteredDocuments = filteredDocuments.filter(doc => doc.documentMetadata.category === filters.category);
      }

      if (filters.startDate) {
        filteredDocuments = filteredDocuments.filter(doc => 
          new Date(doc.documentMetadata.uploadedAt) >= new Date(filters.startDate!)
        );
      }

      if (filters.endDate) {
        filteredDocuments = filteredDocuments.filter(doc => 
          new Date(doc.documentMetadata.uploadedAt) <= new Date(filters.endDate!)
        );
      }

      // Apply sorting
      filteredDocuments.sort((a, b) => {
        const aValue = a.documentMetadata[sort.field as keyof DocumentMetadata];
        const bValue = b.documentMetadata[sort.field as keyof DocumentMetadata];

        if (!aValue < !bValue) return sort.direction === 'asc' ? -1 : 1;
        if (!aValue > !bValue) return sort.direction === 'asc' ? 1 : -1;
        return 0;
      });

      const total = filteredDocuments.length;

      // Apply pagination
      const offset = (pagination.page - 1) * pagination.limit;
      const paginatedDocuments = filteredDocuments.slice(offset, offset + pagination.limit);

      const result: PaginatedResult<UserDocument> = {
        items: paginatedDocuments,
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit)
      };

      this.logger.debug('User documents retrieved', {
        userId,
        count: paginatedDocuments.length,
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
   * Get a single document by ID
   */
  async getDocument(documentId: string, userId: string): Promise<any | null> {
    try {
      // Find the document in the user's documents array
      const user = await this.userRepo.findByUid(userId);

      if (!user) {
        throw new Error('User not found');
      }

      const document = (user.documents || []).find(doc => doc.documentId === documentId);

      if (!document) {
        return null;
      }

      // Get additional file info from storage
      const fileInfo = await this.storageService.getDocumentFileInfo(document.documentId, userId);

      if (!fileInfo) {
        return null;
      }

      const result = {
        documentId: document.documentId,
        fileName: fileInfo.fileName,
        contentType: fileInfo.contentType,
        size: fileInfo.size,
        uploadedAt: document.documentMetadata.uploadedAt || fileInfo.uploadedAt.toISOString(),
        status: document.documentMetadata.status || 'uploaded',
        category: document.documentMetadata.category,
        anonymizedKeywords: document.documentMetadata.anonymizedKeywords || [],
        description: document.documentMetadata.description,
        tags: document.documentMetadata.tags || [],
        analyses: document.documentMetadata.analyses || [],
      };

      this.logger.debug('Document retrieved', {
        userId,
        documentId,
        fileName: result.fileName
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to get document', error as Error, {
        userId,
        documentId
      });
      throw new Error('Failed to get document');
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
   * Delete document record (removes documentId from user's documentIds array)
   */
  async deleteDocument(documentId: string, userId: string): Promise<void> {
    try {
      // Get user document to retrieve current documentIds array
      const user = await this.userRepo.findByUid(userId);

      if (!user) {
        throw new Error('User not found');
      }

      // Remove documentId from the documentIds array
      const updatedDocuments = (user.documents || []).filter(doc => doc.documentId !== documentId);

      // Update user document with new documentIds array
      await this.userRepo.update(user.id, {
        documents: updatedDocuments
      });

      this.logger.info('Document record deleted from user documentIds', {
        userId,
        documentId,
        remainingDocuments: updatedDocuments.length
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

  /**
   * Generische Methode zum Speichern von Dokumenten in beliebigen Collections
   */
  async saveDocument(path: string, data: any): Promise<void> {
    try {
      await this.db.doc(path).set(data, { merge: true });

      this.logger.debug('Document saved successfully', {
        path,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Failed to save document', error as Error, { path });
      throw new Error(`Failed to save document at ${path}`);
    }
  }

  /**
   * Batch operation for atomic multi-document operations
   */
  async saveBatch(operations: Array<{ path: string; data: any }>): Promise<void> {
    try {
      const batch = this.db.batch();

      operations.forEach(({ path, data }) => {
        const docRef = this.db.doc(path);
        batch.set(docRef, data, { merge: true });
      });

      await batch.commit();

      this.logger.debug('Batch operation completed successfully', {
        operationCount: operations.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Failed to execute batch operation', error as Error, {
        operationCount: operations.length
      });
      throw new Error('Failed to execute batch operation');
    }
  }

  /**
   * Get document from subcollection
   */
  async getSubcollectionDocument(path: string): Promise<any | null> {
    try {
      const doc = await this.db.doc(path).get();

      if (!doc.exists) {
        return null;
      }

      return doc.data();
    } catch (error) {
      this.logger.error('Failed to get subcollection document', error as Error, { path });
      throw new Error(`Failed to get document at ${path}`);
    }
  }
}
