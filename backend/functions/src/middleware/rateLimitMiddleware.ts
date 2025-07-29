import { Request, Response, NextFunction } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { Logger } from '@/utils/logger';

interface RateLimitOptions {
  windowMs: number;        // Zeitfenster in Millisekunden
  maxRequests: number;     // Maximale Anfragen pro Zeitfenster
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
  statusCode?: number;
}

interface RateLimitData {
  count: number;
  resetTime: number;
  firstRequest: number;
}

export class RateLimitMiddleware {
  private static logger = Logger.getInstance();
  private static db = getFirestore();

  /**
   * Standard Rate Limiter
   */
  static createRateLimiter(options: RateLimitOptions) {
    const {
      windowMs,
      maxRequests,
      keyGenerator = (req) => req.ip || 'unknown',
      skipSuccessfulRequests = false,
      skipFailedRequests = false,
      message = 'Too many requests',
      statusCode = 429
    } = options;

    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const key = keyGenerator(req);
        const now = Date.now();
        const windowStart = now - windowMs;

        // Rate Limit Daten aus Firestore abrufen
        const rateLimitRef = this.db.collection('rateLimits').doc(key);
        const rateLimitDoc = await rateLimitRef.get();

        let rateLimitData: RateLimitData;

        if (!rateLimitDoc.exists) {
          // Erste Anfrage für diesen Key
          rateLimitData = {
            count: 1,
            resetTime: now + windowMs,
            firstRequest: now
          };
        } else {
          rateLimitData = rateLimitDoc.data() as RateLimitData;

          // Prüfen ob Zeitfenster abgelaufen ist
          if (now > rateLimitData.resetTime) {
            // Neues Zeitfenster
            rateLimitData = {
              count: 1,
              resetTime: now + windowMs,
              firstRequest: now
            };
          } else {
            // Zähler erhöhen
            rateLimitData.count++;
          }
        }

        // Rate Limit prüfen
        if (rateLimitData.count > maxRequests) {
          const resetTimeSeconds = Math.ceil((rateLimitData.resetTime - now) / 1000);

          // Headers setzen
          res.set({
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Math.ceil(rateLimitData.resetTime / 1000).toString(),
            'Retry-After': resetTimeSeconds.toString()
          });

          this.logger.warn('Rate limit exceeded', {
            key,
            count: rateLimitData.count,
            limit: maxRequests,
            resetTime: rateLimitData.resetTime,
            requestId: req.requestId
          });

          res.status(statusCode).json({
            error: 'Rate Limit Exceeded',
            message,
            retryAfter: resetTimeSeconds,
            code: 'RATE_LIMIT_EXCEEDED'
          });
          return;
        }

        // Rate Limit Daten speichern
        await rateLimitRef.set(rateLimitData, { merge: true });

        // Headers setzen
        const remaining = Math.max(0, maxRequests - rateLimitData.count);
        res.set({
          'X-RateLimit-Limit': maxRequests.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': Math.ceil(rateLimitData.resetTime / 1000).toString()
        });

        // Response Status überwachen für Skip-Optionen
        const originalSend = res.send;
        res.send = function(data) {
          const shouldSkip = 
            (skipSuccessfulRequests && res.statusCode < 400) ||
            (skipFailedRequests && res.statusCode >= 400);

          if (shouldSkip) {
            // Zähler zurücksetzen wenn übersprungen
            rateLimitData.count--;
            rateLimitRef.set(rateLimitData, { merge: true }).catch(err => {
              RateLimitMiddleware.logger.error('Failed to update rate limit data', err);
            });
          }

          return originalSend.call(this, data);
        };

        next();
      } catch (error) {
        this.logger.error('Rate limit middleware error', error as Error, {
          requestId: req.requestId
        });
        // Bei Fehlern durchlassen
        next();
      }
    };
  }

  /**
   * API Rate Limiter - 100 Anfragen pro Minute
   */
  static apiLimiter = this.createRateLimiter({
    windowMs: 60 * 1000, // 1 Minute
    maxRequests: 100,
    message: 'Too many API requests, please try again later'
  });

  /**
   * Auth Rate Limiter - 5 Login-Versuche pro 15 Minuten
   */
  static authLimiter = this.createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 Minuten
    maxRequests: 8,
    keyGenerator: (req) => `auth:${req.ip}`,
    message: 'Too many authentication attempts, please try again later',
    skipSuccessfulRequests: true
  });

  /**
   * Upload Rate Limiter - 10 Uploads pro Stunde
   */
  static uploadLimiter = this.createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 Stunde
    maxRequests: 10,
    keyGenerator: (req) => {
      const user = (req as any).user;
      return user ? `upload:${user.uid}` : `upload:${req.ip}`;
    },
    message: 'Upload limit exceeded, please try again later'
  });

  /**
   * Analysis Rate Limiter - 20 Analysen pro Stunde für Free User
   */
  static analysisLimiter = this.createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 Stunde
    maxRequests: 20,
    keyGenerator: (req) => {
      const user = (req as any).user;
      if (!user) return `analysis:${req.ip}`;
      
      // Premium User haben höhere Limits
      const isPremium = user.customClaims?.premium || user.role === 'admin';
      const prefix = isPremium ? 'analysis:premium' : 'analysis:free';
      
      return `${prefix}:${user.uid}`;
    },
    message: 'Analysis limit exceeded, consider upgrading to premium'
  });

  /**
   * Premium Analysis Limiter - 200 Analysen pro Stunde
   */
  static premiumAnalysisLimiter = this.createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 Stunde
    maxRequests: 200,
    keyGenerator: (req) => {
      const user = (req as any).user;
      return user ? `analysis:premium:${user.uid}` : `analysis:${req.ip}`;
    },
    message: 'Premium analysis limit exceeded'
  });

  /**
   * Admin Rate Limiter - 1000 Anfragen pro Minute
   */
  static adminLimiter = this.createRateLimiter({
    windowMs: 60 * 1000, // 1 Minute
    maxRequests: 1000,
    keyGenerator: (req) => {
      const user = (req as any).user;
      return user ? `admin:${user.uid}` : `admin:${req.ip}`;
    },
    message: 'Admin rate limit exceeded'
  });

  /**
   * Cleanup-Funktion für abgelaufene Rate Limit Daten
   */
  static async cleanup(): Promise<void> {
    try {
      const now = Date.now();
      const rateLimitsRef = this.db.collection('rateLimits');
      
      // Abgelaufene Einträge finden
      const expiredQuery = rateLimitsRef.where('resetTime', '<', now);
      const expiredDocs = await expiredQuery.get();

      // Batch-Delete für bessere Performance
      const batch = this.db.batch();
      expiredDocs.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      if (expiredDocs.size > 0) {
        await batch.commit();
        this.logger.info(`Cleaned up ${expiredDocs.size} expired rate limit entries`);
      }
    } catch (error) {
      this.logger.error('Rate limit cleanup failed', error as Error);
    }
  }
}

// Export der Rate Limiter für bessere Kompatibilität
export const rateLimitMiddleware = (type: string) => {
  switch(type) {
    case 'api': return RateLimitMiddleware.apiLimiter;
    case 'auth': return RateLimitMiddleware.authLimiter;
    case 'upload': return RateLimitMiddleware.uploadLimiter;
    case 'analysis': return RateLimitMiddleware.analysisLimiter;
    case 'premium': return RateLimitMiddleware.premiumAnalysisLimiter;
    case 'admin': return RateLimitMiddleware.adminLimiter;
    default: return RateLimitMiddleware.apiLimiter;
  }
};

// Export der Rate Limiter
export const {
  createRateLimiter,
  apiLimiter,
  authLimiter,
  uploadLimiter,
  analysisLimiter,
  premiumAnalysisLimiter,
  adminLimiter
} = RateLimitMiddleware;
