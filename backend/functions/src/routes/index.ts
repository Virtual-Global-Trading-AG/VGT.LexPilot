import { Router, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AuthMiddleware, authenticate, requireAdmin, requirePremium } from '../middleware/authMiddleware';
import { RateLimitMiddleware, rateLimitMiddleware } from '../middleware/rateLimitMiddleware';
import { ValidationMiddleware, validationMiddleware } from '../middleware/validationMiddleware';

// Import Controllers
import { 
  UserController, 
  DocumentController, 
  AnalysisController, 
  AdminController 
} from '../controllers';

/**
 * Zentrale API-Router-Konfiguration
 * Integriert alle Middleware-Komponenten und Controller
 */
export function createApiRoutes(): Router {
  const router = Router();

  // Controller Instanzen erstellen
  const userController = new UserController();
  const documentController = new DocumentController();
  const analysisController = new AnalysisController();
  const adminController = new AdminController();

  // ==========================================
  // AUTHENTICATION ROUTES
  // ==========================================
  const authRouter = Router();
  
  // Rate Limiting für Auth-Endpunkte
  authRouter.use(RateLimitMiddleware.authLimiter);

  // Login/Logout - no auth required
  authRouter.post('/login', 
    ValidationMiddleware.validate({
      body: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required()
      })
    }),
    (req: Request, res: Response) => {
      // TODO: Implementiere echte Login-Logik
      res.json({ message: 'Login endpoint', endpoint: req.path });
    }
  );
  
  authRouter.post('/logout',
    AuthMiddleware.authenticate,
    (req: Request, res: Response) => {
      // TODO: Implementiere echte Logout-Logik
      res.json({ message: 'Logout endpoint', endpoint: req.path });
    }
  );

  // Token Refresh
  authRouter.post('/refresh',
    ValidationMiddleware.validate({
      body: Joi.object({
        refreshToken: Joi.string().required()
      })
    }),
    (req: Request, res: Response) => {
      // TODO: Implementiere echte Refresh-Logik
      res.json({ message: 'Refresh endpoint', endpoint: req.path });
    }
  );

  // Password Reset
  authRouter.post('/reset-password',
    ValidationMiddleware.validate({
      body: Joi.object({
        email: Joi.string().email().required()
      })
    }),
    (req: Request, res: Response) => {
      // TODO: Implementiere echte Reset-Logik
      res.json({ message: 'Reset password endpoint', endpoint: req.path });
    }
  );

  router.use('/auth', authRouter);

  // ==========================================
  // USER ROUTES
  // ==========================================
  const userRouter = Router();
  
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
  
  userRouter.get('/usage', (req: Request, res: Response) => {
    res.json({ message: 'Get usage endpoint', endpoint: req.path });
  });

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
  
  userRouter.delete('/notifications/:notificationId', 
    ValidationMiddleware.validate({
      params: Joi.object({
        notificationId: ValidationMiddleware.schemas.id
      })
    }),
    (req: Request, res: Response) => {
      res.json({ message: 'Delete notification endpoint', endpoint: req.path });
    }
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

  router.use('/users', userRouter);

  // ==========================================
  // DOCUMENT ROUTES
  // ==========================================
  const documentRouter = Router();
  
  // Authentication required for all document routes
  documentRouter.use(AuthMiddleware.authenticate);
  documentRouter.use(RateLimitMiddleware.apiLimiter);

  // Document Management
  documentRouter.get('/', 
    ValidationMiddleware.validate({
      query: ValidationMiddleware.schemas.pagination
    }),
    documentController.getDocuments.bind(documentController)
  );
  
  documentRouter.get('/:documentId', 
    ValidationMiddleware.validators.getDocument,
    documentController.getDocument.bind(documentController)
  );
  
  documentRouter.post('/', 
    RateLimitMiddleware.uploadLimiter,
    ValidationMiddleware.validators.uploadDocument,
    documentController.uploadDocument.bind(documentController)
  );
  
  documentRouter.put('/:documentId', 
    ValidationMiddleware.validate({
      params: Joi.object({
        documentId: ValidationMiddleware.schemas.id
      }),
      body: Joi.object({
        title: Joi.string().min(1).max(200).optional(),
        description: Joi.string().max(1000).optional(),
        tags: Joi.array().items(Joi.string()).optional()
      })
    }),
    documentController.updateDocument.bind(documentController)
  );
  
  documentRouter.delete('/:documentId', 
    ValidationMiddleware.validate({
      params: Joi.object({
        documentId: ValidationMiddleware.schemas.id
      })
    }),
    documentController.deleteDocument.bind(documentController)
  );

  // Document Content
  documentRouter.get('/:documentId/content', 
    ValidationMiddleware.validators.getDocument,
    documentController.getDocumentContent.bind(documentController)
  );
  
  documentRouter.get('/:documentId/download', 
    ValidationMiddleware.validators.getDocument,
    documentController.downloadDocument.bind(documentController)
  );

  router.use('/documents', documentRouter);

  // ==========================================
  // ANALYSIS ROUTES
  // ==========================================
  const analysisRouter = Router();
  
  // Authentication required for all analysis routes
  analysisRouter.use(AuthMiddleware.authenticate);

  // Dynamic rate limiting based on user type
  analysisRouter.use((req, res, next) => {
    const user = (req as any).user;
    const isPremium = user?.customClaims?.premium || user?.role === 'admin';
    
    if (isPremium) {
      return RateLimitMiddleware.premiumAnalysisLimiter(req, res, next);
    } else {
      return RateLimitMiddleware.analysisLimiter(req, res, next);
    }
  });

  // Analysis Management
  analysisRouter.get('/', 
    ValidationMiddleware.validate({
      query: ValidationMiddleware.schemas.pagination
    }),
    analysisController.getAnalyses.bind(analysisController)
  );
  
  analysisRouter.get('/:analysisId', 
    ValidationMiddleware.validate({
      params: Joi.object({
        analysisId: ValidationMiddleware.schemas.id
      })
    }),
    analysisController.getAnalysis.bind(analysisController)
  );
  
  analysisRouter.post('/', 
    ValidationMiddleware.validators.analyzeDocument,
    analysisController.createAnalysis.bind(analysisController)
  );
  
  analysisRouter.delete('/:analysisId', 
    ValidationMiddleware.validate({
      params: Joi.object({
        analysisId: ValidationMiddleware.schemas.id
      })
    }),
    analysisController.deleteAnalysis.bind(analysisController)
  );

  // Analysis Operations
  analysisRouter.post('/:analysisId/start', 
    ValidationMiddleware.validate({
      params: Joi.object({
        analysisId: ValidationMiddleware.schemas.id
      })
    }),
    analysisController.startAnalysisOperation.bind(analysisController)
  );
  
  analysisRouter.post('/:analysisId/stop', 
    ValidationMiddleware.validate({
      params: Joi.object({
        analysisId: ValidationMiddleware.schemas.id
      })
    }),
    analysisController.stopAnalysisOperation.bind(analysisController)
  );
  
  analysisRouter.get('/:analysisId/results', 
    ValidationMiddleware.validate({
      params: Joi.object({
        analysisId: ValidationMiddleware.schemas.id
      })
    }),
    analysisController.getAnalysisResults.bind(analysisController)
  );
  
  analysisRouter.get('/:analysisId/export', 
    ValidationMiddleware.validate({
      params: Joi.object({
        analysisId: ValidationMiddleware.schemas.id
      }),
      query: Joi.object({
        format: Joi.string().valid('pdf', 'docx', 'json').default('pdf')
      })
    }),
    analysisController.exportAnalysis.bind(analysisController)
  );

  router.use('/analysis', analysisRouter);

  // ==========================================
  // ADMIN ROUTES
  // ==========================================
  const adminRouter = Router();
  
  // Admin authentication required
  adminRouter.use(AuthMiddleware.authenticate);
  adminRouter.use(AuthMiddleware.requireAdmin);
  adminRouter.use(RateLimitMiddleware.adminLimiter);

  // System Management
  adminRouter.get('/stats', adminController.getStats.bind(adminController));
  
  adminRouter.get('/health', (req: Request, res: Response) => {
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0'
    });
  });
  
  adminRouter.get('/metrics', 
    ValidationMiddleware.validate({
      query: Joi.object({
        from: Joi.date().iso().optional(),
        to: Joi.date().iso().optional(),
        granularity: Joi.string().valid('hour', 'day', 'week', 'month').default('day')
      })
    }),
    (req: Request, res: Response) => {
      res.json({ message: 'Get system metrics endpoint', endpoint: req.path });
    }
  );

  // User Management
  adminRouter.get('/users', 
    ValidationMiddleware.validate({
      query: Joi.object({
        ...ValidationMiddleware.schemas.pagination,
        status: Joi.string().valid('active', 'suspended', 'banned').optional(),
        role: Joi.string().valid('user', 'premium', 'admin').optional()
      })
    }),
    adminController.getUsers.bind(adminController)
  );
  
  adminRouter.get('/users/:userId', 
    ValidationMiddleware.validate({
      params: Joi.object({
        userId: ValidationMiddleware.schemas.id
      })
    }),
    adminController.getUserById.bind(adminController)
  );
  
  adminRouter.put('/users/:userId', 
    ValidationMiddleware.validate({
      params: Joi.object({
        userId: ValidationMiddleware.schemas.id
      }),
      body: ValidationMiddleware.schemas.adminUserUpdate
    }),
    adminController.updateUser.bind(adminController)
  );
  
  adminRouter.delete('/users/:userId', 
    ValidationMiddleware.validate({
      params: Joi.object({
        userId: ValidationMiddleware.schemas.id
      })
    }),
    adminController.deleteUser.bind(adminController)
  );
  
  adminRouter.post('/users/:userId/suspend', 
    ValidationMiddleware.validate({
      params: Joi.object({
        userId: ValidationMiddleware.schemas.id
      }),
      body: Joi.object({
        reason: Joi.string().required(),
        duration: Joi.number().integer().positive().optional()
      })
    }),
    (req: Request, res: Response) => {
      res.json({ message: 'Suspend user endpoint', endpoint: req.path });
    }
  );
  
  adminRouter.post('/users/:userId/unsuspend', 
    ValidationMiddleware.validate({
      params: Joi.object({
        userId: ValidationMiddleware.schemas.id
      })
    }),
    (req: Request, res: Response) => {
      res.json({ message: 'Unsuspend user endpoint', endpoint: req.path });
    }
  );

  // Analytics
  adminRouter.get('/analytics/usage', 
    ValidationMiddleware.validate({
      query: Joi.object({
        from: Joi.date().iso().optional(),
        to: Joi.date().iso().optional(),
        groupBy: Joi.string().valid('user', 'feature', 'time').default('time')
      })
    }),
    (req: Request, res: Response) => {
      res.json({ message: 'Get usage analytics endpoint', endpoint: req.path });
    }
  );
  
  adminRouter.get('/analytics/performance', 
    ValidationMiddleware.validate({
      query: Joi.object({
        from: Joi.date().iso().optional(),
        to: Joi.date().iso().optional(),
        metric: Joi.string().valid('response_time', 'error_rate', 'throughput').optional()
      })
    }),
    (req: Request, res: Response) => {
      res.json({ message: 'Get performance analytics endpoint', endpoint: req.path });
    }
  );

  // Audit Logs
  adminRouter.get('/audit-logs', 
    ValidationMiddleware.validate({
      query: Joi.object({
        ...ValidationMiddleware.schemas.pagination,
        action: Joi.string().optional(),
        userId: ValidationMiddleware.schemas.id.optional(),
        from: Joi.date().iso().optional(),
        to: Joi.date().iso().optional()
      })
    }),
    (req: Request, res: Response) => {
      res.json({ message: 'Get audit logs endpoint', endpoint: req.path });
    }
  );

  // System Configuration
  adminRouter.get('/config', (req: Request, res: Response) => {
    res.json({ message: 'Get system config endpoint', endpoint: req.path });
  });
  
  adminRouter.put('/config', 
    ValidationMiddleware.validate({
      body: Joi.object({
        rateLimits: Joi.object().optional(),
        features: Joi.object().optional(),
        maintenance: Joi.object({
          enabled: Joi.boolean().optional(),
          message: Joi.string().optional(),
          scheduledAt: Joi.date().iso().optional()
        }).optional()
      })
    }),
    (req: Request, res: Response) => {
      res.json({ message: 'Update system config endpoint', endpoint: req.path });
    }
  );

  router.use('/admin', adminRouter);

  // ==========================================
  // PREMIUM ROUTES
  // ==========================================
  const premiumRouter = Router();
  
  // Premium authentication required
  premiumRouter.use(AuthMiddleware.authenticate);
  premiumRouter.use(AuthMiddleware.requirePremium);
  premiumRouter.use(RateLimitMiddleware.premiumAnalysisLimiter);

  // Premium Features
  premiumRouter.get('/features', (req: Request, res: Response) => {
    res.json({ message: 'Get premium features endpoint', endpoint: req.path });
  });
  
  premiumRouter.get('/analytics', 
    ValidationMiddleware.validate({
      query: Joi.object({
        from: Joi.date().iso().optional(),
        to: Joi.date().iso().optional(),
        metric: Joi.string().valid('usage', 'performance', 'costs').optional()
      })
    }),
    (req: Request, res: Response) => {
      res.json({ message: 'Get premium analytics endpoint', endpoint: req.path });
    }
  );

  // Advanced Analysis
  premiumRouter.post('/analysis/advanced', 
    ValidationMiddleware.validate({
      body: Joi.object({
        documentIds: Joi.array().items(ValidationMiddleware.schemas.id).required(),
        analysisType: Joi.string().valid('deep_analysis', 'comparative_analysis', 'bulk_processing').required(),
        options: Joi.object({
          aiModel: Joi.string().valid('gpt-4', 'claude', 'custom').default('gpt-4'),
          includeVisualizations: Joi.boolean().default(true),
          detailedRecommendations: Joi.boolean().default(true)
        }).optional()
      })
    }),
    (req: Request, res: Response) => {
      res.json({ message: 'Create advanced analysis endpoint', endpoint: req.path });
    }
  );
  
  premiumRouter.get('/analysis/batch', 
    ValidationMiddleware.validate({
      query: Joi.object({
        ...ValidationMiddleware.schemas.pagination,
        status: Joi.string().valid('pending', 'processing', 'completed', 'failed').optional()
      })
    }),
    (req: Request, res: Response) => {
      res.json({ message: 'Get batch analysis endpoint', endpoint: req.path });
    }
  );

  router.use('/premium', premiumRouter);

  // ==========================================
  // HEALTH CHECK & SYSTEM ROUTES
  // ==========================================
  
  // Public health check (no auth required)
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime()
    });
  });

  // System info (auth required)
  router.get('/info',
    AuthMiddleware.authenticate,
    (req, res) => {
      res.json({
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        user: (req as any).user?.uid || 'anonymous'
      });
    }
  );

  // API documentation redirect
  router.get('/docs', (req, res) => {
    res.redirect('/api-docs');
  });

  // ==========================================
  // ERROR HANDLING
  // ==========================================
  
  // 404 Handler für unbekannte Routen
  router.use('*', (req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      code: 'ROUTE_NOT_FOUND',
      timestamp: new Date().toISOString()
    });
  });

  return router;
}

