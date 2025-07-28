import { Request, Response, NextFunction } from 'express';
import { Logger } from '@/utils/logger';

// Base Error Handler Interface
export interface IErrorHandler {
  setNext(handler: IErrorHandler): IErrorHandler;
  handle(error: Error, req: Request, res: Response, next: NextFunction): Promise<void>;
}

// Abstract Base Handler
abstract class BaseErrorHandler implements IErrorHandler {
  private nextHandler?: IErrorHandler;

  public setNext(handler: IErrorHandler): IErrorHandler {
    this.nextHandler = handler;
    return handler;
  }

  public async handle(error: Error, req: Request, res: Response, next: NextFunction): Promise<void> {
    if (await this.canHandle(error)) {
      await this.handleError(error, req, res, next);
    } else if (this.nextHandler) {
      await this.nextHandler.handle(error, req, res, next);
    } else {
      // Fallback - sollte nicht passieren
      await this.handleUnknownError(error, req, res);
    }
  }

  protected abstract canHandle(error: Error): Promise<boolean>;
  protected abstract handleError(error: Error, req: Request, res: Response, next: NextFunction): Promise<void>;

  protected async handleUnknownError(error: Error, req: Request, res: Response): Promise<void> {
    const logger = Logger.getInstance();
    logger.error('Unhandled error in error chain', error, {
      path: req.path,
      method: req.method,
      userId: req.user?.uid
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ein unerwarteter Fehler ist aufgetreten.',
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id']
    });
  }
}

// Validation Error Handler
export class ValidationErrorHandler extends BaseErrorHandler {
  protected async canHandle(error: Error): Promise<boolean> {
    return error.name === 'ValidationError' || 
           error.name === 'ZodError' ||
           error.message.includes('validation');
  }

  protected async handleError(error: Error, req: Request, res: Response): Promise<void> {
    const logger = Logger.getInstance();
    logger.warn('Validation error', {
      error: error.message,
      path: req.path,
      body: req.body,
      userId: req.user?.uid
    });

    res.status(400).json({
      error: 'Validation Error',
      message: 'Die übermittelten Daten sind ungültig.',
      details: this.extractValidationDetails(error),
      timestamp: new Date().toISOString()
    });
  }

  private extractValidationDetails(error: Error): any {
    if (error.name === 'ZodError') {
      return (error as any).errors?.map((err: any) => ({
        field: err.path?.join('.'),
        message: err.message
      }));
    }
    return error.message;
  }
}

// Authentication Error Handler
export class AuthenticationErrorHandler extends BaseErrorHandler {
  protected async canHandle(error: Error): Promise<boolean> {
    return error.name === 'UnauthorizedError' ||
           error.message.includes('unauthorized') ||
           error.message.includes('authentication');
  }

  protected async handleError(error: Error, req: Request, res: Response): Promise<void> {
    const logger = Logger.getInstance();
    logger.warn('Authentication error', {
      error: error.message,
      path: req.path,
      userAgent: req.headers['user-agent'],
      ip: req.ip
    });

    res.status(401).json({
      error: 'Authentication Required',
      message: 'Sie müssen sich anmelden, um auf diese Ressource zuzugreifen.',
      timestamp: new Date().toISOString()
    });
  }
}

// Rate Limit Error Handler
export class RateLimitErrorHandler extends BaseErrorHandler {
  protected async canHandle(error: Error): Promise<boolean> {
    return error.name === 'TooManyRequestsError' ||
           error.message.includes('rate limit') ||
           error.message.includes('too many requests');
  }

  protected async handleError(error: Error, req: Request, res: Response): Promise<void> {
    const logger = Logger.getInstance();
    logger.warn('Rate limit exceeded', {
      error: error.message,
      path: req.path,
      userId: req.user?.uid,
      ip: req.ip
    });

    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.',
      retryAfter: 900, // 15 Minuten
      timestamp: new Date().toISOString()
    });
  }
}

