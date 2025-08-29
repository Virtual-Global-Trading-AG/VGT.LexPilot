import { FirestoreService } from '@services/FirestoreService';
import { StorageService } from '@services/StorageService';
import { NextFunction, Request, Response } from 'express';
import { ContractGenerationRequest, ContractGenerationService } from '../services/ContractGenerationService';
import { JobQueueService } from '../services/JobQueueService';
import { BaseController } from './BaseController';

export class ContractGenerationController extends BaseController {
  private contractGenerationService: ContractGenerationService;
  private jobQueueService: JobQueueService;
  private fireStoreService: FirestoreService;
  private storageService: StorageService;

  constructor() {
    super();
    this.contractGenerationService = new ContractGenerationService();
    this.fireStoreService = new FirestoreService();
    this.jobQueueService = new JobQueueService(this.fireStoreService);
    this.storageService = new StorageService();
  }

  /**
   * Get available contract types
   */
  async getContractTypes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      this.logger.info('Getting contract types');

      const contractTypes = this.contractGenerationService.getContractTypes();

      this.sendSuccess(res, {
        contractTypes
      });
    } catch (error) {
      this.logger.error('Error getting contract types', error as Error);
      next(error);
    }
  }

  /**
   * Generate a new contract
   */
  async generateContract(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) {
        return this.sendError(res, 401, 'User not authenticated');
      }

      const { contractType, parameters } = req.body;

      if (!contractType || !parameters) {
        return this.sendError(res, 400, 'Contract type and parameters are required');
      }

      this.logger.info('Starting contract generation', {
        userId,
        contractType
      });

      const request: ContractGenerationRequest = {
        contractType,
        parameters,
        userId
      };

      const result = await this.contractGenerationService.generateContract(request);

      this.sendSuccess(res, {
        downloadUrl: result.downloadUrl,
        documentId: result.documentId,
        contractType,
        status: 'completed'
      });

    } catch (error) {
      this.logger.error('Error in contract generation endpoint', error as Error);
      next(error);
    }
  }

  /**
   * Generate a new contract asynchronously using job queue
   */
  async generateContractAsync(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) {
        return this.sendError(res, 401, 'User not authenticated');
      }

      const { contractType, parameters } = req.body;

      if (!contractType || !parameters) {
        return this.sendError(res, 400, 'Contract type and parameters are required');
      }

      this.logger.info('Starting async contract generation', {
        userId,
        contractType
      });

      // Create job for contract generation
      const jobId = await this.jobQueueService.createJob(
        'contract-generation',
        userId,
        {
          contractType,
          parameters,
          userId
        }
      );

      this.sendSuccess(res, {
        jobId,
        status: 'queued',
        message: 'Contract generation job created successfully'
      });

    } catch (error) {
      this.logger.error('Error in async contract generation endpoint', error as Error);
      next(error);
    }
  }

  /**
   * Get job status for contract generation
   */
  async getContractGenerationJobStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) {
        return this.sendError(res, 401, 'User not authenticated');
      }

      const { jobId } = req.params;

      if (!jobId) {
        return this.sendError(res, 400, 'Job ID is required');
      }

      this.logger.info('Getting contract generation job status', {
        userId,
        jobId
      });

      const job = await this.jobQueueService.getJob(jobId, userId);

      if (!job) {
        return this.sendError(res, 404, 'Job not found');
      }

      this.sendSuccess(res, {
        jobId: job.id,
        status: job.status,
        progress: job.progress,
        progressMessage: job.progressMessage,
        result: job.result,
        error: job.error,
        createdAt: job.createdAt,
        completedAt: job.completedAt
      });

    } catch (error) {
      this.logger.error('Error getting contract generation job status', error as Error);
      next(error);
    }
  }

  /**
   * Get all user documents with optional tag filtering
   */
  async getAllUserDocuments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) {
        return this.sendError(res, 401, 'User not authenticated');
      }

      const { tag } = req.query;

      this.logger.info('Getting all user documents', {
        userId,
        tag
      });

      const filteredDocuments = await this.fireStoreService.getAllUserDocuments(
        userId, 
        tag as string | undefined
      );

      this.logger.info('Getting all user documents', {
        documentsSize: filteredDocuments.length,
      });

      this.sendSuccess(res, {
        documents: filteredDocuments,
        count: filteredDocuments.length
      });

    } catch (error) {
      this.logger.error('Error getting all user documents', error as Error);
      next(error);
    }
  }
}
