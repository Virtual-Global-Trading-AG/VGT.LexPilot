import { Router } from 'express';
import { AdminController } from '../controllers/AdminController';
import { AuthMiddleware, authMiddleware } from '../middleware/authMiddleware';
import { ValidationMiddleware } from '../middleware/validationMiddleware';
import { rateLimitMiddleware } from '../middleware/rateLimitMiddleware';
import * as Joi from 'joi';

const router = Router();
const adminController = new AdminController();

// Apply authentication middleware to all admin routes
router.use(authMiddleware);

// Apply stricter rate limiting for admin operations
// router.use(rateLimitMiddleware);

// Validation schemas
const indexLegalTextsSchema = Joi.object({
  texts: Joi.array().items(
    Joi.object({
      content: Joi.string().min(10).max(100000).required(),
      title: Joi.string().min(1).max(255).required(),
      source: Joi.string().min(1).max(100).required(),
      jurisdiction: Joi.string().min(1).max(50).required(),
      legalArea: Joi.string().min(1).max(100).required()
    })
  ).min(1).max(50).required()
});

const searchLegalContextSchema = Joi.object({
  query: Joi.string().min(3).max(1000).required(),
  legalArea: Joi.string().max(100).optional(),
  jurisdiction: Joi.string().max(50).optional(),
  topK: Joi.number().integer().min(1).max(20).default(5)
});

const userUpdateSchema = Joi.object({
  role: Joi.string().valid('user', 'premium', 'admin').optional(),
  status: Joi.string().valid('active', 'suspended', 'banned').optional(),
  subscription: Joi.object({
    type: Joi.string().valid('free', 'premium', 'enterprise').required(),
    expiresAt: Joi.string().isoDate().optional()
  }).optional(),
  customClaims: Joi.object().pattern(Joi.string(), Joi.any()).optional()
}).min(1);

const systemMetricsSchema = Joi.object({
  from: Joi.string().isoDate().required(),
  to: Joi.string().isoDate().required(),
  granularity: Joi.string().valid('hour', 'day', 'week', 'month').default('day')
});

// ==========================================
// SYSTEM MANAGEMENT ROUTES
// ==========================================

router.get('/stats', 
  adminController.getSystemStats.bind(adminController)
);

router.get('/metrics',
  ValidationMiddleware.validate({ query: systemMetricsSchema }),
  adminController.getMetrics.bind(adminController)
);

// ==========================================
// USER MANAGEMENT ROUTES
// ==========================================

router.get('/users',
  adminController.getUsers.bind(adminController)
);

router.get('/users/:userId',
  adminController.getUserDetails.bind(adminController)
);

router.patch('/users/:userId',
  ValidationMiddleware.validate({ body: userUpdateSchema }),
  adminController.updateUser.bind(adminController)
);

router.delete('/users/:userId',
  adminController.deleteUser.bind(adminController)
);

// ==========================================
// RAG VECTOR STORE MANAGEMENT ROUTES
// ==========================================

/**
 * Index Legal Texts for RAG Vector Store
 * POST /api/admin/legal-texts/index
 */
router.post('/legal-texts/index',
  ValidationMiddleware.validate({ body: indexLegalTextsSchema }),
  adminController.indexLegalTexts.bind(adminController)
);

/**
 * Search Legal Context (Admin Testing)
 * POST /api/admin/legal-texts/search
 */
router.post('/legal-texts/search',
  ValidationMiddleware.validate({ body: searchLegalContextSchema }),
  adminController.searchLegalContext.bind(adminController)
);

/**
 * Get Vector Store Statistics
 * GET /api/admin/vector-store/stats
 */
router.get('/vector-store/stats',
  adminController.getVectorStoreStats.bind(adminController)
);

/**
 * Index Specific Legal Text (Admin Only)
 * POST /api/admin/legal-texts/index-specific
 */
router.post('/legal-texts/index-specific',
  adminController.indexSpecificLegalText.bind(adminController)
);

export default router;
