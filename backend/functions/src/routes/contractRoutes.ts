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
export default router;
