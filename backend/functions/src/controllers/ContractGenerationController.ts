import { FirestoreService } from '@services/FirestoreService';
import { StorageService } from '@services/StorageService';
import { NextFunction, Request, Response } from 'express';
import OpenAI from 'openai';
import { ContractGenerationRequest, ContractGenerationService } from '../services/ContractGenerationService';
import { JobQueueService } from '../services/JobQueueService';
import { BaseController } from './BaseController';
import { env } from '@config/environment';

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

  /**
   * Get contract questions documents for a user
   */
  async getContractQuestionsDocuments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) {
        return this.sendError(res, 401, 'User not authenticated');
      }

      this.logger.info('Getting contract questions documents', {
        userId
      });

      const contractQuestionsDocuments = await this.fireStoreService.getContractQuestionsDocuments(userId);

      this.logger.info('Contract questions documents retrieved', {
        userId,
        count: contractQuestionsDocuments.length
      });

      this.sendSuccess(res, {
        documents: contractQuestionsDocuments,
        count: contractQuestionsDocuments.length
      });

    } catch (error) {
      this.logger.error('Error getting contract questions documents', error as Error, {
        userId: this.getUserId(req)
      });
      next(error);
    }
  }

  /**
   * Upload contract for questions with vector store creation
   */
  async uploadContractForQuestions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) {
        return this.sendError(res, 401, 'User not authenticated');
      }

      const { fileName, contentType, base64Content, metadata } = req.body;

      // Validate request
      const missingFields = this.validateRequiredFields(req.body, ['fileName', 'contentType', 'base64Content']);
      if (missingFields.length > 0) {
        this.sendError(res, 400, 'Missing required fields', `Required: ${missingFields.join(', ')}`);
        return;
      }

      this.logger.info('Contract upload for questions requested', {
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

      // Initialize OpenAI client
      const openai = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
      });

      // Upload file to OpenAI for vector store
      // Create a File-like object from the buffer
      const fileBlob = new Blob([buffer], { type: contentType });
      const file = new File([fileBlob], fileName, { type: contentType });

      const fileUpload = await openai.files.create({
        file: file,
        purpose: 'assistants',
      });

      // Create vector store
      const vectorStore = await openai.vectorStores.create({
        name: `${fileName}_store`,
      });

      // Add file to vector store
      await openai.vectorStores.files.create(
        vectorStore.id,
        {
          file_id: fileUpload.id,
        }
      );

      // Create document record with vector store information
      await this.fireStoreService.createDocument(userId, documentId, uploadResult.downloadUrl, {
        fileName,
        contentType,
        size,
        uploadedAt: new Date().toISOString(),
        status: 'uploaded',
        category: 'contract_questions',
        description: metadata?.description || `Contract uploaded for questions: ${fileName}`,
        tags: [...(metadata?.tags || []), 'contract_questions', 'vector_store'],
        vectorStoreId: vectorStore.id,
        openaiFileId: fileUpload.id
      });

      this.logger.info('Contract upload for questions completed successfully', {
        userId,
        documentId,
        fileName,
        vectorStoreId: vectorStore.id,
        openaiFileId: fileUpload.id
      });

      this.sendSuccess(res, {
        documentId,
        fileName,
        size,
        status: 'uploaded',
        vectorStoreId: vectorStore.id,
        quotaInfo: {
          used: quotaInfo.used + size,
          limit: quotaInfo.limit,
          available: quotaInfo.available - size,
          usagePercentage: Math.round(((quotaInfo.used + size) / quotaInfo.limit) * 100)
        }
      }, 'Contract uploaded successfully with vector store created');

    } catch (error) {
      this.logger.error('Contract upload for questions failed', error as Error, {
        userId: this.getUserId(req),
        fileName: req.body?.fileName
      });
      next(error);
    }
  }

  /**
   * Ask a question about a document using its vector store
   */
  async askDocumentQuestion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) {
        return this.sendError(res, 401, 'User not authenticated');
      }

      const { question, vectorStoreId } = req.body;

      // Validate request
      const missingFields = this.validateRequiredFields(req.body, ['question', 'vectorStoreId']);
      if (missingFields.length > 0) {
        this.sendError(res, 400, 'Missing required fields', `Required: ${missingFields.join(', ')}`);
        return;
      }

      this.logger.info('Document question requested', {
        userId,
        vectorStoreId,
        questionLength: question.length
      });

      // Initialize OpenAI client
      const openai = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
      });

      const response = await openai.responses.create({
        model: env.OPENAI_CHAT_MODEL,
        service_tier: 'priority',
        input: [
          {
            role: 'system',
            content: `Du bist ein präziser Dokumentenanalyst, der strukturierte JSON-Antworten erstellt.

WICHTIGE ANWEISUNGEN:
- Antworte AUSSCHLIESSLICH im JSON-Format
- Verwende das file_search Tool um relevante Informationen zu finden
- Stelle KEINE Rückfragen oder Nachfragen
- Antworte auf Deutsch

ERFORDERLICHES JSON-FORMAT:
{
  "answer": {
    "summary": "Kurze, präzise Antwort in 1-2 Sätzen",
    "detailed_explanation": "Ausführliche Erklärung basierend auf dem Dokument",
    "key_points": ["Wichtiger Punkt 1", "Wichtiger Punkt 2", "Wichtiger Punkt 3"],
    "confidence": 0.85,
    "document_references": ["Relevante Textstelle 1", "Relevante Textstelle 2"]
  },
  "sources": [
    {
      "content": "Direkter Textausschnitt aus dem Dokument",
      "context": "Bereich/Abschnitt des Dokuments",
      "relevance_score": 0.9
    }
  ],
  "metadata": {
    "search_queries_used": ["Verwendete Suchbegriffe"],
    "sources_found": 3,
    "timestamp": "${new Date().toISOString()}"
  }
}

REGELN:
- confidence: Wert zwischen 0.0 und 1.0 basierend auf Verfügbarkeit der Information
- relevance_score: Wert zwischen 0.0 und 1.0 für jede Quelle
- Wenn Information nicht verfügbar: confidence auf 0.1 setzen und in summary erwähnen
- Alle Texte auf Deutsch
- Keine zusätzlichen Kommentare außerhalb des JSON`
          },
          {
            role: 'user',
            content: question
          }
        ],
        tools: [
          {
            type: 'file_search',
            vector_store_ids: [vectorStoreId]
          },
        ],
      });

      const rawAnswer = response.output_text;

      this.logger.info('Document question answered successfully', {
        userId,
        vectorStoreId,
        answerLength: rawAnswer?.length || 0
      });

      if (!rawAnswer) {
        this.sendError(res, 500, 'No answer received from OpenAI');
        return;
      }

      // Try to parse JSON response
      let structuredAnswer;
      let isStructured = false;

      try {
        structuredAnswer = JSON.parse(rawAnswer);

        // Validate required structure
        if (structuredAnswer.answer && 
            structuredAnswer.answer.summary && 
            structuredAnswer.answer.confidence !== undefined &&
            Array.isArray(structuredAnswer.answer.key_points) &&
            Array.isArray(structuredAnswer.sources) &&
            structuredAnswer.metadata) {

          isStructured = true;

          // Add additional metadata
          structuredAnswer.metadata.processing_time = Date.now() - Date.now(); // Placeholder
          structuredAnswer.metadata.model_used = env.OPENAI_CHAT_MODEL;
          structuredAnswer.metadata.document_id = 'unknown'; // Would need to be passed from request
          structuredAnswer.metadata.vector_store_id = vectorStoreId;

          this.logger.info('Structured JSON response parsed successfully', {
            userId,
            vectorStoreId,
            confidence: structuredAnswer.answer.confidence,
            keyPointsCount: structuredAnswer.answer.key_points.length,
            sourcesCount: structuredAnswer.sources.length
          });
        }
      } catch (parseError) {
        this.logger.warn('Failed to parse JSON response, falling back to plain text', parseError as Error);
      }

      // Send structured response if available, otherwise fallback to plain text
      if (isStructured) {
        this.sendSuccess(res, {
          question,
          structured_answer: structuredAnswer,
          is_structured: true,
          vectorStoreId,
          timestamp: new Date().toISOString()
        }, 'Structured question answered successfully');
      } else {
        // Fallback to original format for backward compatibility
        this.sendSuccess(res, {
          question,
          answer: rawAnswer,
          is_structured: false,
          vectorStoreId,
          timestamp: new Date().toISOString()
        }, 'Question answered successfully');
      }

    } catch (error) {
      this.logger.error('Document question failed', error as Error, {
        userId: this.getUserId(req),
        vectorStoreId: req.body?.vectorStoreId
      });
      next(error);
    }
  }

  private generateDocumentId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
