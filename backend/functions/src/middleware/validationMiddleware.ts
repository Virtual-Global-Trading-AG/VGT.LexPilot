import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { Logger } from '@/utils/logger';

export interface ValidationOptions {
  body?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
  headers?: Joi.ObjectSchema;
  abortEarly?: boolean;
  allowUnknown?: boolean;
}

export class ValidationMiddleware {
  private static logger = Logger.getInstance();

  /**
   * Generic Validation Middleware
   */
  static validate(options: ValidationOptions) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const validationOptions = {
          abortEarly: options.abortEarly ?? false,
          allowUnknown: options.allowUnknown ?? false,
          stripUnknown: true
        };

        const errors: string[] = [];

        // Body Validation
        if (options.body) {
          const { error, value } = options.body.validate(req.body, validationOptions);
          if (error) {
            errors.push(...error.details.map((detail: any) => `Body: ${detail.message}`));
          } else {
            req.body = value;
          }
        }

        // Query Validation
        if (options.query) {
          const { error, value } = options.query.validate(req.query, validationOptions);
          if (error) {
            errors.push(...error.details.map((detail: any) => `Query: ${detail.message}`));
          } else {
            req.query = value;
          }
        }

        // Params Validation
        if (options.params) {
          const { error, value } = options.params.validate(req.params, validationOptions);
          if (error) {
            errors.push(...error.details.map((detail: any) => `Params: ${detail.message}`));
          } else {
            req.params = value;
          }
        }

        // Headers Validation
        if (options.headers) {
          const { error, value } = options.headers.validate(req.headers, validationOptions);
          if (error) {
            errors.push(...error.details.map((detail: any) => `Headers: ${detail.message}`));
          } else {
            req.headers = { ...req.headers, ...value };
          }
        }

        if (errors.length > 0) {
          this.logger.warn('Validation failed', {
            errors,
            requestId: req.requestId,
            path: req.path,
            method: req.method
          });

          res.status(400).json({
            error: 'Validation Error',
            message: 'Request validation failed',
            details: errors,
            code: 'VALIDATION_ERROR'
          });
          return;
        }

