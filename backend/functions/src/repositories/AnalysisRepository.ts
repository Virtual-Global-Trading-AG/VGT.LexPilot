import { BaseRepository } from './BaseRepository';
import { Analysis, AnalysisType, AnalysisStatus } from '../models';

/**
 * Analysis Repository implementing Repository Pattern
 * Handles all analysis-related database operations
 */
export class AnalysisRepository extends BaseRepository<Analysis> {
  constructor() {
    super('analyses');
  }

  /**
   * Find analyses by document ID
   */
  async findByDocumentId(
    documentId: string,
    limit: number = 10,
    startAfter?: string
  ): Promise<{ items: Analysis[]; hasNext: boolean; lastDocId?: string }> {
    return this.findWithPagination(limit, startAfter, { documentId });
  }

  /**
   * Find analyses by user ID
   */
  async findByUserId(
    userId: string,
    limit: number = 10,
    startAfter?: string
  ): Promise<{ items: Analysis[]; hasNext: boolean; lastDocId?: string }> {
    return this.findWithPagination(limit, startAfter, { userId });
  }

  /**
   * Find analyses by type
   */
  async findByType(
    type: AnalysisType,
    limit: number = 10,
    startAfter?: string
  ): Promise<{ items: Analysis[]; hasNext: boolean; lastDocId?: string }> {
    return this.findWithPagination(limit, startAfter, { type });
  }

  /**
   * Find analyses by status
   */
  async findByStatus(
    status: AnalysisStatus,
    limit: number = 10,
    startAfter?: string
  ): Promise<{ items: Analysis[]; hasNext: boolean; lastDocId?: string }> {
    return this.findWithPagination(limit, startAfter, { status });
  }

  /**
   * Get latest analysis for a document
   */
  async getLatestForDocument(documentId: string, type?: AnalysisType): Promise<Analysis | null> {
    try {
      let query = this.getCollection()
        .where('documentId', '==', documentId)
        .orderBy('createdAt', 'desc')
        .limit(1);

      if (type) {
        query = query.where('type', '==', type);
      }

      const snapshot = await query.get();
      
      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      if (!doc) return null;
      
      return {
        id: doc.id,
        ...doc.data()
      } as Analysis;
    } catch (error) {
      this.logger.error('Failed to get latest analysis for document', error as Error, {
        documentId,
        type
      });
      throw error;
    }
  }

  /**
   * Update analysis status
   */
  async updateStatus(analysisId: string, status: AnalysisStatus): Promise<void> {
    try {
      await this.update(analysisId, { status });
      
      this.logger.info('Analysis status updated', {
        analysisId,
        status
      });
    } catch (error) {
      this.logger.error('Failed to update analysis status', error as Error, {
        analysisId,
        status
      });
      throw error;
    }
  }

  /**
   * Complete analysis with result
   */
  async completeAnalysis(
    analysisId: string,
    result: any,
    confidence: number,
    processingTime: number,
    cost: number,
    tokensUsed: number
  ): Promise<void> {
    try {
      await this.update(analysisId, {
        status: AnalysisStatus.COMPLETED,
        result,
        confidence,
        processingTime,
        cost,
        tokensUsed
      });
      
      this.logger.info('Analysis completed', {
        analysisId,
        confidence,
        processingTime,
        cost,
        tokensUsed
      });
    } catch (error) {
      this.logger.error('Failed to complete analysis', error as Error, {
        analysisId
      });
      throw error;
    }
  }

  /**
   * Mark analysis as failed
   */
  async failAnalysis(analysisId: string, errorMessage: string): Promise<void> {
    try {
      await this.update(analysisId, {
        status: AnalysisStatus.FAILED,
        result: {
          summary: `Analysis failed: ${errorMessage}`,
          findings: [],
          recommendations: [],
          riskScore: 0,
          detailedReport: { error: errorMessage, timestamp: new Date() }
        }
      });
      
      this.logger.error('Analysis failed', new Error(errorMessage), {
        analysisId
      });
    } catch (error) {
      this.logger.error('Failed to mark analysis as failed', error as Error, {
        analysisId,
        originalError: errorMessage
      });
      throw error;
    }
  }

  /**
   * Get user analysis statistics
   */
  async getUserAnalysisStats(userId: string): Promise<{
    total: number;
    byType: Record<AnalysisType, number>;
    byStatus: Record<AnalysisStatus, number>;
    totalCost: number;
    averageConfidence: number;
  }> {
    try {
      const snapshot = await this.getCollection()
        .where('userId', '==', userId)
        .get();

      const analyses = snapshot.docs.map(doc => doc.data() as Analysis);
      
      const stats = {
        total: analyses.length,
        byType: {} as Record<AnalysisType, number>,
        byStatus: {} as Record<AnalysisStatus, number>,
        totalCost: 0,
        averageConfidence: 0
      };

      let totalConfidence = 0;
      let completedCount = 0;

      analyses.forEach(analysis => {
        // Count by type and status
        stats.byType[analysis.type] = (stats.byType[analysis.type] || 0) + 1;
        stats.byStatus[analysis.status] = (stats.byStatus[analysis.status] || 0) + 1;
        
        // Sum costs
        stats.totalCost += analysis.cost || 0;
        
        // Calculate average confidence for completed analyses
        if (analysis.status === AnalysisStatus.COMPLETED && analysis.confidence) {
          totalConfidence += analysis.confidence;
          completedCount++;
        }
      });

      // Calculate average confidence
      stats.averageConfidence = completedCount > 0 ? totalConfidence / completedCount : 0;

      this.logger.info('User analysis statistics retrieved', {
        userId,
        total: stats.total,
        totalCost: stats.totalCost,
        averageConfidence: stats.averageConfidence
      });

      return stats;
    } catch (error) {
      this.logger.error('Failed to get user analysis statistics', error as Error, {
        userId
      });
      throw error;
    }
  }

  /**
   * Get high-confidence analyses for learning
   */
  async getHighConfidenceAnalyses(
    minConfidence: number = 0.8,
    limit: number = 100
  ): Promise<Analysis[]> {
    try {
      const snapshot = await this.getCollection()
        .where('confidence', '>=', minConfidence)
        .where('status', '==', AnalysisStatus.COMPLETED)
        .orderBy('confidence', 'desc')
        .limit(limit)
        .get();

      const analyses = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Analysis));

      this.logger.info('High confidence analyses retrieved', {
        count: analyses.length,
        minConfidence
      });

      return analyses;
    } catch (error) {
      this.logger.error('Failed to get high confidence analyses', error as Error, {
        minConfidence
      });
      throw error;
    }
  }
}
