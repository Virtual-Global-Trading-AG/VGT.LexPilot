import { Router } from 'express';
import * as Joi from 'joi';
import { AuthController } from '../controllers/AuthController';
import { AuthMiddleware } from '../middleware/authMiddleware';
import { RateLimitMiddleware } from '../middleware/rateLimitMiddleware';
import { ValidationMiddleware } from '../middleware/validationMiddleware';

/**
 * Authentication Routes
 * Handles user authentication, registration, and session management
 */
export function createAuthRoutes(): Router {
  const router = Router();
  const authController = new AuthController();

  // Rate limiting for all auth endpoints
  router.use(RateLimitMiddleware.authLimiter);

  /**
   * User Login
   * POST /api/auth/login
   */
  router.post('/login',
    ValidationMiddleware.validate({
      body: Joi.object({
        email: Joi.string().email().required().messages({
          'string.email': 'Please provide a valid email address',
          'any.required': 'Email is required'
        }),
        password: Joi.string().min(6).required().messages({
          'string.min': 'Password must be at least 6 characters long',
          'any.required': 'Password is required'
        })
      })
    }),
    authController.login.bind(authController)
  );

  /**
   * User Registration
   * POST /api/auth/register
   */
  router.post('/register',
    ValidationMiddleware.validate({
      body: Joi.object({
        email: Joi.string().email().required().messages({
          'string.email': 'Please provide a valid email address',
          'any.required': 'Email is required'
        }),
        password: Joi.string().min(6).required().messages({
          'string.min': 'Password must be at least 6 characters long',
          'any.required': 'Password is required'
        }),
        displayName: Joi.string().optional(),
        firstName: Joi.string().optional(),
        lastName: Joi.string().optional()
      })
    }),
    authController.register.bind(authController)
  );

  /**
   * Token Refresh
   * POST /api/auth/refresh
   */
  router.post('/refresh',
    ValidationMiddleware.validate({
      body: Joi.object({
        refreshToken: Joi.string().required().messages({
          'any.required': 'Refresh token is required'
        })
      })
    }),
    authController.refreshToken.bind(authController)
  );

  /**
   * Password Reset Request
   * POST /api/auth/reset-password
   */
  router.post('/reset-password',
    ValidationMiddleware.validate({
      body: Joi.object({
        email: Joi.string().email().required().messages({
          'string.email': 'Please provide a valid email address',
          'any.required': 'Email is required'
        })
      })
    }),
    authController.resetPassword.bind(authController)
  );

  /**
   * Email Verification
   * POST /api/auth/verify-email
   */
  router.post('/verify-email',
    ValidationMiddleware.validate({
      body: Joi.object({
        oobCode: Joi.string().required().messages({
          'any.required': 'Verification code is required'
        })
      })
    }),
    authController.verifyEmail.bind(authController)
  );

  // ==========================================
  // AUTHENTICATED ROUTES (auth required)
  // ==========================================

  /**
   * User Logout
   * POST /api/auth/logout
   */
  router.post('/logout',
    AuthMiddleware.authenticate,
    authController.logout.bind(authController)
  );

  /**
   * Get Current User Profile
   * GET /api/auth/me
   */
  router.get('/me',
    AuthMiddleware.authenticate,
    authController.getCurrentUser.bind(authController)
  );

  /**
   * Change Password
   * POST /api/auth/change-password
   */
  router.post('/change-password',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validate({
      body: Joi.object({
        currentPassword: Joi.string().required().messages({
          'any.required': 'Current password is required'
        }),
        newPassword: Joi.string().min(6).required().messages({
          'string.min': 'New password must be at least 6 characters long',
          'any.required': 'New password is required'
        })
      })
    }),
    authController.changePassword.bind(authController)
  );

  // ==========================================
  // ADDITIONAL VALIDATION ENDPOINTS
  // ==========================================

  /**
   * Check if email exists (for registration form validation)
   * POST /api/auth/check-email
   */
  router.post('/check-email',
    ValidationMiddleware.validate({
      body: Joi.object({
        email: Joi.string().email().required()
      })
    }),
    async (req, res) => {
      try {
        const { email } = req.body;
        const { getAuth } = await import('firebase-admin/auth');

        try {
          await getAuth().getUserByEmail(email);
          res.json({ exists: true });
        } catch (error) {
          res.json({ exists: false });
        }
      } catch (error) {
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Unable to check email availability'
        });
      }
    }
  );

  /**
   * Health check for auth service
   * GET /api/auth/health
   */
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'authentication',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  });

  return router;
}

export default createAuthRoutes;