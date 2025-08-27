import { user } from 'firebase-functions/v1/auth';
import { Logger } from '../utils/logger';
import { FirestoreService } from './FirestoreService';
import { v4 as uuidv4 } from 'uuid';
import * as admin from 'firebase-admin';

export interface Job {
  id: string;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  userId: string;
  data: any;
  result?: any;
  error?: string;
  progress?: number;
  progressMessage?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface JobProgress {
  progress: number;
  message: string;
}

export class JobQueueService {
  private logger = Logger.getInstance();
  private firestoreService: FirestoreService;
  private processingJobs = new Map<string, boolean>();

  constructor(firestoreService: FirestoreService) {
    this.firestoreService = firestoreService;
  }

  /**
   * Convert Firestore document data to Job object, handling Timestamp conversion
   */
  private convertFirestoreDataToJob(data: any): Job {
    return {
      id: data.id,
      type: data.type,
      status: data.status,
      userId: data.userId,
      data: data.data,
      result: data.result,
      error: data.error,
      progress: data.progress,
      progressMessage: data.progressMessage,
      createdAt: data.createdAt && typeof data.createdAt.toDate === 'function'
        ? data.createdAt.toDate() 
        : data.createdAt,
      startedAt: data.startedAt && typeof data.startedAt.toDate === 'function'
        ? data.startedAt.toDate() 
        : data.startedAt,
      completedAt: data.completedAt && typeof data.completedAt.toDate === 'function'
        ? data.completedAt.toDate() 
        : data.completedAt
    };
  }

  /**
   * Create a new job and add it to the queue
   */
  public async createJob(
    type: string,
    userId: string,
    data: any
  ): Promise<string> {
    const jobId = uuidv4();
    const job: Job = {
      id: jobId,
      type,
      status: 'pending',
      userId,
      data,
      createdAt: new Date()
    };

    try {
      await this.firestoreService.db
        .collection('jobs')
        .doc(jobId)
        .set(job);

      this.logger.info('Job created', { jobId, type, userId });

      // Start processing the job immediately
      this.processJob(jobId);

      return jobId;
    } catch (error) {
      this.logger.error('Failed to create job', error as Error, { jobId, type, userId });
      throw error;
    }
  }

  /**
   * Get job status and details
   */
  public async getJob(jobId: string, userId: string): Promise<Job | null> {
    try {
      const jobDoc = await this.firestoreService.db
        .collection('jobs')
        .doc(jobId)
        .get();

      if (!jobDoc.exists) {
        return null;
      }

      const jobData = jobDoc.data();
      if (!jobData) {
        return null;
      }

      const job = this.convertFirestoreDataToJob(jobData);

      // Ensure user can only access their own jobs
      if (job.userId !== userId) {
        return null;
      }

      return job;
    } catch (error) {
      this.logger.error('Failed to get job', error as Error, { jobId, userId });
      throw error;
    }
  }

  /**
   * Update job progress
   */
  public async updateJobProgress(
    jobId: string,
    progress: number,
    message: string
  ): Promise<void> {
    try {
      await this.firestoreService.db
        .collection('jobs')
        .doc(jobId)
        .update({
          progress,
          progressMessage: message,
          updatedAt: new Date()
        });

      this.logger.debug('Job progress updated', { jobId, progress, message });
    } catch (error) {
      this.logger.error('Failed to update job progress', error as Error, { jobId, progress, message });
    }
  }

  /**
   * Mark job as completed with result
   */
  public async completeJob(jobId: string, result: any): Promise<void> {
    try {
      await this.firestoreService.db
        .collection('jobs')
        .doc(jobId)
        .update({
          status: 'completed',
          result,
          progress: 100,
          progressMessage: 'Analysis completed successfully',
          completedAt: new Date()
        });

      this.processingJobs.delete(jobId);
      this.logger.info('Job completed', { jobId });

      // Send notification to user
      await this.sendJobCompletionNotification(jobId, result);
    } catch (error) {
      this.logger.error('Failed to complete job', error as Error, { jobId });
      throw error;
    }
  }

  /**
   * Mark job as failed with error
   */
  public async failJob(jobId: string, error: string): Promise<void> {
    try {
      await this.firestoreService.db
        .collection('jobs')
        .doc(jobId)
        .update({
          status: 'failed',
          error,
          completedAt: new Date()
        });

      this.processingJobs.delete(jobId);
      this.logger.error('Job failed', new Error(error), { jobId });

      // Send error notification to user
      await this.sendJobErrorNotification(jobId, error);
    } catch (err) {
      this.logger.error('Failed to mark job as failed', err as Error, { jobId, error });
    }
  }