        next();
      } catch (error) {
        this.logger.error('Validation middleware error', error as Error, {
          requestId: req.requestId
        });

        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Validation processing failed',
          code: 'VALIDATION_PROCESSING_ERROR'
        });
      }
    };
  }

  /**
   * Common Validation Schemas
   */
  static get schemas() {
    return {
      // Basis-Schemas
      id: Joi.string().alphanum().min(3).max(50).required(),
      uuid: Joi.string().uuid().required(),
      email: Joi.string().email().required(),
      password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required(),
      
      // Pagination
      pagination: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        sortBy: Joi.string().default('createdAt'),
        sortOrder: Joi.string().valid('asc', 'desc').default('desc')
      }),

      // File Upload
      fileUpload: Joi.object({
        filename: Joi.string().required(),
        mimetype: Joi.string().valid(
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain'
        ).required(),
        size: Joi.number().max(10 * 1024 * 1024).required() // 10MB max
      }),

      // Document Analysis
      analysisRequest: Joi.object({
        documentId: Joi.string().required(),
        analysisType: Joi.string().valid(
          'contract_review',
          'compliance_check',
          'risk_assessment',
          'legal_summary'
        ).required(),
        priority: Joi.string().valid('low', 'medium', 'high').default('medium'),
        options: Joi.object({
          includeRecommendations: Joi.boolean().default(true),
          detailedAnalysis: Joi.boolean().default(false),
          language: Joi.string().valid('de', 'en', 'fr', 'it').default('de')
        }).default({})
      }),

      // User Registration
      userRegistration: Joi.object({
        email: Joi.string().email().required(),
        firstName: Joi.string().min(2).max(50).required(),
        lastName: Joi.string().min(2).max(50).required(),
        company: Joi.string().max(100).optional(),
        phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).optional(),
        acceptTerms: Joi.boolean().valid(true).required(),
        newsletter: Joi.boolean().default(false)
      }),

      // User Profile Update
      userProfileUpdate: Joi.object({
        firstName: Joi.string().min(2).max(50).optional(),
        lastName: Joi.string().min(2).max(50).optional(),
        company: Joi.string().max(100).optional(),
        phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).optional(),
        preferences: Joi.object({
          language: Joi.string().valid('de', 'en', 'fr', 'it').optional(),
          timezone: Joi.string().optional(),
          notifications: Joi.object({
            email: Joi.boolean().optional(),
            push: Joi.boolean().optional(),
            sms: Joi.boolean().optional()
          }).optional()
        }).optional()
      }),

      // Admin User Management
      adminUserUpdate: Joi.object({
        role: Joi.string().valid('user', 'premium', 'admin').optional(),
        status: Joi.string().valid('active', 'suspended', 'banned').optional(),
        subscription: Joi.object({
          type: Joi.string().valid('free', 'premium', 'enterprise').optional(),
          expiresAt: Joi.date().iso().optional()
        }).optional(),
        customClaims: Joi.object().optional()
      }),

      // Search and Filter
      searchQuery: Joi.object({
        q: Joi.string().min(1).max(200).optional(),
        filters: Joi.object({
          type: Joi.array().items(Joi.string()).optional(),
          status: Joi.array().items(Joi.string()).optional(),
          dateFrom: Joi.date().iso().optional(),
          dateTo: Joi.date().iso().optional(),
          tags: Joi.array().items(Joi.string()).optional()
        }).optional()
      }),

      // Feedback and Support
      feedback: Joi.object({
        type: Joi.string().valid('bug', 'feature', 'improvement', 'other').required(),
        subject: Joi.string().min(5).max(200).required(),
        description: Joi.string().min(10).max(2000).required(),
        priority: Joi.string().valid('low', 'medium', 'high').default('medium'),
        attachments: Joi.array().items(Joi.string().uuid()).optional()
      })
    };
  }

  /**
   * Vordefinierte Validatoren für häufige Use Cases
   */
  static get validators() {
    return {
      // Document Routes
      uploadDocument: this.validate({
        body: this.schemas.fileUpload
      }),

      analyzeDocument: this.validate({
        body: this.schemas.analysisRequest,
        params: Joi.object({
          documentId: this.schemas.id
        })
      }),

      getDocument: this.validate({
        params: Joi.object({
          documentId: this.schemas.id
        })
      }),

      listDocuments: this.validate({
        query: this.schemas.pagination
      }),

      // User Routes
      registerUser: this.validate({
        body: this.schemas.userRegistration
      }),

      updateProfile: this.validate({
        body: this.schemas.userProfileUpdate
      }),

      getUserById: this.validate({
        params: Joi.object({
          userId: this.schemas.id
        })
      }),

      // Admin Routes
      adminUpdateUser: this.validate({
        params: Joi.object({
          userId: this.schemas.id
        }),
        body: this.schemas.adminUserUpdate
      }),

      adminSearch: this.validate({
        query: this.schemas.searchQuery
      }),

      // Analysis Routes
      getAnalysis: this.validate({
        params: Joi.object({
          analysisId: this.schemas.id
        })
      }),

      listAnalyses: this.validate({
        query: this.schemas.pagination.keys({
          status: Joi.string().valid('pending', 'processing', 'completed', 'failed').optional(),
          type: Joi.string().valid('contract_review', 'compliance_check', 'risk_assessment', 'legal_summary').optional()
        })
      }),

      // Feedback Routes
      submitFeedback: this.validate({
        body: this.schemas.feedback
      })
    };
  }

  /**
   * File Size Validator
   */
  static validateFileSize(maxSizeInMB: number) {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!req.file && !req.files) {
        next();
        return;
      }

      const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
      const files = req.files ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()) : [req.file];

      for (const file of files) {
        if (file && file.size > maxSizeInBytes) {
          res.status(413).json({
            error: 'File Too Large',
            message: `File size exceeds ${maxSizeInMB}MB limit`,
            maxSize: maxSizeInMB,
            actualSize: Math.round(file.size / (1024 * 1024) * 100) / 100,
            code: 'FILE_TOO_LARGE'
          });
          return;
        }
      }

      next();
    };
  }

  /**
   * MIME Type Validator
   */
  static validateMimeType(allowedTypes: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!req.file && !req.files) {
        next();
        return;
      }

      const files = req.files ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()) : [req.file];

      for (const file of files) {
        if (file && !allowedTypes.includes(file.mimetype)) {
          res.status(415).json({
            error: 'Unsupported Media Type',
            message: 'File type not allowed',
            allowedTypes,
            actualType: file.mimetype,
            code: 'UNSUPPORTED_FILE_TYPE'
          });
          return;
        }
      }

      next();
    };
  }
}

// Export der Validation Middleware für bessere Kompatibilität
export const validationMiddleware = (type: string) => {
  switch(type) {
    case 'documentUpload': return ValidationMiddleware.validators.uploadDocument;
    case 'analysisStart': return ValidationMiddleware.validators.analyzeDocument;
    case 'userRegistration': return ValidationMiddleware.validators.registerUser;
    case 'userProfileUpdate': return ValidationMiddleware.validators.updateProfile;
    case 'adminUserUpdate': return ValidationMiddleware.validators.adminUpdateUser;
    default: return ValidationMiddleware.validate({});
  }
};

// Export der Validation Middleware
export const { validate, validators, validateFileSize, validateMimeType } = ValidationMiddleware;
