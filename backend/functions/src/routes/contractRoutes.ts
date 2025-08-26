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

// Contract Generation
router.post('/generate', 
  ValidationMiddleware.validate({
    body: Joi.object({
      contractType: Joi.string().required(),
      parameters: Joi.object().required()
    })
  }),
  contractGenerationController.generateContract.bind(contractGenerationController)
);

// Get Contract Generation Result
router.get('/:generationId',
  ValidationMiddleware.validate({
    params: Joi.object({
      generationId: Joi.string().required()
    })
  }),
  contractGenerationController.getGenerationResult.bind(contractGenerationController)
);

// Download Contract PDF
router.get('/:generationId/pdf',
  ValidationMiddleware.validate({
    params: Joi.object({
      generationId: Joi.string().required()
    })
  }),
  contractGenerationController.downloadContractPDF.bind(contractGenerationController)
);

// List User's Contract Generations
router.get('/',
  ValidationMiddleware.validate({
    query: Joi.object({
      limit: Joi.number().integer().min(1).max(100).default(20)
    })
  }),
  contractGenerationController.listUserGenerations.bind(contractGenerationController)
);

// Delete Contract Generation
router.delete('/:generationId',
  ValidationMiddleware.validate({
    params: Joi.object({
      generationId: Joi.string().required()
    })
  }),
  contractGenerationController.deleteGeneration.bind(contractGenerationController)
);

export default router;
