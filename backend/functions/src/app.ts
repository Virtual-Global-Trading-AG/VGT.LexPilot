import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { setupDependencyInjection } from '@/config/container';
import { config } from '@/config/environment';
import { Logger } from '@/utils/logger';
import { errorHandlerMiddleware } from '@/middleware/errorHandler';

// Types für Request Extensions
declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email?: string;
        role?: string;
      };
      startTime?: number;
      requestId?: string;
    }
  }
}

export class ExpressApp {
  public app: express.Application;
  private logger: Logger;

  constructor() {
    this.app = express();
    this.logger = Logger.getInstance();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Request ID Middleware
    this.app.use((req, res, next) => {
      req.requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      req.startTime = Date.now();
      res.setHeader('X-Request-ID', req.requestId);
      next();
    });

    // Security Middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // CORS Konfiguration
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allowed origins für Development und Production
        const allowedOrigins = [
          'http://localhost:3000',
          'http://localhost:3001',
          'https://lexilot.app',
          'https://app.lexilot.ch'
        ];

        // Entwicklung: Erlaube alle Origins
        if (config.monitoring.analyticsEnabled && !origin) {
          return callback(null, true);
        }

        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
    }));

    // Compression
    this.app.use(compression({
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
      threshold: 1024 // Nur komprimieren wenn > 1KB
    }));

    // Body Parser
    this.app.use(express.json({ 
      limit: '10mb',
      verify: (req, res, buf) => {
        // Body validation wenn nötig
        if (buf.length > 10 * 1024 * 1024) { // 10MB limit
          throw new Error('Request body too large');
        }
      }
    }));
    
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: '10mb' 
    }));

    // Request Logging
    this.app.use((req, res, next) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        this.logger.logApiCall(
          req.method,
          req.path,
          res.statusCode,
          duration,
          req.user?.uid
        );
      });
      
      next();
    });

    // Health Check
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: config.monitoring.analyticsEnabled ? 'development' : 'production'
      });
    });

    // API Version Header
    this.app.use(`/api/${config.firebase.projectId || 'v1'}`, (req, res, next) => {
      res.setHeader('API-Version', config.firebase.projectId || 'v1');
      next();
    });
  }

  private initializeRoutes(): void {
    // API Routes werden hier registriert
    // this.app.use('/api/v1/documents', documentRoutes);
    // this.app.use('/api/v1/analysis', analysisRoutes);
    // this.app.use('/api/v1/users', userRoutes);

    // Placeholder Route
    this.app.get('/api/v1/ping', (req, res) => {
      res.json({
        message: 'LexPilot Backend API is running!',
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      });
    });

    // 404 Handler für unbekannte Routes
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
      });
    });
  }

  private initializeErrorHandling(): void {
    // Global Error Handler (Chain of Responsibility Pattern)
    this.app.use(errorHandlerMiddleware);

    // Unhandled Promise Rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Rejection at Promise', new Error(reason as string), {
        promise: promise.toString()
      });
    });

    // Uncaught Exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught Exception', error);
      // Graceful Shutdown
      process.exit(1);
    });
  }

  public getApp(): express.Application {
    return this.app;
  }

  public async initialize(): Promise<void> {
    // Setup Dependency Injection
    setupDependencyInjection();
    
    this.logger.info('Express App initialized successfully', {
      nodeEnv: process.env.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0'
    });
  }
}

// Factory Function
export const createExpressApp = async (): Promise<express.Application> => {
  const expressApp = new ExpressApp();
  await expressApp.initialize();
  return expressApp.getApp();
};
