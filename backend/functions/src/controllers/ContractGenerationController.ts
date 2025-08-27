import { FirestoreService } from '@services/FirestoreService';
import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger';
import { BaseController } from './BaseController';
import { ContractGenerationService, ContractGenerationRequest } from '../services/ContractGenerationService';
import { JobQueueService } from '../services/JobQueueService';

export class ContractGenerationController extends BaseController {
  private contractGenerationService: ContractGenerationService;
  private jobQueueService: JobQueueService;
  private fireStoreService: FirestoreService;

  constructor() {
    super();
    this.contractGenerationService = new ContractGenerationService();
    this.fireStoreService = new FirestoreService();
    this.jobQueueService = new JobQueueService(this.fireStoreService);
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
}
