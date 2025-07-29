import * as winston from 'winston';

export interface ILogger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, error?: Error, meta?: any): void;
  setUserId(userId: string): ILogger;
}

export class Logger implements ILogger {
  private static instance: Logger;
  private winston: winston.Logger;
  private userId?: string;

  constructor() {
    const logLevel = process.env.LOG_LEVEL || 'info';
    const isDevelopment = process.env.NODE_ENV === 'development';

    this.winston = winston.createLogger({
      level: logLevel,
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, userId, ...meta }) => {
          const userInfo = userId ? ` [User: ${userId}]` : '';
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level.toUpperCase()}]${userInfo}: ${message}${metaStr}`;
        })
      ),
      defaultMeta: { service: 'lexilot-backend' },
      transports: [
        // Console transport für Development
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
          silent: !isDevelopment
        }),
        
        // File transport für Production
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),
        
        new winston.transports.File({
          filename: 'logs/combined.log',
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        })
      ],
      
      // Keine Logs für Tests
      silent: process.env.NODE_ENV === 'test'
    });

    // Unhandled exceptions und rejections loggen
    this.winston.exceptions.handle(
      new winston.transports.File({ filename: 'logs/exceptions.log' })
    );

    process.on('unhandledRejection', (ex) => {
      throw ex;
    });
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setUserId(userId: string): ILogger {
    this.userId = userId;
    return this;
  }

  public debug(message: string, meta?: any): void {
    this.winston.debug(message, { ...meta, userId: this.userId });
  }

  public info(message: string, meta?: any): void {
    this.winston.info(message, { ...meta, userId: this.userId });
  }

  public warn(message: string, meta?: any): void {
    this.winston.warn(message, { ...meta, userId: this.userId });
  }

  public error(message: string, error?: Error, meta?: any): void {
    const errorMeta = {
      ...meta,
      userId: this.userId,
      stack: error?.stack,
      name: error?.name,
      message: error?.message
    };
    
    this.winston.error(message, errorMeta);
  }

  // Utility methods für verschiedene Log-Typen
  public logApiCall(method: string, path: string, statusCode: number, duration: number, userId?: string): void {
    this.info('API Call', {
      method,
      path,
      statusCode,
      duration,
      userId: userId || this.userId
    });
  }

  public logTokenUsage(userId: string, tokens: number, model: string, cost: number): void {
    this.info('Token Usage', {
      userId,
      tokens,
      model,
      cost,
      type: 'billing'
    });
  }

  public logDocumentProcessed(userId: string, documentId: string, type: string, processingTime: number): void {
    this.info('Document Processed', {
      userId,
      documentId,
      type,
      processingTime,
      category: 'document_processing'
    });
  }

  public logAnalysisCompleted(userId: string, analysisId: string, analysisType: string, confidence: number): void {
    this.info('Analysis Completed', {
      userId,
      analysisId,
      analysisType,
      confidence,
      category: 'analysis'
    });
  }

  public logError(userId: string, operation: string, error: Error, context?: any): void {
    this.error(`Error in ${operation}`, error, {
      userId,
      operation,
      context,
      category: 'error'
    });
  }
}

// Export Singleton instance für einfachen Import
export const logger = Logger.getInstance();
