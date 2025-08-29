import { HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { UserDocument } from '@models/index';
import { NextFunction, Request, Response } from 'express';
import { UserRepository } from '../repositories/UserRepository';
import { AnalysisService, DataProtectionCheckRequest, DataProtectionService, DocumentFilters, FirestoreService, JobQueueService, PaginationOptions, SortOptions, StorageService, SwissObligationLawService, TextExtractionService } from '../services';
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
  private readonly dataProtectionService: DataProtectionService;
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
    this.dataProtectionService = new DataProtectionService();
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
   * Get dashboard statistics
   * GET /api/documents/dashboard/stats
   */
  public async getDashboardStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);

      // Get user documents and analyses
      const [documents, analyses] = await Promise.all([
        this.firestoreService.getAllUserDocuments(userId),
        this.swissObligationLawService.listUserAnalyses(userId)
      ]);

      this.logger.info('Retrieved documents and analyses for dashboard stats', {
        documents,
        analyses
      })
      // Calculate active contracts (documents with status 'processed' or 'uploaded')
      const activeContracts = documents.filter(doc =>
        doc.documentMetadata.status === 'processed' || doc.documentMetadata.status === 'uploaded'
      ).length;

      // Calculate high risks (analyses with low compliance score)
      const highRisks = analyses.filter(analysis =>
        analysis.overallCompliance && !analysis.overallCompliance.isCompliant
      ).length;

      // Calculate due dates (for now, we'll use a placeholder as we don't have deadline data)
      const dueDates = 0; // TODO: Implement when deadline functionality is added

      // Calculate monthly savings (placeholder calculation)
      const monthlySavings = analyses.length * 200;

      // Calculate growth percentages (placeholder for now)
      const contractsGrowth = 12; // +12%
      const savingsGrowth = 8; // +8%

      this.sendSuccess(res, {
        activeContracts: {
          count: activeContracts,
          growth: activeContracts > 0 ? contractsGrowth : 0
        },
        highRisks: {
          count: highRisks
        },
        dueDates: {
          count: dueDates
        },
        monthlySavings: {
          amount: monthlySavings,
          growth: activeContracts > 0 ? savingsGrowth : 0,
          currency: 'CHF'
        }
      }, 'Dashboard statistics retrieved successfully');

    } catch (error) {
      this.logger.error('Get dashboard stats failed', error as Error, {
        userId: this.getUserId(req)
      });
      next(error);
    }
  }

  /**
   * Get recent activities for dashboard
   * GET /api/documents/dashboard/activities
   */
  public async getRecentActivities(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const limit = parseInt(req.query.limit as string) || 10;

      // Get recent documents and analyses
      const [recentDocuments, recentAnalyses] = await Promise.all([
        this.firestoreService.getAllUserDocuments(userId),
        this.swissObligationLawService.listUserAnalyses(userId, limit)
      ]);

      const activities: any[] = [];

      // Add recent analyses as activities (aligned with contracts table format)
      recentAnalyses.forEach(analysis => {
        // Find the corresponding document
        const document = recentDocuments.find(doc => doc.documentId === analysis.documentId);
        const fileName = document?.documentMetadata?.fileName || 'Unbekanntes Dokument';

        if (!analysis.overallCompliance?.isCompliant) {
          activities.push({
            id: `analysis-${analysis.analysisId}`,
            type: 'violation',
            fileName: fileName,
            status: 'Nicht konform',
            time: this.getRelativeTime(analysis.createdAt),
            icon: 'AlertTriangle',
            iconColor: 'text-red-500',
            statusVariant: 'destructive'
          });
        } else {
          activities.push({
            id: `analysis-${analysis.analysisId}`,
            type: 'conformity',
            fileName: fileName,
            status: 'Konform',
            time: this.getRelativeTime(analysis.createdAt),
            icon: 'CheckCircle',
            iconColor: 'text-green-500',
            statusVariant: 'default'
          });
        }
      });

      // Add recent document uploads (keep as requested)
      recentDocuments
      .sort((a, b) => new Date(b.documentMetadata.uploadedAt).getTime() - new Date(a.documentMetadata.uploadedAt).getTime())
      .slice(0, 3)
      .forEach(document => {
        activities.push({
          id: `upload-${document.documentId}`,
          type: 'uploaded',
          title: 'Neuer Vertrag hochgeladen',
          subtitle: document.documentMetadata.fileName || 'Unbekanntes Dokument',
          time: this.getRelativeTime(new Date(document.documentMetadata.uploadedAt)),
          icon: 'Upload',
          iconColor: 'text-blue-500'
        });
      });

      // Add contract generation activities
      try {
        const contractJobs = await this.jobQueueService.getUserJobs(userId, 5, 0);
        if (contractJobs && contractJobs.jobs) {
          contractJobs.jobs
          .filter(job => job.type === 'contract_generation')
          .forEach(job => {
            let status = 'In Bearbeitung';
            let statusVariant = 'secondary';
            let iconColor = 'text-blue-500';
            let icon = 'FileText';

            if (job.status === 'completed') {
              status = 'Vertrag generiert';
              statusVariant = 'default';
              iconColor = 'text-green-500';
              icon = 'CheckCircle';
            } else if (job.status === 'failed') {
              status = 'Generierung fehlgeschlagen';
              statusVariant = 'destructive';
              iconColor = 'text-red-500';
              icon = 'AlertTriangle';
            }

            activities.push({
              id: `contract-${job.id}`,
              type: 'contract_generation',
              fileName: job.data?.fileName || 'Vertrag',
              status: status,
              time: this.getRelativeTime(new Date(job.createdAt)),
              icon: icon,
              iconColor: iconColor,
              statusVariant: statusVariant
            });
          });
        }
      } catch (error) {
        // Continue if contract generation jobs can't be retrieved
        this.logger.warn('Could not retrieve contract generation jobs', error as Error);
      }

      // Sort activities by time and limit
      activities.sort((a, b) => {
        // This is a simple sort, in a real implementation you'd want to sort by actual timestamps
        return 0;
      });

      this.sendSuccess(res, {
        activities: activities.slice(0, limit)
      }, 'Recent activities retrieved successfully');

    } catch (error) {
      this.logger.error('Get recent activities failed', error as Error, {
        userId: this.getUserId(req)
      });
      next(error);
    }
  }

  /**
   * Get analysis progress for dashboard
   * GET /api/documents/dashboard/progress
   */
  public async getAnalysisProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);

      // Get user jobs and documents
      const [jobsResult, documents] = await Promise.all([
        this.jobQueueService.getUserJobs(userId, 20, 0),
        this.firestoreService.getAllUserDocuments(userId)
      ]);

      const progressItems: any[] = [];

      // Add active jobs
      if (jobsResult && jobsResult.jobs && jobsResult.jobs.length > 0) {
        jobsResult.jobs.forEach((job: any) => {
          if (job.status === 'running' || job.status === 'pending') {
            const document = documents.find(doc => doc.documentId === job.documentId);
            const fileName = document?.documentMetadata?.fileName || 'Unknown Document';

            progressItems.push({
              id: job.jobId,
              fileName: fileName,
              status: job.status === 'running' ? 'Wird analysiert' : 'Warteschlange',
              progress: job.progress || 0
            });
          }
        });
      }

      // Add recently completed analyses
      const recentAnalyses = await this.swissObligationLawService.listUserAnalyses(userId, 5);
      recentAnalyses.forEach(analysis => {
        const document = documents.find(doc => doc.documentId === analysis.documentId);
        const fileName = document?.documentMetadata?.fileName || 'Unknown Document';

        progressItems.push({
          id: analysis.analysisId,
          fileName: fileName,
          status: 'Analysiert',
          progress: 100
        });
      });

      this.sendSuccess(res, {
        progressItems: progressItems.slice(0, 10) // Limit to 10 items
      }, 'Analysis progress retrieved successfully');

    } catch (error) {
      this.logger.error('Get analysis progress failed', error as Error, {
        userId: this.getUserId(req)
      });
      next(error);
    }
  }

  /**
   * Get lawyer dashboard statistics
   * GET /api/documents/dashboard/lawyer/stats
   */
  public async getLawyerDashboardStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);

      // Get shared analyses for this lawyer
      const sharedAnalyses = await this.swissObligationLawService.listSharedAnalyses(userId, 100);

      // Get all analyses where this lawyer has made decisions
      const db = this.firestoreService['db'] || require('firebase-admin').firestore();
      const completedAnalysesQuery = await db.collection('swissObligationAnalyses')
      .where('lawyerStatus', 'in', ['APPROVED', 'DECLINE'])
      .get();

      const completedAnalyses = completedAnalysesQuery.docs
      .map(doc => doc.data())
      .filter(analysis => analysis.sharedUserId === userId || !analysis.sharedUserId);

      // Calculate earnings (approved + declined contracts)
      const approvedCount = completedAnalyses.filter(analysis => analysis.lawyerStatus === 'APPROVED').length;
      const declinedCount = completedAnalyses.filter(analysis => analysis.lawyerStatus === 'DECLINE').length;
      const totalReviewed = approvedCount + declinedCount;
      const earnings = totalReviewed * 150; // CHF 150 per reviewed contract

      // Calculate unreviewed shared documents
      const unreviewedCount = sharedAnalyses.length;

      // Calculate pending reviews (CHECK_PENDING status)
      const pendingReviews = await db.collection('swissObligationAnalyses')
      .where('lawyerStatus', '==', 'CHECK_PENDING')
      .where('sharedUserId', '==', userId)
      .get();

      // Calculate growth percentages (placeholder for now)
      const earningsGrowth = 15; // +15%
      const reviewsGrowth = 8; // +8%

      this.sendSuccess(res, {
        totalEarnings: {
          amount: earnings,
          growth: totalReviewed > 0 ? earningsGrowth : 0,
          currency: 'CHF'
        },
        reviewedContracts: {
          count: totalReviewed,
          approved: approvedCount,
          declined: declinedCount,
          growth: totalReviewed > 0 ? reviewsGrowth : 0
        },
        unreviewedDocuments: {
          count: unreviewedCount
        },
        pendingReviews: {
          count: pendingReviews.size
        }
      }, 'Lawyer dashboard statistics retrieved successfully');

    } catch (error) {
      this.logger.error('Get lawyer dashboard stats failed', error as Error, {
        userId: this.getUserId(req)
      });
      next(error);
    }
  }

  /**
   * Get lawyer recent activities for dashboard
   * GET /api/documents/dashboard/lawyer/activities
   */
  public async getLawyerRecentActivities(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const limit = parseInt(req.query.limit as string) || 10;

      // Get recent analyses where this lawyer made decisions
      const db = this.firestoreService['db'] || require('firebase-admin').firestore();
      const recentDecisionsQuery = await db.collection('swissObligationAnalyses')
      .where('lawyerStatus', 'in', ['APPROVED', 'DECLINE'])
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get();

      const activities: any[] = [];

      // Add recent lawyer decisions as activities (aligned with contracts table format)
      for (const doc of recentDecisionsQuery.docs) {
        const analysis = doc.data();

        // Get document information
        let documentName = 'Unbekanntes Dokument';
        try {
          const documentInfo = await this.getUserDocumentInfo(analysis.documentId, analysis.userId);
          documentName = documentInfo?.documentMetadata?.fileName || 'Unbekanntes Dokument';
        } catch (error) {
          // Continue with default name if document info can't be retrieved
        }

        const decisionDate = analysis.updatedAt !== null ? new Date(analysis.updatedAt) : new Date(analysis.createdAt);

        this.logger.info('date update', { decisionDate })
        if (analysis.lawyerStatus === 'APPROVED') {
          activities.push({
            id: `approved-${analysis.analysisId}`,
            type: 'approved',
            fileName: documentName,
            status: 'Genehmigt',
            time: this.getRelativeTime(decisionDate),
            icon: 'CheckCircle',
            iconColor: 'text-green-500',
            statusVariant: 'default'
          });
        } else if (analysis.lawyerStatus === 'DECLINE') {
          activities.push({
            id: `declined-${analysis.analysisId}`,
            type: 'declined',
            fileName: documentName,
            status: 'Abgelehnt',
            time: this.getRelativeTime(decisionDate),
            icon: 'AlertTriangle',
            iconColor: 'text-red-500',
            statusVariant: 'destructive'
          });
        }
      }

      // Get recent shared analyses (new work) - aligned format
      const sharedAnalyses = await this.swissObligationLawService.listSharedAnalyses(userId, 3);


      for (const analysis of sharedAnalyses) {
        let documentName = 'Unbekanntes Dokument';
        try {
          const documentInfo = await this.getUserDocumentInfo(analysis.documentId, analysis.userId);
          documentName = documentInfo?.documentMetadata?.fileName || 'Unbekanntes Dokument';
        } catch (error) {
          // Continue with default name
        }

        activities.push({
          id: `shared-${analysis.analysisId}`,
          type: 'pending_review',
          fileName: documentName,
          status: 'Prüfung erforderlich',
          time: this.getRelativeTime(new Date(analysis.createdAt)),
          icon: 'FileText',
          iconColor: 'text-blue-500',
          statusVariant: 'secondary'
        });
      }

      // Add contract generation activities for lawyers too
      try {
        const contractJobs = await this.jobQueueService.getUserJobs(userId, 3, 0);
        if (contractJobs && contractJobs.jobs) {
          contractJobs.jobs
          .filter(job => job.type === 'contract_generation')
          .forEach(job => {
            let status = 'In Bearbeitung';
            let statusVariant = 'secondary';
            let iconColor = 'text-blue-500';
            let icon = 'FileText';

            if (job.status === 'completed') {
              status = 'Vertrag generiert';
              statusVariant = 'default';
              iconColor = 'text-green-500';
              icon = 'CheckCircle';
            } else if (job.status === 'failed') {
              status = 'Generierung fehlgeschlagen';
              statusVariant = 'destructive';
              iconColor = 'text-red-500';
              icon = 'AlertTriangle';
            }

            activities.push({
              id: `contract-${job.id}`,
              type: 'contract_generation',
              fileName: job.data?.fileName || 'Vertrag',
              status: status,
              time: this.getRelativeTime(new Date(job.createdAt)),
              icon: icon,
              iconColor: iconColor,
              statusVariant: statusVariant
            });
          });
        }
      } catch (error) {
        // Continue if contract generation jobs can't be retrieved
        this.logger.warn('Could not retrieve contract generation jobs for lawyer', error as Error);
      }

      // Sort activities by time (most recent first)
      activities.sort((a, b) => {
        // This is a simplified sort - in production you'd want proper timestamp sorting
        return 0;
      });

      this.sendSuccess(res, {
        activities: activities.slice(0, limit)
      }, 'Lawyer recent activities retrieved successfully');

    } catch (error) {
      this.logger.error('Get lawyer recent activities failed', error as Error, {
        userId: this.getUserId(req)
      });
      next(error);
    }
  }

  /**
   * Get lawyer analysis progress for dashboard
   * GET /api/documents/dashboard/lawyer/progress
   */
  public async getLawyerAnalysisProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);

      // Get shared analyses that need review
      const sharedAnalyses = await this.swissObligationLawService.listSharedAnalyses(userId, 10);

      const progressItems: any[] = [];

      // Add shared analyses as progress items
      for (const analysis of sharedAnalyses) {
        let documentName = 'Unbekanntes Dokument';
        try {
          const documentInfo = await this.getUserDocumentInfo(analysis.documentId, analysis.userId);
          documentName = documentInfo?.documentMetadata?.fileName || 'Unbekanntes Dokument';
        } catch (error) {
          // Continue with default name
        }

        progressItems.push({
          id: analysis.analysisId,
          fileName: documentName,
          status: 'Wartet auf Prüfung',
          progress: 0 // 0% because it's waiting for lawyer review
        });
      }

      // Get recently completed reviews
      const db = this.firestoreService['db'] || require('firebase-admin').firestore();
      const recentCompletedQuery = await db.collection('swissObligationAnalyses')
      .where('lawyerStatus', 'in', ['APPROVED', 'DECLINE'])
      .orderBy('updatedAt', 'desc')
      .limit(5)
      .get();

      for (const doc of recentCompletedQuery.docs) {
        const analysis = doc.data();

        let documentName = 'Unbekanntes Dokument';
        try {
          const documentInfo = await this.getUserDocumentInfo(analysis.documentId, analysis.userId);
          documentName = documentInfo?.documentMetadata?.fileName || 'Unbekanntes Dokument';
        } catch (error) {
          // Continue with default name
        }

        progressItems.push({
          id: analysis.analysisId,
          fileName: documentName,
          status: analysis.lawyerStatus === 'APPROVED' ? 'Genehmigt' : 'Abgelehnt',
          progress: 100
        });
      }

      this.sendSuccess(res, {
        progressItems: progressItems.slice(0, 10) // Limit to 10 items
      }, 'Lawyer analysis progress retrieved successfully');

    } catch (error) {
      this.logger.error('Get lawyer analysis progress failed', error as Error, {
        userId: this.getUserId(req)
      });
      next(error);
    }
  }

  /**
   * Helper method to get relative time string
   */
  private getRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) {
      return 'vor wenigen Minuten';
    } else if (diffHours < 24) {
      return `vor ${diffHours} Stunde${diffHours > 1 ? 'n' : ''}`;
    } else if (diffDays === 1) {
      return 'gestern';
    } else if (diffDays < 7) {
      return `vor ${diffDays} Tagen`;
    } else {
      return date.toLocaleDateString('de-DE');
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
   * Complete DSGVO Check with User Question
   * POST /api/documents/dsgvo-check/direct
   */
  public async completeDSGVOCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { question, maxSources = 5, language = 'de', includeContext = true } = req.body;

      // Input Validation
      if (!question || typeof question !== 'string') {
        this.logger.error('Direct DSGVO Check: Missing or invalid question', undefined, {
          userId,
          questionType: typeof question,
          questionValue: question
        });
        this.sendError(res, 400, 'Benutzerfrage ist erforderlich');
        return;
      }

      if (question.length > 5000) {
        this.logger.error('Direct DSGVO Check: Question too long', undefined, {
          userId,
          questionLength: question.length,
          maxLength: 5000
        });
        this.sendError(res, 400, 'Frage zu lang (max 5.000 Zeichen)');
        return;
      }

      if (maxSources < 1 || maxSources > 10) {
        this.logger.error('Direct DSGVO Check: Invalid maxSources parameter', undefined, {
          userId,
          maxSources,
          allowedRange: '1-10'
        });
        this.sendError(res, 400, 'maxSources muss zwischen 1 und 10 liegen');
        return;
      }

      this.logger.info('Direct DSGVO Check: Starting data protection analysis', {
        userId,
        questionLength: question.length,
        maxSources,
        language,
        includeContext,
        timestamp: new Date().toISOString()
      });

      // Create request object for the service
      const request: DataProtectionCheckRequest = {
        question,
        maxSources,
        language,
        includeContext
      };

      // Delegate to the DataProtectionService
      const result = await this.dataProtectionService.performDirectDSGVOCheck(request, userId);

      this.logger.info('Direct DSGVO Check: Analysis completed successfully', {
        userId,
        questionLength: question.length,
        referencesFound: result.references?.length || 0,
        status: result.legalAssessment?.status || 'UNKNOWN',
        totalDuration: result.performance.totalDuration
      });

      this.sendSuccess(res, result);

    } catch (error) {
      this.logger.error('Direct DSGVO Check: Analysis failed', error as Error, {
        userId: this.getUserId(req),
        questionLength: req.body?.question?.length || 0
      });

      // Detailed error handling
      if (error instanceof Error) {
        if (error.message.includes('OpenAI API-Konfiguration fehlt')) {
          this.sendError(res, 500, 'OpenAI API-Konfiguration fehlt');
        } else if (error.message.includes('Datenschutz-Datenbanken')) {
          this.sendError(res, 500, 'Fehler beim Zugriff auf die Datenschutz-Datenbanken');
        } else if (error.message.includes('Timeout')) {
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
        this.logger.info('No anonymized keywords found, use unanonymized text', { cleanedTextLength: cleanedText.length });
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
          completedAt: analysis.completedAt?.toISOString(),
          lawyerStatus: analysis.lawyerStatus,
          lawyerComment: analysis.lawyerComment
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

  /**
   * Submit lawyer analysis result
   * POST /api/documents/swiss-obligation-analyses/:analysisId/lawyer-result
   */
  public async submitLawyerAnalysisResult(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { analysisId } = req.params;
      const { decision, comment } = req.body;

      if (!analysisId) {
        this.sendError(res, 400, 'Missing required parameter', 'analysisId is required');
        return;
      }

      if (!decision || !['APPROVED', 'DECLINE'].includes(decision)) {
        this.sendError(res, 400, 'Invalid decision', 'Decision must be either APPROVED or DECLINE');
        return;
      }

      if (decision === 'DECLINE' && !comment) {
        this.sendError(res, 400, 'Comment required', 'Comment is required when declining an analysis');
        return;
      }

      this.logger.info('Lawyer analysis result submission requested', {
        userId,
        analysisId,
        decision,
        hasComment: !!comment
      });

      // Submit the lawyer analysis result
      await this.swissObligationLawService.submitLawyerAnalysisResult(analysisId, decision, comment);

      this.logger.info('Lawyer analysis result submitted successfully', {
        userId,
        analysisId,
        decision
      });

      this.sendSuccess(res, {
        analysisId,
        decision,
        message: decision === 'APPROVED' ? 'Analysis approved successfully' : 'Analysis declined successfully'
      }, 'Lawyer analysis result submitted successfully');

    } catch (error) {
      this.logger.error('Failed to submit lawyer analysis result', error as Error, {
        userId: this.getUserId(req),
        analysisId: req.params.analysisId
      });

      if (error instanceof Error) {
        this.sendError(res, 500, 'Failed to submit lawyer analysis result', error.message);
      } else {
        this.sendError(res, 500, 'Unexpected error during lawyer analysis result submission');
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
