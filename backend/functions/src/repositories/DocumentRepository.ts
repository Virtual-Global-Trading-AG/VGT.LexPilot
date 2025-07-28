import { BaseRepository } from './BaseRepository';
import { Document, DocumentType, DocumentStatus } from '../models';
import { Query } from 'firebase-admin/firestore';

/**
 * Document Repository implementing Repository Pattern
 * Handles all document-related database operations
 */
export class DocumentRepository extends BaseRepository<Document> {
  constructor() {
    super('documents');
  }

  /**
   * Find documents by user ID
   */
  async findByUserId(
    userId: string, 
    limit: number = 10, 
    startAfter?: string
  ): Promise<{ items: Document[]; hasNext: boolean; lastDocId?: string }> {
    return this.findWithPagination(limit, startAfter, { userId });
  }

  /**
   * Find documents by type
   */
  async findByType(
    type: DocumentType,
    limit: number = 10,
    startAfter?: string
  ): Promise<{ items: Document[]; hasNext: boolean; lastDocId?: string }> {
    return this.findWithPagination(limit, startAfter, { type });
  }

  /**
   * Find documents by user and type
   */
  async findByUserAndType(
    userId: string,
    type: DocumentType,
    limit: number = 10,
    startAfter?: string
  ): Promise<{ items: Document[]; hasNext: boolean; lastDocId?: string }> {
    return this.findWithPagination(limit, startAfter, { userId, type });
  }

  /**
   * Find documents by status
   */
  async findByStatus(
    status: DocumentStatus,
    limit: number = 10,
    startAfter?: string
  ): Promise<{ items: Document[]; hasNext: boolean; lastDocId?: string }> {
    return this.findWithPagination(limit, startAfter, { status });
  }

  /**
   * Search documents by text content
   */
  async searchByContent(
    userId: string,
    searchTerm: string,
    limit: number = 10
  ): Promise<Document[]> {
    try {
      // Note: Firestore doesn't support full-text search natively
      // This is a basic implementation that checks if the search term
      // exists in the document name or extracted text
      const query = this.getCollection()
        .where('userId', '==', userId)
        .limit(limit);

      const snapshot = await query.get();
      const documents = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Document));

      // Filter by search term (case-insensitive)
      const filteredDocs = documents.filter(doc => 
        doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (doc.extractedText && doc.extractedText.toLowerCase().includes(searchTerm.toLowerCase()))
      );

      this.logger.info('Documents searched by content', {
        userId,
        searchTerm,
        resultCount: filteredDocs.length
      });

      return filteredDocs;
    } catch (error) {
      this.logger.error('Failed to search documents by content', error as Error, {
        userId,
        searchTerm
      });
      throw error;
    }
  }

  /**
   * Update document status
   */
  async updateStatus(documentId: string, status: DocumentStatus): Promise<void> {
    try {
      await this.update(documentId, { status });
      
      this.logger.info('Document status updated', {
        documentId,
        status
      });
    } catch (error) {
      this.logger.error('Failed to update document status', error as Error, {
        documentId,
        status
      });
      throw error;
    }
  }

  /**
   * Update document processing result
   */
  async updateProcessingResult(
    documentId: string, 
    extractedText: string, 
    status: DocumentStatus = DocumentStatus.PROCESSED
  ): Promise<void> {
    try {
      await this.update(documentId, {
        extractedText,
        status,
        processingError: undefined // Clear any previous errors
      });
      
      this.logger.info('Document processing result updated', {
        documentId,
        textLength: extractedText.length,
        status
      });
    } catch (error) {
      this.logger.error('Failed to update document processing result', error as Error, {
        documentId
      });
      throw error;
    }
  }

  /**
   * Update document processing error
   */
  async updateProcessingError(documentId: string, error: string): Promise<void> {
    try {
      await this.update(documentId, {
        status: DocumentStatus.ERROR,
        processingError: error
      });
      
      this.logger.error('Document processing failed', new Error(error), {
        documentId
      });
    } catch (updateError) {
      this.logger.error('Failed to update document processing error', updateError as Error, {
        documentId,
        originalError: error
      });
      throw updateError;
    }
  }

  /**
   * Get user document statistics
   */
  async getUserDocumentStats(userId: string): Promise<{
    total: number;
    byType: Record<DocumentType, number>;
    byStatus: Record<DocumentStatus, number>;
  }> {
    try {
      const snapshot = await this.getCollection()
        .where('userId', '==', userId)
        .get();

      const documents = snapshot.docs.map(doc => doc.data() as Document);
      
      const stats = {
        total: documents.length,
        byType: {} as Record<DocumentType, number>,
        byStatus: {} as Record<DocumentStatus, number>
      };

      // Count by type
      documents.forEach(doc => {
        stats.byType[doc.type] = (stats.byType[doc.type] || 0) + 1;
        stats.byStatus[doc.status] = (stats.byStatus[doc.status] || 0) + 1;
      });

      this.logger.info('User document statistics retrieved', {
        userId,
        total: stats.total
      });

      return stats;
    } catch (error) {
      this.logger.error('Failed to get user document statistics', error as Error, {
        userId
      });
      throw error;
    }
  }

  /**
   * Archive old documents
   */
  async archiveOldDocuments(daysOld: number = 365): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const snapshot = await this.getCollection()
        .where('createdAt', '<', cutoffDate)
        .where('status', '!=', DocumentStatus.ARCHIVED)
        .get();

      const batch = this.getBatch();
      let count = 0;

      snapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          status: DocumentStatus.ARCHIVED,
          updatedAt: new Date()
        });
        count++;
      });

      if (count > 0) {
        await batch.commit();
      }

      this.logger.info('Old documents archived', {
        count,
        daysOld,
        cutoffDate
      });

      return count;
    } catch (error) {
      this.logger.error('Failed to archive old documents', error as Error, {
        daysOld
      });
      throw error;
    }
  }
}