// Business Logic Error Handler
export class BusinessLogicErrorHandler extends BaseErrorHandler {
  protected async canHandle(error: Error): Promise<boolean> {
    return error.name === 'BusinessLogicError' ||
           error.message.includes('business rule') ||
           error.message.includes('quota exceeded');
  }

  protected async handleError(error: Error, req: Request, res: Response): Promise<void> {
    const logger = Logger.getInstance();
    logger.info('Business logic error', {
      error: error.message,
      path: req.path,
      userId: req.user?.uid
    });

    res.status(422).json({
      error: 'Business Rule Violation',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// External Service Error Handler
export class ExternalServiceErrorHandler extends BaseErrorHandler {
  protected async canHandle(error: Error): Promise<boolean> {
    return error.name === 'ExternalServiceError' ||
           error.message.includes('OpenAI') ||
           error.message.includes('Pinecone') ||
           error.message.includes('external service');
  }

  protected async handleError(error: Error, req: Request, res: Response): Promise<void> {
    const logger = Logger.getInstance();
    logger.error('External service error', error, {
      path: req.path,
      userId: req.user?.uid,
      service: this.identifyService(error.message)
    });

    res.status(503).json({
      error: 'Service Unavailable',
      message: 'Ein externer Service ist momentan nicht verfügbar. Bitte versuchen Sie es später erneut.',
      timestamp: new Date().toISOString()
    });
  }

  private identifyService(message: string): string {
    if (message.includes('OpenAI')) return 'OpenAI';
    if (message.includes('Pinecone')) return 'Pinecone';
    if (message.includes('HuggingFace')) return 'HuggingFace';
    return 'Unknown';
  }
}

// System Error Handler (Last in chain)
export class SystemErrorHandler extends BaseErrorHandler {
  protected async canHandle(error: Error): Promise<boolean> {
    return true; // Handles all remaining errors
  }

  protected async handleError(error: Error, req: Request, res: Response): Promise<void> {
    const logger = Logger.getInstance();
    logger.error('System error', error, {
      path: req.path,
      method: req.method,
      userId: req.user?.uid,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ein unerwarteter Fehler ist aufgetreten. Unser Team wurde benachrichtigt.',
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id']
    });
  }
}

// Error Handler Chain Factory
export class ErrorHandlerChain {
  private static instance: ErrorHandlerChain;
  private chain!: IErrorHandler;

  private constructor() {
    this.buildChain();
  }

  static getInstance(): ErrorHandlerChain {
    if (!ErrorHandlerChain.instance) {
      ErrorHandlerChain.instance = new ErrorHandlerChain();
    }
    return ErrorHandlerChain.instance;
  }

  private buildChain(): void {
    const validationHandler = new ValidationErrorHandler();
    const authHandler = new AuthenticationErrorHandler();
    const rateLimitHandler = new RateLimitErrorHandler();
    const businessHandler = new BusinessLogicErrorHandler();
    const externalHandler = new ExternalServiceErrorHandler();
    const systemHandler = new SystemErrorHandler();

    // Chain aufbauen
    validationHandler
      .setNext(authHandler)
      .setNext(rateLimitHandler)
      .setNext(businessHandler)
      .setNext(externalHandler)
      .setNext(systemHandler);

    this.chain = validationHandler;
  }

  public getHandler(): IErrorHandler {
    return this.chain;
  }
}

// Express Error Middleware
export const errorHandlerMiddleware = async (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const chain = ErrorHandlerChain.getInstance();
  await chain.getHandler().handle(error, req, res, next);
};

// Custom Error Classes
export class ValidationError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string = 'Unauthorized access') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class TooManyRequestsError extends Error {
  constructor(message: string = 'Too many requests') {
    super(message);
    this.name = 'TooManyRequestsError';
  }
}

export class BusinessLogicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessLogicError';
  }
}

export class ExternalServiceError extends Error {
  constructor(message: string, public service: string) {
    super(message);
    this.name = 'ExternalServiceError';
  }
}
