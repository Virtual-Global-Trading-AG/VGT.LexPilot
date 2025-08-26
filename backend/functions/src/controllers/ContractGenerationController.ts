import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger';
import { BaseController } from './BaseController';
import { ContractGenerationService, ContractGenerationRequest } from '../services/ContractGenerationService';

export class ContractGenerationController extends BaseController {
  private contractGenerationService: ContractGenerationService;

  constructor() {
    super();
    this.contractGenerationService = new ContractGenerationService();
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
   * Get contract generation result
   */
  async getGenerationResult(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) {
        return this.sendError(res, 401, 'User not authenticated');
      }

      const { generationId } = req.params;

      if (!generationId) {
        return this.sendError(res, 400, 'Generation ID is required');
      }

      this.logger.info('Getting contract generation result', {
        userId,
        generationId
      });

      const result = await this.contractGenerationService.getGenerationResult(generationId, userId);

      if (!result) {
        return this.sendError(res, 404, 'Contract generation not found');
      }

      this.sendSuccess(res, {
        result: {
          id: result.id,
          contractType: result.contractType,
          parameters: result.parameters,
          markdownContent: result.markdownContent,
          status: result.status,
          createdAt: result.createdAt,
          error: result.error
        }
      });
    } catch (error) {
      this.logger.error('Error getting contract generation result', error as Error, {
        userId: (req as any).user?.uid,
        generationId: req.params.generationId
      });
      next(error);
    }
  }

  /**
   * Download contract as PDF
   */
  async downloadContractPDF(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) {
        return this.sendError(res, 401, 'User not authenticated');
      }

      const { generationId } = req.params;

      if (!generationId) {
        return this.sendError(res, 400, 'Generation ID is required');
      }

      this.logger.info('Downloading contract PDF', {
        userId,
        generationId
      });

      const result = await this.contractGenerationService.getGenerationResult(generationId, userId);

      if (!result) {
        return this.sendError(res, 404, 'Contract generation not found');
      }

      if (result.status !== 'completed') {
        return this.sendError(res, 400, 'Contract generation not completed');
      }

      // Regenerate PDF if not available (since we don't store it in Firestore)
      const contractTypes = this.contractGenerationService.getContractTypes();
      const contractType = contractTypes.find(ct => ct.id === result.contractType);

      if (!contractType) {
        return this.sendError(res, 404, 'Contract type not found');
      }

      // Generate PDF from the stored markdown content
      const pdfBuffer = await (this.contractGenerationService as any).generatePDF(
        result.markdownContent, 
        contractType.name
      );

      // Set headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="contract-${generationId}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      res.send(pdfBuffer);
    } catch (error) {
      this.logger.error('Error downloading contract PDF', error as Error, {
        userId: (req as any).user?.uid,
        generationId: req.params.generationId
      });
      next(error);
    }
  }

  /**
   * List user's contract generations
   */
  async listUserGenerations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) {
        return this.sendError(res, 401, 'User not authenticated');
      }

      const limit = parseInt(req.query.limit as string) || 20;

      this.logger.info('Listing user contract generations', {
        userId,
        limit
      });

      const results = await this.contractGenerationService.listUserGenerations(userId, limit);

      // Remove sensitive data and large content for list view
      const sanitizedResults = results.map(result => ({
        id: result.id,
        contractType: result.contractType,
        parameters: result.parameters,
        status: result.status,
        createdAt: result.createdAt,
        error: result.error
      }));

      this.sendSuccess(res, {
        results: sanitizedResults,
        total: sanitizedResults.length
      });
    } catch (error) {
      this.logger.error('Error listing user contract generations', error as Error, {
        userId: (req as any).user?.uid,
        limit: parseInt(req.query.limit as string) || 20
      });
      next(error);
    }
  }

  /**
   * Delete contract generation
   */
  async deleteGeneration(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) {
        return this.sendError(res, 401, 'User not authenticated');
      }

      const { generationId } = req.params;

      if (!generationId) {
        return this.sendError(res, 400, 'Generation ID is required');
      }

      this.logger.info('Deleting contract generation', {
        userId,
        generationId
      });

      await this.contractGenerationService.deleteGeneration(generationId, userId);

      this.sendSuccess(res, {
        message: 'Contract generation deleted successfully'
      });
    } catch (error) {
      this.logger.error('Error deleting contract generation', error as Error, {
        userId: (req as any).user?.uid,
        generationId: req.params.generationId
      });
      next(error);
    }
  }
}
