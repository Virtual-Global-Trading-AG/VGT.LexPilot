import { Router } from 'express';
import * as Joi from 'joi';
import { AuthController } from '../controllers/AuthController';
import { AuthMiddleware } from '../middleware/authMiddleware';
import { RateLimitMiddleware } from '../middleware/rateLimitMiddleware';
import { ValidationMiddleware } from '../middleware/validationMiddleware';
import { UserController } from '@/controllers';


export function createUserRoutes(): Router {
  // ==========================================
  // USER ROUTES
  // ==========================================
  const userRouter = Router();
  const userController = new UserController();

  // Authentication required for all user routes
  userRouter.use(AuthMiddleware.authenticate);
  userRouter.use(RateLimitMiddleware.apiLimiter);

  // Profile Management
  userRouter.get('/profile', userController.getProfile.bind(userController));

  userRouter.put('/profile',
    ValidationMiddleware.validators.updateProfile,
    userController.updateProfile.bind(userController)
  );

  userRouter.delete('/profile',
    ValidationMiddleware.validate({
      body: Joi.object({
        confirmPassword: Joi.string().required()
      })
    }),
    userController.deleteAccount.bind(userController)
  );

  // User Statistics
  userRouter.get('/stats', userController.getStats.bind(userController));

  // Notifications
  userRouter.get('/notifications',
    ValidationMiddleware.validate({
      query: ValidationMiddleware.schemas.pagination
    }),
    userController.getNotifications.bind(userController)
  );

  userRouter.put('/notifications/:notificationId/read',
    ValidationMiddleware.validate({
      params: Joi.object({
        notificationId: ValidationMiddleware.schemas.id
      })
    }),
    userController.markNotificationRead.bind(userController)
  );


  // Preferences
  userRouter.put('/preferences',
    ValidationMiddleware.validate({
      body: Joi.object({
        language: Joi.string().valid('de', 'en', 'fr', 'it').optional(),
        timezone: Joi.string().optional(),
        notifications: Joi.object({
          email: Joi.boolean().optional(),
          push: Joi.boolean().optional(),
          sms: Joi.boolean().optional()
        }).optional()
      })
    }),
    userController.updatePreferences.bind(userController)
  );

  return userRouter;
}

export default createUserRoutes;