import { Router } from 'express';
import { AnalysisController } from '../controllers/AnalysisController';
import { DocumentController } from '../controllers/DocumentController';
import { authMiddleware } from '../middleware/authMiddleware';
import { rateLimitMiddleware } from '../middleware/rateLimitMiddleware';
import { validationMiddleware } from '../middleware/validationMiddleware';

/**
 * API Routes for LexPilot
 * All routes are prefixed with /api/v1
 */
export function createApiRoutes(): Router {
  const router = Router();

  // Initialize controllers
  const analysisController = new AnalysisController();
  const documentController = new DocumentController();

  // =============================================================================
  // Public Routes (No authentication required)
  // =============================================================================

  // Health check endpoint
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    });
  });

  // API info endpoint
  router.get('/info', (req, res) => {
    res.json({
      name: 'LexPilot API',
      version: '1.0.0',
      description: 'AI-powered legal document analysis platform',
      endpoints: {
        analysis: '/api/v1/analysis',
        documents: '/api/v1/documents',
        webhooks: '/api/v1/webhooks'
      },
      supportedFormats: ['pdf', 'docx', 'txt', 'html'],
      analysisTypes: ['gdpr', 'contract_risk', 'legal_review']
    });
  });

  // =============================================================================
  // Protected Routes (Authentication required)
  // =============================================================================

  // Apply authentication middleware to all protected routes
  router.use(authMiddleware);

  // =============================================================================
  // Document Management Routes
  // =============================================================================

  // Document upload routes
  router.post('/documents/upload',
    rateLimitMiddleware('upload'),
    validationMiddleware('documentUpload'),
    documentController.uploadDocument.bind(documentController)
  );

  // Get document details
  router.get('/documents/:documentId',
    documentController.getDocument.bind(documentController)
  );

  // List user documents
  router.get('/documents',
    documentController.listDocuments.bind(documentController)
  );

  // Download document
  router.get('/documents/:documentId/download',
    rateLimitMiddleware('download'),
    documentController.downloadDocument.bind(documentController)
  );

  // Delete document
  router.delete('/documents/:documentId',
    documentController.deleteDocument.bind(documentController)
  );

  // =============================================================================
  // Analysis Routes
  // =============================================================================

  // Start document analysis
  router.post('/analysis/start',
    rateLimitMiddleware('analysis'),
    validationMiddleware('analysisStart'),
    analysisController.startAnalysis.bind(analysisController)
  );

  // Get analysis status
  router.get('/analysis/:analysisId/status',
    analysisController.getAnalysisStatus.bind(analysisController)
  );

  // Get analysis results
  router.get('/analysis/:analysisId/results',
    analysisController.getAnalysisResults.bind(analysisController)
  );

  // Cancel analysis
  router.delete('/analysis/:analysisId',
    analysisController.cancelAnalysis.bind(analysisController)
  );

  // List user analyses
  router.get('/analysis',
    analysisController.listUserAnalyses.bind(analysisController)
  );

  // =============================================================================
  // Batch Operations Routes
  // =============================================================================

  // Batch document upload
  router.post('/documents/batch-upload',
    rateLimitMiddleware('batch-upload'),
    validationMiddleware('batchUpload'),
    documentController.batchUpload?.bind(documentController)
  );

  // Batch analysis
  router.post('/analysis/batch',
    rateLimitMiddleware('batch-analysis'),
    validationMiddleware('batchAnalysis'),
    analysisController.batchAnalysis?.bind(analysisController)
  );

  // =============================================================================
  // User Account Routes
  // =============================================================================

  // Get user profile
  router.get('/user/profile', (req, res) => {
    // TODO: Implement user profile endpoint
    res.json({
      message: 'User profile endpoint - implementation pending',
      user: (req as any).user
    });
  });

  // Update user preferences
  router.put('/user/preferences', (req, res) => {
    // TODO: Implement user preferences update
    res.json({
      message: 'User preferences update - implementation pending'
    });
  });

  // Get user usage statistics
  router.get('/user/stats', (req, res) => {
    // TODO: Implement user statistics
    res.json({
      message: 'User statistics - implementation pending',
      usage: {
        documentsUploaded: 0,
        analysesCompleted: 0,
        storageUsed: 0
      }
    });
  });

  // =============================================================================
  // Admin Routes (Additional authentication required)
  // =============================================================================

  // TODO: Add admin middleware for these routes

  // System statistics
  router.get('/admin/stats', (req, res) => {
    // TODO: Implement admin statistics
    res.json({
      message: 'Admin statistics - implementation pending'
    });
  });

  // User management
  router.get('/admin/users', (req, res) => {
    // TODO: Implement user listing for admins
    res.json({
      message: 'Admin user management - implementation pending'
    });
  });

  // =============================================================================
  // Error Handling
  // =============================================================================

  // 404 handler for unknown routes
  router.use('*', (req, res) => {
    res.status(404).json({
      error: 'Route not found',
      message: `The endpoint ${req.originalUrl} does not exist`,
      availableEndpoints: [
        'GET /api/v1/health',
        'GET /api/v1/info',
        'POST /api/v1/documents/upload',
        'GET /api/v1/documents',
        'POST /api/v1/analysis/start',
        'GET /api/v1/analysis/:analysisId/status'
      ]
    });
  });

  return router;
}

/**
 * WebSocket event routes for real-time updates
 */
export interface WebSocketRoutes {
  // Analysis progress updates
  'analysis:progress': {
    analysisId: string;
    progress: number;
    status: string;
    message?: string;
  };

  // Analysis completion
  'analysis:completed': {
    analysisId: string;
    results: any;
    confidence: number;
  };

  // Document processing updates
  'document:processing': {
    documentId: string;
    status: string;
    progress: number;
  };

  // User notifications
  'notification': {
    type: 'info' | 'warning' | 'error' | 'success';
    message: string;
    timestamp: string;
  };

  // System status updates
  'system:status': {
    status: 'online' | 'maintenance' | 'degraded';
    message?: string;
  };
}

/**
 * Webhook route definitions
 */
export const webhookRoutes = {
  // Legal database updates
  '/webhooks/legal-updates': {
    method: 'POST',
    description: 'Receive legal database updates from external sources'
  },

  // Payment processing
  '/webhooks/payment': {
    method: 'POST',
    description: 'Handle payment notifications from payment providers'
  },

  // Document processing completion
  '/webhooks/document-processed': {
    method: 'POST',
    description: 'Notification when document processing is complete'
  },

  // External analysis completion
  '/webhooks/analysis-complete': {
    method: 'POST',
    description: 'Notification from external analysis services'
  }
};

export default createApiRoutes;
