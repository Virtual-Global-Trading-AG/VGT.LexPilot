import { Router } from 'express';
import { DocumentController } from '../controllers/DocumentController';
import { authMiddleware } from '../middleware/authMiddleware';
import { ValidationMiddleware } from '../middleware/validationMiddleware';
import { rateLimitMiddleware } from '../middleware/rateLimitMiddleware';
import * as Joi from 'joi';

const router = Router();
const documentController = new DocumentController();

// Apply authentication middleware to all document routes
router.use(authMiddleware);

// Apply rate limiting to document operations
//router.use(rateLimitMiddleware);

// Validation schemas
const uploadDocumentSchema = Joi.object({
  fileName: Joi.string().min(1).max(255).required()
    .pattern(/^[a-zA-Z0-9._\-\s]+\.(pdf|docx|doc|txt|md|csv)$/i)
    .messages({
      'string.pattern.base': 'File name must have a valid extension (pdf, docx, doc, txt, md, csv)'
    }),
  contentType: Joi.string().valid(
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/csv'
  ).required(),
  size: Joi.number().min(1).max(52428800).required(), // Max 50MB
  metadata: Joi.object({
    category: Joi.string().valid('nda', 'contract', 'other'),
    description: Joi.string().max(1000),
    tags: Joi.array().items(Joi.string().max(50)).max(10)
  }).optional()
});

const uploadDocumentDirectSchema = Joi.object({
  fileName: Joi.string().min(1).max(255).required()
    .pattern(/^[a-zA-Z0-9._\-\s]+\.(pdf|docx|doc|txt|md|csv)$/i)
    .messages({
      'string.pattern.base': 'File name must have a valid extension (pdf, docx, doc, txt, md, csv)'
    }),
  contentType: Joi.string().valid(
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/csv'
  ).required(),
  base64Content: Joi.string().required()
    .pattern(/^[A-Za-z0-9+/]*={0,2}$/)
    .messages({
      'string.pattern.base': 'Invalid base64 content format'
    }),
  metadata: Joi.object({
    category: Joi.string().valid('contract', 'legal_document', 'policy', 'other'),
    description: Joi.string().max(1000),
    tags: Joi.array().items(Joi.string().max(50)).max(10)
  }).optional()
});

const updateDocumentSchema = Joi.object({
  title: Joi.string().min(1).max(255).optional(),
  description: Joi.string().max(1000).optional(),
  tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
  category: Joi.string().valid('contract', 'legal_document', 'policy', 'other').optional()
}).min(1); // At least one field required

const updateStatusSchema = Joi.object({
  status: Joi.string().valid('uploading', 'uploaded', 'processing', 'processed', 'error').required()
});

const analyzeDocumentSchema = Joi.object({
  analysisType: Joi.string().valid('gdpr', 'contract_risk', 'legal_review').required(),
  options: Joi.object({
    priority: Joi.string().valid('low', 'normal', 'high').default('normal'),
    notifyByEmail: Joi.boolean().default(false),
    detailedReport: Joi.boolean().default(true),
    language: Joi.string().valid('de', 'en', 'fr', 'it').default('de')
  }).optional()
});

const ragAnalysisSchema = Joi.object({
  legalArea: Joi.string().max(100).optional(),
  jurisdiction: Joi.string().max(50).default('CH'),
  language: Joi.string().valid('de', 'en', 'fr', 'it').default('de')
});

const dsgvoCheckSchema = Joi.object({
  text: Joi.string().min(10).max(50000).required(),
  saveResults: Joi.boolean().default(false),
  language: Joi.string().valid('de', 'en', 'fr', 'it').default('de')
});

// Schema für den vollständigen DSGVO Check
const completeDsgvoCheckSchema = Joi.object({
  question: Joi.string().min(10).max(5000).required().messages({
    'string.min': 'Die Frage muss mindestens 10 Zeichen lang sein',
    'string.max': 'Die Frage darf maximal 5.000 Zeichen lang sein',
    'any.required': 'Eine Benutzerfrage ist erforderlich'
  }),
  language: Joi.string().valid('de', 'en', 'fr', 'it').default('de'),
  includeContext: Joi.boolean().default(true),
  maxSources: Joi.number().integer().min(3).max(15).default(10)
});


const similaritySearchSchema = Joi.object({
  text: Joi.string().min(10).max(10000).required(),
  indexName: Joi.string().default('legal-texts'),
  namespace: Joi.string().default('legal-regulations'),
  topK: Joi.number().integer().min(1).max(20).default(5)
});

const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('pending', 'processing', 'completed', 'failed', 'cancelled').optional(),
  type: Joi.string().valid('gdpr', 'contract_risk', 'legal_review').optional()
});

const searchSchema = Joi.object({
  q: Joi.string().min(1).max(255).required(),
  status: Joi.string().valid('uploading', 'uploaded', 'processing', 'processed', 'error').optional(),
  category: Joi.string().valid('contract', 'legal_document', 'policy', 'other').optional(),
  page: Joi.number().min(1).default(1).optional(),
  limit: Joi.number().min(1).max(100).default(10).optional()
});

router.post('/upload-direct', 
  ValidationMiddleware.validate({ body: uploadDocumentDirectSchema }),
  documentController.uploadDocumentDirect.bind(documentController)
);

router.get('/', 
  documentController.getDocuments.bind(documentController)
);

router.get('/search',
  ValidationMiddleware.validate({ query: searchSchema }),
  documentController.searchDocuments.bind(documentController)
);

router.get('/stats',
  documentController.getStorageStats.bind(documentController)
);


router.delete('/:documentId', 
  documentController.deleteDocument.bind(documentController)
);

router.get('/:documentId/analysis/:analysisId',
  documentController.getAnalysisResults.bind(documentController)
);

router.delete('/:documentId/analysis/:analysisId',
  documentController.cancelAnalysis.bind(documentController)
);

// DSGVO Compliance Check (Text Input)
router.post('/dsgvo-check',
  ValidationMiddleware.validate({ body: dsgvoCheckSchema }),
  documentController.checkDSGVOCompliance.bind(documentController)
);

// Vollständiger DSGVO Check mit ChatGPT/LangChain Integration
router.post('/dsgvo-check-complete',
  ValidationMiddleware.validate({ body: completeDsgvoCheckSchema }),
  documentController.completeDSGVOCheck.bind(documentController)
);

export default router;
