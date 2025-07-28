import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger';
import { BaseController } from './BaseController';
import { AnalysisService } from '../services/AnalysisService';

interface DocumentAnalysisRequest {
  documentId: string;
  analysisType: 'gdpr' | 'contract_risk' | 'legal_review';
  options?: {
    priority?: 'low' | 'normal' | 'high';
    notifyByEmail?: boolean;
    detailedReport?: boolean;
  };
}

export class AnalysisController extends BaseController {
  private readonly analysisService: AnalysisService;

  constructor() {
    super();
    this.analysisService = new AnalysisService();
  }

  /**
   * Create new analysis
   * POST /api/analysis/
   */
  public async createAnalysis(req: Request, res: Response, next: NextFunction): Promise<void> {
    return this.startAnalysis(req, res, next);
  }

  /**
   * Get analysis by ID
   * GET /api/analysis/:analysisId
   */
  public async getAnalysis(req: Request, res: Response, next: NextFunction): Promise<void> {
    return this.getAnalysisStatus(req, res, next);
  }

  /**
   * Get all user analyses
   * GET /api/analysis/
   */
  public async getAnalyses(req: Request, res: Response, next: NextFunction): Promise<void> {
    return this.listUserAnalyses(req, res, next);
  }

  /**
   * Delete analysis
   * DELETE /api/analysis/:analysisId
   */
  public async deleteAnalysis(req: Request, res: Response, next: NextFunction): Promise<void> {
    return this.cancelAnalysis(req, res, next);
  }

  /**
   * Start analysis operation
   * POST /api/analysis/:analysisId/start
   */
  public async startAnalysisOperation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { analysisId } = req.params;

      if (!analysisId) {
        this.sendError(res, 400, 'Missing analysisId parameter');
        return;
      }

      const analysis = await this.getAnalysisById(analysisId, userId);
      if (!analysis) {
        this.sendError(res, 404, 'Analysis not found');
        return;
      }

      if (analysis.status !== 'pending') {
        this.sendError(res, 409, 'Analysis cannot be started', 
          `Analysis is currently in ${analysis.status} state`);
        return;
      }

      await this.startAnalysisExecution(analysisId);

