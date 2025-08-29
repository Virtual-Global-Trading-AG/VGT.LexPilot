import { Router } from 'express';
import * as Joi from 'joi';
import { AdminController } from '../controllers/AdminController';
import { authMiddleware } from '../middleware/authMiddleware';
import { ValidationMiddleware } from '../middleware/validationMiddleware';

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

export default router;