// ==========================================
// ROUTE GROUPS EXPORT
// ==========================================

/**
 * Exportiere individuelle Router für modulare Verwendung
 */
export const createAuthRoutes = (): Router => {
  const router = Router();
  
  const placeholderController = (req: Request, res: Response) => {
    res.json({ message: 'Auth placeholder', endpoint: req.path });
  };
  
  router.post('/login', placeholderController);
  router.post('/logout', placeholderController);
  router.post('/refresh', placeholderController);

  return router;
};

export const createUserRoutes = (): Router => {
  const router = Router();
  
  const placeholderController = (req: Request, res: Response) => {
    res.json({ message: 'User placeholder', endpoint: req.path });
  };

  router.get('/profile', placeholderController);
  router.put('/profile', placeholderController);
  router.delete('/profile', placeholderController);

  return router;
};

export const createDocumentRoutes = (): Router => {
  const router = Router();
  
  const placeholderController = (req: Request, res: Response) => {
    res.json({ message: 'Document placeholder', endpoint: req.path });
  };

  router.get('/', placeholderController);
  router.post('/', placeholderController);
  router.get('/:documentId', placeholderController);

  return router;
};

export const createAnalysisRoutes = (): Router => {
  const router = Router();
  
  const placeholderController = (req: Request, res: Response) => {
    res.json({ message: 'Analysis placeholder', endpoint: req.path });
  };

  router.get('/', placeholderController);
  router.post('/', placeholderController);
  router.get('/:analysisId', placeholderController);

  return router;
};

export const createAdminRoutes = (): Router => {
  const router = Router();
  
  const placeholderController = (req: Request, res: Response) => {
    res.json({ message: 'Admin placeholder', endpoint: req.path });
  };

  router.get('/stats', placeholderController);
  router.get('/users', placeholderController);
  router.get('/health', placeholderController);

  return router;
};

// Default Export
export default createApiRoutes;