  /**
   * Process a job in the background
   */
  private async processJob(jobId: string): Promise<void> {
    if (this.processingJobs.has(jobId)) {
      return; // Job is already being processed
    }

    this.processingJobs.set(jobId, true);

    try {
      // Mark job as processing
      await this.firestoreService.db
        .collection('jobs')
        .doc(jobId)
        .update({
          status: 'processing',
          startedAt: new Date()
        });

      // Get job details
      const jobDoc = await this.firestoreService.db
        .collection('jobs')
        .doc(jobId)
        .get();

      if (!jobDoc.exists) {
        throw new Error('Job not found');
      }

      const job = jobDoc.data() as Job;

      // Process based on job type
      switch (job.type) {
        case 'swiss-obligation-analysis':
          await this.processSwissObligationAnalysis(job);
          break;
        case 'contract-generation':
          await this.processContractGeneration(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }
    } catch (error) {
      await this.failJob(jobId, (error as Error).message);
    }
  }
  /**
   * Process Swiss Obligation Law analysis job
   */
  private async processSwissObligationAnalysis(job: Job): Promise<void> {
    const { SwissObligationLawService } = await import('./SwissObligationLawService');
    const { AnalysisService } = await import('./AnalysisService');
    const { StorageService } = await import('./StorageService');
    const { TextExtractionService } = await import('./TextExtractionService');

    const analysisService = new AnalysisService();
    const storageService = new StorageService();
    const textExtractionService = new TextExtractionService();
    const swissObligationLawService = new SwissObligationLawService(
      analysisService,
      this.firestoreService
    );

    const { documentId, userId } = job.data;

    try {
      // Get document metadata
      const document = await this.firestoreService.getDocument(documentId, userId);
      if (!document) {
        throw new Error('Document not found');
      }

      const documentFileBuffer = await storageService.getDocumentContent(
        documentId,
        document.fileName,
        userId
      );

      // Extract text from original file
      const extractedText = await textExtractionService.extractText(
        documentFileBuffer,
        document.contentType,
        document.fileName
      );

      // Apply anonymization if anonymized keywords exist
      let processedText = extractedText;
      if (document.anonymizedKeywords && document.anonymizedKeywords.length > 0) {
        processedText = textExtractionService.replaceSpecificTexts(
          extractedText,
          document.anonymizedKeywords
        );
      }

      // Convert anonymized text back to PDF buffer for analysis
      const processedBuffer = await textExtractionService.convertTextToPDF(processedText, document.fileName);

      // Progress callback to update job status
      const progressCallback = async (progress: number, message: string) => {
        await this.updateJobProgress(job.id, progress, message);
      };

      const analysisResult = await swissObligationLawService.analyzeContractWithObligationLaw(
        '',
        userId,
        // todo: use vector store ID from config or environment
        'vs_68a726b561888191ab1eeeb15e5c34e8',
        documentId,
        document.fileName,
        processedBuffer,
        progressCallback,
        document.anonymizedKeywords
      )

      // Complete job with result (same structure as regular analysis)
      await this.completeJob(job.id, {
        analysisId: analysisResult.analysisId,
        documentId: analysisResult.documentId,
        documentContext: analysisResult.documentContext,
        sections: analysisResult.sections.map(section => ({
          sectionId: section.sectionId,
          title: section.sectionContent,
          isCompliant: section.complianceAnalysis.isCompliant,
          confidence: section.complianceAnalysis.confidence,
          violationCount: section.complianceAnalysis.violations.length,
          violations: section.complianceAnalysis.violations,
          reasoning: section.complianceAnalysis.reasoning
        })),
        overallCompliance: analysisResult.overallCompliance,
        summary: {
          totalSections: analysisResult.sections.length,
          compliantSections: analysisResult.sections.filter(s => s.complianceAnalysis.isCompliant).length,
          totalViolations: analysisResult.sections.reduce((sum, s) => sum + s.complianceAnalysis.violations.length, 0),
        },
        createdAt: analysisResult.createdAt.toISOString(),
        completedAt: analysisResult.completedAt?.toISOString()
      });

    } catch (error) {
      throw error;
    }
  }

  /**
   * Process contract generation job
   */
  private async processContractGeneration(job: Job): Promise<void> {
    const { ContractGenerationService } = await import('./ContractGenerationService');
    const { StorageService } = await import('./StorageService');

    const storageService = new StorageService();
    const contractGenerationService = new ContractGenerationService(
      this.firestoreService,
      storageService
    );

    const { contractType, parameters, userId } = job.data;

    try {
      // Progress callback to update job status
      const progressCallback = async (progress: number, message: string) => {
        await this.updateJobProgress(job.id, progress, message);
      };

      // Update progress: Starting contract generation
      await progressCallback(10, 'Starte Vertragsgenerierung...');

      // Update progress: Creating prompt
      await progressCallback(20, 'Erstelle Prompt für ChatGPT...');

      // Generate contract using the existing service
      const result = await contractGenerationService.generateContract({
        contractType,
        parameters,
        userId
      });

      // Update progress: Contract generated
      await progressCallback(90, 'Vertrag erfolgreich generiert...');

      // Complete job with result
      await this.completeJob(job.id, {
        downloadUrl: result.downloadUrl,
        documentId: result.documentId,
        contractType,
        status: 'completed'
      });

    } catch (error) {
      throw error;
    }
  }

  /**
   * Send job completion notification to user
   */
  private async sendJobCompletionNotification(jobId: string, result: any): Promise<void> {
    try {
      const jobDoc = await this.firestoreService.db
        .collection('jobs')
        .doc(jobId)
        .get();

      if (!jobDoc.exists) {
        return;
      }

      const job = jobDoc.data() as Job;

      // Create notification based on job type
      let notificationType: string;
      let title: string;
      let message: string;
      let data: any = { jobId };

      switch (job.type) {
        case 'swiss-obligation-analysis':
          notificationType = 'analysis_completed';
          title = 'Analyse abgeschlossen';
          message = 'Die Schweizer Obligationenrecht-Analyse wurde erfolgreich abgeschlossen.';
          data = {
            ...data,
            analysisId: result.analysisId,
            documentId: result.documentId
          };
          break;
        case 'contract-generation':
          notificationType = 'contract_generated';
          title = 'Vertrag generiert';
          message = 'Die Vertragsgenerierung wurde erfolgreich abgeschlossen.';
          data = {
            ...data,
            downloadUrl: result.downloadUrl,
            documentId: result.documentId,
            contractType: result.contractType
          };
          break;
        default:
          notificationType = 'job_completed';
          title = 'Auftrag abgeschlossen';
          message = 'Der Auftrag wurde erfolgreich abgeschlossen.';
      }

      const notification = {
        id: uuidv4(),
        userId: job.userId,
        type: notificationType,
        title,
        message,
        data,
        read: false,
        createdAt: new Date()
      };

      await this.firestoreService.db
        .collection('notifications')
        .doc(notification.id)
        .set(notification);

      this.logger.info('Job completion notification sent', { jobId, userId: job.userId });
    } catch (error) {
      this.logger.error('Failed to send job completion notification', error as Error, { jobId });
    }
  }

  /**
   * Send job error notification to user
   */
  private async sendJobErrorNotification(jobId: string, error: string): Promise<void> {
    try {
      const jobDoc = await this.firestoreService.db
        .collection('jobs')
        .doc(jobId)
        .get();

      if (!jobDoc.exists) {
        return;
      }

      const job = jobDoc.data() as Job;

      // Create notification based on job type
      let notificationType: string;
      let title: string;
      let message: string;

      switch (job.type) {
        case 'swiss-obligation-analysis':
          notificationType = 'analysis_failed';
          title = 'Analyse fehlgeschlagen';
          message = `Die Schweizer Obligationenrecht-Analyse ist fehlgeschlagen: ${error}`;
          break;
        case 'contract-generation':
          notificationType = 'contract_generation_failed';
          title = 'Vertragsgenerierung fehlgeschlagen';
          message = `Die Vertragsgenerierung ist fehlgeschlagen: ${error}`;
          break;
        default:
          notificationType = 'job_failed';
          title = 'Auftrag fehlgeschlagen';
          message = `Der Auftrag ist fehlgeschlagen: ${error}`;
      }

      const notification = {
        id: uuidv4(),
        userId: job.userId,
        type: notificationType,
        title,
        message,
        data: {
          jobId,
          error
        },
        read: false,
        createdAt: new Date()
      };

      await this.firestoreService.db
        .collection('notifications')
        .doc(notification.id)
        .set(notification);

      this.logger.info('Job error notification sent', { jobId, userId: job.userId, error });
    } catch (err) {
      this.logger.error('Failed to send job error notification', err as Error, { jobId, error });
    }
  }

  /**
   * Get user's jobs with pagination
   */
  public async getUserJobs(
    userId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{ jobs: Job[]; total: number }> {
    try {
      const query = this.firestoreService.db
        .collection('jobs')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .offset(offset);

      const snapshot = await query.get();
      const jobs = snapshot.docs.map(doc => {
        const data = doc.data();
        return this.convertFirestoreDataToJob(data);
      });

      // Get total count
      const totalQuery = await this.firestoreService.db
        .collection('jobs')
        .where('userId', '==', userId)
        .get();

      return {
        jobs,
        total: totalQuery.size
      };
    } catch (error) {
      this.logger.error('Failed to get user jobs', error as Error, { userId });
      throw error;
    }
  }
}
