import { Router } from 'express';

// Import Controllers
import adminRoutes from './adminRoutes';
import createAuthRoutes from './authRoutes';
import contractRoutes from './contractRoutes';

// Import Route Modules
import documentRoutes from './documentRoutes';

/**
 * Zentrale API-Router-Konfiguration
 * Integriert alle Middleware-Komponenten und Controller
 */
export function createApiRoutes(): Router {
  const router = Router();

  // ==========================================
  // ROUTE MODULES
  // ==========================================

  // Authentication routes (no auth required by default)
  router.use('/auth', createAuthRoutes());

  // Document routes (with Firebase Storage integration)
  router.use('/documents', documentRoutes);

  // // User routes (authentication required)
  // router.use('/users', createUserRoutes());

  // Admin routes (authentication and admin required)
  router.use('/admin', adminRoutes);

  // Contract routes (with authentication)
  router.use('/contracts', contractRoutes);




  // // ==========================================
  // // ANALYSIS ROUTES
  // // ==========================================
  // const analysisRouter = Router();

  // // Authentication required for all analysis routes
  // analysisRouter.use(AuthMiddleware.authenticate);

  // // Dynamic rate limiting based on user type
  // analysisRouter.use((req, res, next) => {
  //   const user = (req as any).user;
  //   const isPremium = user?.customClaims?.premium || user?.role === 'admin';

  //   if (isPremium) {
  //     return RateLimitMiddleware.premiumAnalysisLimiter(req, res, next);
  //   } else {
  //     return RateLimitMiddleware.analysisLimiter(req, res, next);
  //   }
  // });

  // // Analysis Management
  // analysisRouter.get('/',
  //   ValidationMiddleware.validate({
  //     query: ValidationMiddleware.schemas.pagination
  //   }),
  //   analysisController.getAnalyses.bind(analysisController)
  // );

  // analysisRouter.get('/:analysisId',
  //   ValidationMiddleware.validate({
  //     params: Joi.object({
  //       analysisId: ValidationMiddleware.schemas.id
  //     })
  //   }),
  //   analysisController.getAnalysis.bind(analysisController)
  // );

  // analysisRouter.post('/',
  //   ValidationMiddleware.validators.analyzeDocument,
  //   analysisController.createAnalysis.bind(analysisController)
  // );

  // analysisRouter.delete('/:analysisId',
  //   ValidationMiddleware.validate({
  //     params: Joi.object({
  //       analysisId: ValidationMiddleware.schemas.id
  //     })
  //   }),
  //   analysisController.deleteAnalysis.bind(analysisController)
  // );

  // // Analysis Operations
  // analysisRouter.post('/:analysisId/start',
  //   ValidationMiddleware.validate({
  //     params: Joi.object({
  //       analysisId: ValidationMiddleware.schemas.id
  //     })
  //   }),
  //   analysisController.startAnalysisOperation.bind(analysisController)
  // );

  // analysisRouter.post('/:analysisId/stop',
  //   ValidationMiddleware.validate({
  //     params: Joi.object({
  //       analysisId: ValidationMiddleware.schemas.id
  //     })
  //   }),
  //   analysisController.stopAnalysisOperation.bind(analysisController)
  // );

  // analysisRouter.get('/:analysisId/results',
  //   ValidationMiddleware.validate({
  //     params: Joi.object({
  //       analysisId: ValidationMiddleware.schemas.id
  //     })
  //   }),
  //   analysisController.getAnalysisResults.bind(analysisController)
  // );

  // analysisRouter.get('/:analysisId/export',
  //   ValidationMiddleware.validate({
  //     params: Joi.object({
  //       analysisId: ValidationMiddleware.schemas.id
  //     }),
  //     query: Joi.object({
  //       format: Joi.string().valid('pdf', 'docx', 'json').default('pdf')
  //     })
  //   }),
  //   analysisController.exportAnalysis.bind(analysisController)
  // );

  // router.use('/analysis', analysisRouter);

  // // ==========================================
  // // PREMIUM ROUTES
  // // ==========================================
  // const premiumRouter = Router();

  // // Premium authentication required
  // premiumRouter.use(AuthMiddleware.authenticate);
  // premiumRouter.use(AuthMiddleware.requirePremium);
  // premiumRouter.use(RateLimitMiddleware.premiumAnalysisLimiter);

  // // Premium Features
  // premiumRouter.get('/features', (req: Request, res: Response) => {
  //   res.json({ message: 'Get premium features endpoint', endpoint: req.path });
  // });

  // premiumRouter.get('/analytics',
  //   ValidationMiddleware.validate({
  //     query: Joi.object({
  //       from: Joi.date().iso().optional(),
  //       to: Joi.date().iso().optional(),
  //       metric: Joi.string().valid('usage', 'performance', 'costs').optional()
  //     })
  //   }),
  //   (req: Request, res: Response) => {
  //     res.json({ message: 'Get premium analytics endpoint', endpoint: req.path });
  //   }
  // );

  // // Advanced Analysis
  // premiumRouter.post('/analysis/advanced',
  //   ValidationMiddleware.validate({
  //     body: Joi.object({
  //       documentIds: Joi.array().items(ValidationMiddleware.schemas.id).required(),
  //       analysisType: Joi.string().valid('deep_analysis', 'comparative_analysis', 'bulk_processing').required(),
  //       options: Joi.object({
  //         aiModel: Joi.string().valid('gpt-4', 'claude', 'custom').default('gpt-4'),
  //         includeVisualizations: Joi.boolean().default(true),
  //         detailedRecommendations: Joi.boolean().default(true)
  //       }).optional()
  //     })
  //   }),
  //   (req: Request, res: Response) => {
  //     res.json({ message: 'Create advanced analysis endpoint', endpoint: req.path });
  //   }
  // );

  // premiumRouter.get('/analysis/batch',
  //   ValidationMiddleware.validate({
  //     query: Joi.object({
  //       ...ValidationMiddleware.schemas.pagination,
  //       status: Joi.string().valid('pending', 'processing', 'completed', 'failed').optional()
  //     })
  //   }),
  //   (req: Request, res: Response) => {
  //     res.json({ message: 'Get batch analysis endpoint', endpoint: req.path });
  //   }
  // );

  // router.use('/premium', premiumRouter);

  // // ==========================================
  // // HEALTH CHECK & SYSTEM ROUTES
  // // ==========================================

  // // Public health check (no auth required)
  // router.get('/health', (req, res) => {
  //   res.json({
  //     status: 'healthy',
  //     timestamp: new Date().toISOString(),
  //     version: process.env.npm_package_version || '1.0.0',
  //     uptime: process.uptime()
  //   });
  // });

  // // System info (auth required)
  // router.get('/info',
  //   AuthMiddleware.authenticate,
  //   (req, res) => {
  //     res.json({
  //       version: process.env.npm_package_version || '1.0.0',
  //       environment: process.env.NODE_ENV || 'development',
  //       timestamp: new Date().toISOString(),
  //       user: (req as any).user?.uid || 'anonymous'
  //     });
  //   }
  // );

  // // API documentation redirect
  // router.get('/docs', (req, res) => {
  //   res.redirect('/api-docs');
  // });

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

// Default Export
export default createApiRoutes;
