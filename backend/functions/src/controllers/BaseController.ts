import { Request, Response } from 'express';
import { Logger } from '../utils/logger';

export abstract class BaseController {
  protected logger = Logger.getInstance();

  /**
   * Extract user ID from authenticated request
   */
  protected getUserId(req: Request): string {
    // Firebase Auth middleware should attach user to request
    const user = (req as any).user;
    if (!user || !user.uid) {
      throw new Error('User not authenticated');
    }
    return user.uid;
  }

  /**
   * Extract user object from authenticated request
   */
  protected getUser(req: Request): any {
    const user = (req as any).user;
    if (!user) {
      throw new Error('User not authenticated');
    }
    return user;
  }

  /**
   * Send standardized error response
   */
  protected sendError(res: Response, statusCode: number, error: string, message?: string, details?: any): void {
    res.status(statusCode).json({
      error,
      message: message || error,
      ...(details && { details })
    });
  }

  /**
   * Send standardized success response
   */
  protected sendSuccess(res: Response, data: any, message?: string): void {
    res.json({
      success: true,
      ...(message && { message }),
      ...data
    });
  }

  /**
   * Validate required fields in request body
   */
  protected validateRequiredFields(body: any, fields: string[]): string[] {
    const missing: string[] = [];
    for (const field of fields) {
      if (!body[field]) {
        missing.push(field);
      }
    }
    return missing;
  }

  /**
   * Sanitize pagination parameters
   */
  protected getPaginationParams(query: any): { page: number; limit: number; offset: number } {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
    const offset = (page - 1) * limit;
    
    return { page, limit, offset };
  }

  /**
   * Sanitize sort parameters
   */
  protected getSortParams(query: any, allowedFields: string[]): { sortBy: string; sortOrder: 'asc' | 'desc' } {
    const sortBy = allowedFields.includes(query.sortBy) ? query.sortBy : allowedFields[0];
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
    
    return { sortBy, sortOrder };
  }

  /**
   * Handle async controller methods with error catching
   */
  protected asyncHandler(fn: (req: Request, res: Response, next: Function) => Promise<void>) {
    return (req: Request, res: Response, next: Function) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }
}
