import { Router } from 'express';
import * as Joi from 'joi';
import { ContractGenerationController } from '../controllers/ContractGenerationController';
import { authMiddleware } from '../middleware/authMiddleware';
import { ValidationMiddleware } from '../middleware/validationMiddleware';

const router = Router();
const contractGenerationController = new ContractGenerationController();

// Apply authentication middleware to all document routes
router.use(authMiddleware);

// Contract Types
router.get('/types', contractGenerationController.getContractTypes.bind(contractGenerationController));

// Get all user documents with optional tag filtering
router.get('/documents', contractGenerationController.getAllUserDocuments.bind(contractGenerationController));

// Get contract questions documents for a user
router.get('/contract-questions-documents', contractGenerationController.getContractQuestionsDocuments.bind(contractGenerationController));

// Contract Generation (synchronous)
router.post('/generate', 
  ValidationMiddleware.validate({
    body: Joi.object({
      contractType: Joi.string().required(),
      parameters: Joi.object().required()
    })
  }),
  contractGenerationController.generateContract.bind(contractGenerationController)
);

// Contract Generation (asynchronous with job queue)
router.post('/generate-async', 
  ValidationMiddleware.validate({
    body: Joi.object({
      contractType: Joi.string().required(),
      parameters: Joi.object().required()
    })
  }),
  contractGenerationController.generateContractAsync.bind(contractGenerationController)
);

// Get Contract Generation Job Status
router.get('/jobs/:jobId',
  ValidationMiddleware.validate({
    params: Joi.object({
      jobId: Joi.string().required()
    })
  }),
  contractGenerationController.getContractGenerationJobStatus.bind(contractGenerationController)
);

// Upload Contract for Questions (Vertragsfragen) with Vector Store Creation
router.post('/upload-for-questions',
  ValidationMiddleware.validate({
    body: Joi.object({
      fileName: Joi.string().min(1).max(255).required()
        .pattern(/^.+\.(pdf|docx|doc|txt|md)$/i)
        .messages({
          'string.pattern.base': 'File name must have a valid extension (pdf, docx, doc, txt, md)'
        }),
      contentType: Joi.string().valid(
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/markdown'
      ).required(),
      base64Content: Joi.string().required()
        .pattern(/^[A-Za-z0-9+/]*={0,2}$/)
        .messages({
          'string.pattern.base': 'Invalid base64 content format'
        }),
      metadata: Joi.object({
        description: Joi.string().max(1000),
        tags: Joi.array().items(Joi.string().max(50)).max(10)
      }).optional()
    })
  }),
  contractGenerationController.uploadContractForQuestions.bind(contractGenerationController)
);

// Ask Question about Document using Vector Store
router.post('/ask-question',
  ValidationMiddleware.validate({
    body: Joi.object({
      question: Joi.string().min(1).max(2000).required()
        .messages({
          'string.min': 'Question cannot be empty',
          'string.max': 'Question cannot exceed 2000 characters'
        }),
      vectorStoreId: Joi.string().required()
        .messages({
          'string.empty': 'Vector Store ID is required'
        })
    })
  }),
  contractGenerationController.askDocumentQuestion.bind(contractGenerationController)
);

export default router;
