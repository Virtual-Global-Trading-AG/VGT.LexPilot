import { Request, Response, NextFunction } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { Logger } from '@/utils/logger';

export interface AuthenticatedRequest extends Request {
  user: {
    uid: string;
    email?: string;
    role?: string;
    emailVerified?: boolean;
    customClaims?: Record<string, any>;
  };
}

export class AuthMiddleware {
  private static logger = Logger.getInstance();

  /**
   * Middleware für Benutzer-Authentifizierung
   */
  static authenticate = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Missing or invalid authorization header',
          code: 'AUTH_MISSING_TOKEN'
        });
        return;
      }

      const idToken = authHeader.split('Bearer ')[1];
      
      if (!idToken) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Missing ID token',
          code: 'AUTH_MISSING_TOKEN'
        });
        return;
      }

      // Token verifizieren
      const decodedToken = await getAuth().verifyIdToken(idToken);
      
      // User-Objekt erstellen
      (req as AuthenticatedRequest).user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified,
        role: decodedToken.role || 'user',
        customClaims: decodedToken
      };

      this.logger.debug('User authenticated', {
        uid: decodedToken.uid,
        email: decodedToken.email,
        requestId: req.requestId
      });

      next();
    } catch (error) {
      this.logger.error('Authentication failed', error as Error, {
        requestId: req.requestId,
        userAgent: req.headers['user-agent']
      });

      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
        code: 'AUTH_INVALID_TOKEN'
      });
    }
  };

  /**
   * Middleware für Admin-Berechtigung
   */
  static requireAdmin = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    if (user.role !== 'admin' && !user.customClaims?.admin) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Admin privileges required',
        code: 'AUTH_INSUFFICIENT_PRIVILEGES'
      });
      return;
    }

    this.logger.debug('Admin access granted', {
      uid: user.uid,
      requestId: req.requestId
    });

    next();
  };

  /**
   * Middleware für Premium-Berechtigung
   */
  static requirePremium = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    const isPremium = user.customClaims?.premium || 
                     user.customClaims?.subscription === 'premium' ||
                     user.role === 'admin';

    if (!isPremium) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Premium subscription required',
        code: 'AUTH_PREMIUM_REQUIRED'
      });
      return;
    }

    next();
  };

  /**
   * Middleware für E-Mail-Verifizierung
   */
  static requireEmailVerified = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    if (!user.emailVerified) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Email verification required',
        code: 'AUTH_EMAIL_NOT_VERIFIED'
      });
      return;
    }

    next();
  };

  /**
   * Optional Authentication - setzt User wenn Token vorhanden
   */
  static optionalAuth = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const idToken = authHeader.split('Bearer ')[1];
        
        if (idToken) {
          const decodedToken = await getAuth().verifyIdToken(idToken);
          
          (req as AuthenticatedRequest).user = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            emailVerified: decodedToken.email_verified,
            role: decodedToken.role || 'user',
            customClaims: decodedToken
          };
        }
      }
    } catch (error) {
      // Optional auth - Fehler ignorieren
      this.logger.debug('Optional auth failed', {
        error: (error as Error).message,
        requestId: req.requestId
      });
    }

    next();
  };
}

// Export der Middleware-Funktionen für bessere Kompatibilität
export const authMiddleware = AuthMiddleware.authenticate;
export const adminMiddleware = AuthMiddleware.requireAdmin;
export const premiumMiddleware = AuthMiddleware.requirePremium;

// Export der Middleware-Funktionen
export const {
  authenticate,
  requireAdmin,
  requirePremium,
  requireEmailVerified,
  optionalAuth
} = AuthMiddleware;