      this.sendSuccess(res, {
        analysisId,
        status: 'processing',
        message: 'Analysis started successfully'
      });

    } catch (error) {
      this.logger.error('Start analysis operation failed', error as Error, {
        userId: this.getUserId(req),
        analysisId: req.params.analysisId
      });
      next(error);
    }
  }

  /**
   * Stop analysis operation
   * POST /api/analysis/:analysisId/stop
   */
  public async stopAnalysisOperation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { analysisId } = req.params;

      if (!analysisId) {
        this.sendError(res, 400, 'Missing analysisId parameter');
        return;
      }

      const analysis = await this.getAnalysisById(analysisId, userId);
      if (!analysis) {
        this.sendError(res, 404, 'Analysis not found');
        return;
      }

      if (analysis.status !== 'processing') {
        this.sendError(res, 409, 'Analysis cannot be stopped', 
          `Analysis is currently in ${analysis.status} state`);
        return;
      }

      await this.stopAnalysisExecution(analysisId);

      this.sendSuccess(res, {
        analysisId,
        status: 'stopped',
        message: 'Analysis stopped successfully'
      });

    } catch (error) {
      this.logger.error('Stop analysis operation failed', error as Error, {
        userId: this.getUserId(req),
        analysisId: req.params.analysisId
      });
      next(error);
    }
  }

  /**
   * Export analysis results
   * GET /api/analysis/:analysisId/export
   */
  public async exportAnalysis(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { analysisId } = req.params;
      const { format = 'pdf' } = req.query;

      if (!analysisId) {
        this.sendError(res, 400, 'Missing analysisId parameter');
        return;
      }

      const analysis = await this.getAnalysisById(analysisId, userId);
      if (!analysis) {
        this.sendError(res, 404, 'Analysis not found');
        return;
      }

      if (analysis.status !== 'completed') {
        this.sendError(res, 409, 'Analysis not completed', 
          'Export is only available for completed analyses');
        return;
      }

      const exportUrl = await this.generateExportUrl(analysisId, format as string);

      this.sendSuccess(res, {
        analysisId,
        exportUrl,
        format,
        expiresIn: 3600 // 1 hour
      });

    } catch (error) {
      this.logger.error('Export analysis failed', error as Error, {
        userId: this.getUserId(req),
        analysisId: req.params.analysisId,
        format: req.query.format
      });
      next(error);
    }
  }

    /**
   * Start document analysis
   * POST /api/analysis/start
   */
  public async startAnalysis(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { documentId, analysisType, options }: DocumentAnalysisRequest = req.body;

      // Validate request
      if (!documentId || !analysisType) {
        this.sendError(res, 400, 'Missing required fields', 'documentId and analysisType are required');
        return;
      }

      this.logger.info('Analysis start requested', {
        userId,
        documentId,
        analysisType,
        options
      });

      // Start analysis using the integrated service
      const analysisId = await this.analysisService.startAnalysis({
        documentId,
        userId,
        analysisType,
        options: {
          priority: options?.priority || 'normal',
          notifyByEmail: options?.notifyByEmail || false,
          detailedReport: options?.detailedReport || true,
          language: 'de' // Default to German for Swiss legal documents
        }
      });

      res.status(202).json({
        success: true,
        analysisId,
        message: 'Analysis started successfully',
        estimatedDuration: this.getEstimatedDuration(analysisType)
      });

    } catch (error) {
      this.logger.error('Analysis start failed', error as Error, {
        userId: this.getUserId(req),
        body: req.body
      });
      next(error);
    }
  }

  /**
   * Get analysis status
   * GET /api/analysis/:analysisId/status
   */
  public async getAnalysisStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { analysisId } = req.params;

      if (!analysisId) {
        this.sendError(res, 400, 'Analysis ID is required');
        return;
      }

      const analysis = await this.analysisService.getAnalysisResult(analysisId, userId);
      
      if (!analysis) {
        this.sendError(res, 404, 'Analysis not found');
        return;
      }

      res.json({
        analysisId,
        status: analysis.status,
        progress: analysis.progress || 0,
        createdAt: analysis.createdAt,
        updatedAt: analysis.updatedAt,
        estimatedCompletion: analysis.estimatedCompletion,
        results: analysis.status === 'completed' ? analysis.results : null
      });

    } catch (error) {
      this.logger.error('Get analysis status failed', error as Error, {
        userId: this.getUserId(req),
        analysisId: req.params.analysisId
      });
      next(error);
    }
  }

  /**
   * Get analysis results
   * GET /api/analysis/:analysisId/results
   */
  public async getAnalysisResults(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { analysisId } = req.params;
      const { format = 'json' } = req.query;

      if (!analysisId) {
        res.status(400).json({
          error: 'Missing analysisId parameter'
        });
        return;
      }

      const analysis = await this.getAnalysisById(analysisId, userId);
      
      if (!analysis) {
        res.status(404).json({
          error: 'Analysis not found',
          message: 'Analysis not found or access denied'
        });
        return;
      }

      if (analysis.status !== 'completed') {
        res.status(409).json({
          error: 'Analysis not completed',
          message: 'Analysis is still in progress',
          status: analysis.status,
          progress: analysis.progress
        });
        return;
      }

      // Format results based on requested format
      if (format === 'pdf') {
        await this.generatePDFReport(analysis, res);
      } else if (format === 'word') {
        await this.generateWordReport(analysis, res);
      } else {
        res.json({
          analysisId,
          results: analysis.results,
          metadata: {
            analysisType: analysis.type,
            confidence: analysis.confidence,
            processingTime: analysis.processingTime,
            createdAt: analysis.createdAt,
            completedAt: analysis.completedAt
          }
        });
      }

    } catch (error) {
      this.logger.error('Get analysis results failed', error as Error, {
        userId: this.getUserId(req),
        analysisId: req.params.analysisId
      });
      next(error);
    }
  }

    /**
   * Cancel analysis
   * DELETE /api/analysis/:analysisId
   */
  public async cancelAnalysis(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { analysisId } = req.params;

      if (!analysisId) {
        this.sendError(res, 400, 'Analysis ID is required');
        return;
      }

      const analysis = await this.analysisService.getAnalysisResult(analysisId, userId);
      
      if (!analysis) {
        this.sendError(res, 404, 'Analysis not found');
        return;
      }

      if (analysis.status === 'completed' || analysis.status === 'cancelled') {
        this.sendError(res, 400, 'Cannot cancel completed or already cancelled analysis');
        return;
      }

      await this.analysisService.cancelAnalysis(analysisId, userId);

      res.json({
        success: true,
        message: 'Analysis cancelled successfully',
        analysisId
      });

    } catch (error) {
      this.logger.error('Cancel analysis failed', error as Error, {
        userId: this.getUserId(req),
        analysisId: req.params.analysisId
      });
      next(error);
    }
  }

  /**
   * List user analyses
   * GET /api/analysis/list
   */
  public async listUserAnalyses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { 
        status, 
        type, 
        page = 1, 
        limit = 20, 
        sortBy = 'createdAt', 
        sortOrder = 'desc' 
      } = req.query;

      const analyses = await this.analysisService.listUserAnalyses(userId, {
        status: status as string,
        type: type as string,
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      });

      res.json({
        success: true,
        data: analyses,
        pagination: {
          page: analyses.page,
          limit: analyses.limit,
          total: analyses.total,
          totalPages: Math.ceil(analyses.total / analyses.limit)
        }
      });

    } catch (error) {
      this.logger.error('List user analyses failed', error as Error, {
        userId: this.getUserId(req),
        query: req.query
      });
      next(error);
    }
  }

  // Private helper methods
  private async checkDocumentAccess(userId: string, documentId: string): Promise<void> {
    // TODO: Implement document access check
    return Promise.resolve();
  }

  private async checkRateLimit(userId: string, operation: string): Promise<void> {
    // TODO: Implement rate limiting
    return Promise.resolve();
  }

  private async checkUserBudget(userId: string): Promise<void> {
    // TODO: Implement budget check
    return Promise.resolve();
  }

  private async initiateAnalysis(
    userId: string,
    documentId: string,
    analysisType: string,
    options?: any
  ): Promise<string> {
    // TODO: Implement analysis initiation
    return `analysis_${Date.now()}`;
  }

  private async getAnalysisById(analysisId: string, userId: string): Promise<any> {
    // TODO: Implement analysis retrieval
    return null;
  }

  private getEstimatedDuration(analysisType: string): string {
    const durations = {
      'gdpr': '2-5 minutes',
      'contract_risk': '3-8 minutes',
      'legal_review': '5-15 minutes'
    };
    return durations[analysisType as keyof typeof durations] || '5-10 minutes';
  }

  private async generatePDFReport(analysis: any, res: Response): Promise<void> {
    // TODO: Implement PDF generation
    res.status(501).json({
      error: 'Not implemented',
      message: 'PDF report generation will be implemented in Phase 2'
    });
  }

  private async generateWordReport(analysis: any, res: Response): Promise<void> {
    // TODO: Implement Word document generation
    res.status(501).json({
      error: 'Not implemented',
      message: 'Word report generation will be implemented in Phase 2'
    });
  }

  private async cancelAnalysisProcess(analysisId: string): Promise<void> {
    // TODO: Implement analysis cancellation
    return Promise.resolve();
  }

  private async getUserAnalyses(userId: string, options: any): Promise<any> {
    // TODO: Implement user analyses retrieval
    return {
      items: [],
      page: options.page,
      limit: options.limit,
      total: 0,
      totalPages: 0
    };
  }

  private async startAnalysisExecution(analysisId: string): Promise<void> {
    // TODO: Implement analysis execution start
    return Promise.resolve();
  }

  private async stopAnalysisExecution(analysisId: string): Promise<void> {
    // TODO: Implement analysis execution stop
    return Promise.resolve();
  }

  private async generateExportUrl(analysisId: string, format: string): Promise<string> {
    // TODO: Implement export URL generation
    return `https://storage.googleapis.com/exports/${analysisId}.${format}`;
  }
}
