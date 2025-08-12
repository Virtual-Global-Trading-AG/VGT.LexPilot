import { NextFunction, Request, Response } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import pdfParse from 'pdf-parse';
import { BaseController } from './BaseController';

interface AdminUserUpdateRequest {
  role?: 'user' | 'premium' | 'admin';
  status?: 'active' | 'suspended' | 'banned';
  subscription?: {
    type: 'free' | 'premium' | 'enterprise';
    expiresAt?: string;
  };
  customClaims?: Record<string, any>;
}

interface SystemStatsResponse {
  users: {
    total: number;
    active: number;
    premium: number;
    newThisMonth: number;
  };
  documents: {
    total: number;
    totalSize: number;
    uploadsToday: number;
  };
  analyses: {
    total: number;
    completedToday: number;
    averageProcessingTime: number;
  };
  costs: {
    totalThisMonth: number;
    averagePerUser: number;
  };
  system: {
    uptime: number;
    version: string;
    environment: string;
  };
}

export class AdminController extends BaseController {
  private db = getFirestore();

  /**
   * Get system statistics
   * GET /api/admin/stats
   */
  public async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    return this.getSystemStats(req, res, next);
  }

  /**
   * Get system health
   * GET /api/admin/health
   */
  public async getHealth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = this.getUserId(req);
      this.logger.info('Admin health check requested', { adminId });

      const health = await this.checkSystemHealth();

      this.sendSuccess(res, {
        status: health.status,
        checks: health.checks,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });

    } catch (error) {
      this.logger.error('Get system health failed', error as Error, {
        adminId: this.getUserId(req)
      });
      next(error);
    }
  }

  /**
   * Get system metrics
   * GET /api/admin/metrics
   */
  public async getMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = this.getUserId(req);
      const { from, to, granularity = 'day' } = req.query;

      this.logger.info('Admin metrics requested', { 
        adminId, 
        from, 
        to, 
        granularity 
      });

      const metrics = await this.getSystemMetrics({
        from: from ? new Date(from as string) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        to: to ? new Date(to as string) : new Date(),
        granularity: granularity as string
      });

      this.sendSuccess(res, { metrics });

    } catch (error) {
      this.logger.error('Get system metrics failed', error as Error, {
        adminId: this.getUserId(req),
        query: req.query
      });
      next(error);
    }
  }

  /**
   * Get all users
   * GET /api/admin/users
   */
  public async getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    return this.listUsers(req, res, next);
  }

  /**
   * Get user by ID
   * GET /api/admin/users/:userId
   */
  public async getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
    return this.getUserDetails(req, res, next);
  }
  static requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const user = (req as any).user;

      if (!user || !user.customClaims || user.customClaims.role !== 'admin') {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Admin access required',
          code: 'ADMIN_ACCESS_REQUIRED'
        });
        return;
      }

      next();
    } catch (error) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Admin verification failed',
        code: 'ADMIN_VERIFICATION_ERROR'
      });
    }
  };

  /**
   * Get system statistics
   * GET /api/admin/stats
   */
  public async getSystemStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      this.logger.info('Admin system stats requested', {
        adminId: this.getUserId(req)
      });

      // Parallele Ausführung aller Statistik-Abfragen
      const [userStats, documentStats, analysisStats, costStats] = await Promise.all([
        this.getUserStats(),
        this.getDocumentStats(),
        this.getAnalysisStats(),
        this.getCostStats()
      ]);

      const systemStats: SystemStatsResponse = {
        users: userStats,
        documents: documentStats,
        analyses: analysisStats,
        costs: costStats,
        system: {
          uptime: process.uptime(),
          version: process.env.npm_package_version || '1.0.0',
          environment: process.env.NODE_ENV || 'development'
        }
      };

      this.sendSuccess(res, { stats: systemStats }, 'System statistics retrieved');

    } catch (error) {
      this.logger.error('Get system stats failed', error as Error, {
        adminId: this.getUserId(req)
      });
      next(error);
    }
  }

  /**
   * List all users with pagination and filtering
   * GET /api/admin/users
   */
  public async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        page = 1,
        limit = 20,
        role,
        status,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const pagination = this.getPaginationParams({ page, limit });

      this.logger.info('Admin user list requested', {
        adminId: this.getUserId(req),
        filters: { role, status, search },
        pagination
      });

      let query: any = this.db.collection('users');

      // Filter anwenden
      if (role) {
        query = query.where('role', '==', role);
      }
      if (status) {
        query = query.where('status', '==', status);
      }

      // Sortierung
      const sortField = ['createdAt', 'lastLogin', 'email'].includes(sortBy as string)
        ? sortBy as string
        : 'createdAt';
      const order = sortOrder === 'asc' ? 'asc' : 'desc';

      query = query.orderBy(sortField, order);

      // Pagination
      const totalQuery = await query.get();
      const total = totalQuery.size;

      const usersSnapshot = await query
        .limit(pagination.limit)
        .offset(pagination.offset)
        .get();

      let users = usersSnapshot.docs.map((doc: any) => {
        const userData = doc.data();
        // Sensible Daten entfernen
        const { hashedPassword, ...safeUserData } = userData;
        return {
          id: doc.id,
          ...safeUserData
        };
      });

      // Textsuche auf Client-Seite (da Firestore keine Volltext-Suche hat)
      if (search) {
        const searchTerm = (search as string).toLowerCase();
        users = users.filter((user: any) =>
          user.email?.toLowerCase().includes(searchTerm) ||
          user.displayName?.toLowerCase().includes(searchTerm) ||
          user.firstName?.toLowerCase().includes(searchTerm) ||
          user.lastName?.toLowerCase().includes(searchTerm)
        );
      }

      const totalPages = Math.ceil(total / pagination.limit);

      this.sendSuccess(res, {
        users,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages
        }
      }, 'Users retrieved');

    } catch (error) {
      this.logger.error('List users failed', error as Error, {
        adminId: this.getUserId(req),
        query: req.query
      });
      next(error);
    }
  }

  /**
   * Get specific user details
   * GET /api/admin/users/:userId
   */
  public async getUserDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        this.sendError(res, 400, 'Missing userId parameter');
        return;
      }

      this.logger.info('Admin user details requested', {
        adminId: this.getUserId(req),
        targetUserId: userId
      });

      // Firestore Benutzerdaten
      const userDoc = await this.db.collection('users').doc(userId).get();

      if (!userDoc.exists) {
        this.sendError(res, 404, 'User not found');
        return;
      }

      // Firebase Auth Benutzerdaten
      let authUser;
      try {
        authUser = await getAuth().getUser(userId);
      } catch (authError) {
        this.logger.warn('Firebase Auth user not found', { userId });
      }

      const userData = userDoc.data();
      const { hashedPassword, ...safeUserData } = userData || {};

      // Zusätzliche Benutzerstatistiken
      const [documentsCount, analysesCount, totalCosts] = await Promise.all([
        this.getUserDocumentsCount(userId),
        this.getUserAnalysesCount(userId),
        this.getUserTotalCosts(userId)
      ]);

      this.sendSuccess(res, {
        user: {
          ...safeUserData,
          authData: authUser ? {
            uid: authUser.uid,
            email: authUser.email,
            emailVerified: authUser.emailVerified,
            disabled: authUser.disabled,
            metadata: authUser.metadata,
            customClaims: authUser.customClaims
          } : null,
          statistics: {
            documentsCount,
            analysesCount,
            totalCosts
          }
        }
      }, 'User details retrieved');

    } catch (error) {
      this.logger.error('Get user failed', error as Error, {
        adminId: this.getUserId(req),
        targetUserId: req.params.userId
      });
      next(error);
    }
  }

  /**
   * Update user data and permissions
   * PUT /api/admin/users/:userId
   */
  public async updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;
      const updateData: AdminUserUpdateRequest = req.body;

      if (!userId) {
        this.sendError(res, 400, 'Missing userId parameter');
        return;
      }

      this.logger.warn('Admin user update requested', {
        adminId: this.getUserId(req),
        targetUserId: userId,
        updateData
      });

      // Benutzer existiert prüfen
      const userDoc = await this.db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        this.sendError(res, 404, 'User not found');
        return;
      }

      // Firestore Update
      const firestoreUpdate: any = {
        updatedAt: new Date().toISOString()
      };

      if (updateData.role) firestoreUpdate.role = updateData.role;
      if (updateData.status) firestoreUpdate.status = updateData.status;
      if (updateData.subscription) firestoreUpdate.subscription = updateData.subscription;

      await this.db.collection('users').doc(userId).update(firestoreUpdate);

      // Firebase Auth Custom Claims Update
      if (updateData.customClaims || updateData.role) {
        const customClaims = {
          ...(updateData.customClaims || {}),
          role: updateData.role || userDoc.data()?.role || 'user'
        };

        await getAuth().setCustomUserClaims(userId, customClaims);
      }

      // Status Update in Firebase Auth
      if (updateData.status === 'banned' || updateData.status === 'suspended') {
        await getAuth().updateUser(userId, { disabled: true });
      } else if (updateData.status === 'active') {
        await getAuth().updateUser(userId, { disabled: false });
      }

      this.sendSuccess(res, {
        userId,
        updated: updateData
      }, 'User updated successfully');

    } catch (error) {
      this.logger.error('Update user failed', error as Error, {
        adminId: this.getUserId(req),
        targetUserId: req.params.userId,
        updateData: req.body
      });
      next(error);
    }
  }

  /**
   * Delete user account (admin action)
   * DELETE /api/admin/users/:userId
   */
  public async deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;
      const { confirmDelete } = req.body;

      if (!userId) {
        this.sendError(res, 400, 'Missing userId parameter');
        return;
      }

      if (!confirmDelete) {
        this.sendError(res, 400, 'Account deletion requires confirmation');
        return;
      }

      this.logger.warn('Admin user deletion requested', {
        adminId: this.getUserId(req),
        targetUserId: userId
      });

      // Alle Benutzerdaten löschen
      await this.deleteUserData(userId);

      // Firebase Auth Benutzer löschen
      try {
        await getAuth().deleteUser(userId);
      } catch (authError) {
        this.logger.warn('Firebase Auth user deletion failed', authError);
      }

      this.sendSuccess(res, { userId }, 'User deleted successfully');

    } catch (error) {
      this.logger.error('Delete user failed', error as Error, {
        adminId: this.getUserId(req),
        targetUserId: req.params.userId
      });
      next(error);
    }
  }

  /**
   * Get system audit logs
   * GET /api/admin/logs
   */
  public async getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        page = 1,
        limit = 50,
        level,
        userId,
        action,
        startDate,
        endDate
      } = req.query;

      const pagination = this.getPaginationParams({ page, limit });

      this.logger.info('Admin audit logs requested', {
        adminId: this.getUserId(req),
        filters: { level, userId, action, startDate, endDate }
      });

      let query = this.db.collection('auditLogs')
        .orderBy('timestamp', 'desc');

      // Filter anwenden
      if (level) {
        query = query.where('level', '==', level);
      }
      if (userId) {
        query = query.where('userId', '==', userId);
      }
      if (action) {
        query = query.where('action', '==', action);
      }
      if (startDate) {
        query = query.where('timestamp', '>=', startDate);
      }
      if (endDate) {
        query = query.where('timestamp', '<=', endDate);
      }

      // Pagination
      const logsSnapshot = await query
        .limit(pagination.limit)
        .offset(pagination.offset)
        .get();

      const logs = logsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Gesamtanzahl (vereinfacht)
      const totalSnapshot = await this.db.collection('auditLogs').get();
      const total = totalSnapshot.size;
      const totalPages = Math.ceil(total / pagination.limit);

      this.sendSuccess(res, {
        logs,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages
        }
      }, 'Audit logs retrieved');

    } catch (error) {
      this.logger.error('Get audit logs failed', error as Error, {
        adminId: this.getUserId(req),
        query: req.query
      });
      next(error);
    }
  }

  // Private helper methods

  private async getUserStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalUsers, activeUsers, premiumUsers, newUsers] = await Promise.all([
      this.db.collection('users').get(),
      this.db.collection('users').where('status', '==', 'active').get(),
      this.db.collection('users').where('subscription.type', '!=', 'free').get(),
      this.db.collection('users').where('createdAt', '>=', startOfMonth.toISOString()).get()
    ]);

    return {
      total: totalUsers.size,
      active: activeUsers.size,
      premium: premiumUsers.size,
      newThisMonth: newUsers.size
    };
  }

  private async getDocumentStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalDocs, todayUploads] = await Promise.all([
      this.db.collection('documents').get(),
      this.db.collection('documents').where('uploadedAt', '>=', today.toISOString()).get()
    ]);

    // Gesamtgröße berechnen
    let totalSize = 0;
    totalDocs.docs.forEach(doc => {
      const data = doc.data();
      totalSize += data.size || 0;
    });

    return {
      total: totalDocs.size,
      totalSize,
      uploadsToday: todayUploads.size
    };
  }

  private async getAnalysisStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalAnalyses, todayCompleted] = await Promise.all([
      this.db.collection('analyses').get(),
      this.db.collection('analyses')
        .where('status', '==', 'completed')
        .where('completedAt', '>=', today.toISOString())
        .get()
    ]);

    // Durchschnittliche Verarbeitungszeit berechnen
    let totalProcessingTime = 0;
    let completedCount = 0;

    totalAnalyses.docs.forEach(doc => {
      const data = doc.data();
      if (data.status === 'completed' && data.createdAt && data.completedAt) {
        const processingTime = new Date(data.completedAt).getTime() - new Date(data.createdAt).getTime();
        totalProcessingTime += processingTime;
        completedCount++;
      }
    });

    const averageProcessingTime = completedCount > 0 ? totalProcessingTime / completedCount : 0;

    return {
      total: totalAnalyses.size,
      completedToday: todayCompleted.size,
      averageProcessingTime: Math.round(averageProcessingTime / 1000) // in Sekunden
    };
  }

  private async getCostStats() {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const costsSnapshot = await this.db.collection('costs')
      .where('createdAt', '>=', startOfMonth.toISOString())
      .get();

    let totalThisMonth = 0;
    const userCosts = new Map<string, number>();

    costsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const amount = data.amount || 0;
      totalThisMonth += amount;

      const userId = data.userId;
      if (userId) {
        userCosts.set(userId, (userCosts.get(userId) || 0) + amount);
      }
    });

    const averagePerUser = userCosts.size > 0 ? totalThisMonth / userCosts.size : 0;

    return {
      totalThisMonth,
      averagePerUser
    };
  }

  private async getUserDocumentsCount(userId: string): Promise<number> {
    const snapshot = await this.db.collection('documents')
      .where('userId', '==', userId)
      .get();
    return snapshot.size;
  }

  private async getUserAnalysesCount(userId: string): Promise<number> {
    const snapshot = await this.db.collection('analyses')
      .where('userId', '==', userId)
      .get();
    return snapshot.size;
  }

  private async getUserTotalCosts(userId: string): Promise<number> {
    const snapshot = await this.db.collection('costs')
      .where('userId', '==', userId)
      .get();

    return snapshot.docs.reduce((total, doc) => {
      return total + (doc.data().amount || 0);
    }, 0);
  }

  private async deleteUserData(userId: string): Promise<void> {
    const batch = this.db.batch();

    // Alle Benutzer-Collections löschen
    const collections = ['documents', 'analyses', 'notifications', 'costs', 'rateLimits'];

    for (const collectionName of collections) {
      const snapshot = await this.db.collection(collectionName)
        .where('userId', '==', userId)
        .get();

      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
    }

    // Benutzerprofil löschen
    batch.delete(this.db.collection('users').doc(userId));

    await batch.commit();
  }

  private async checkSystemHealth(): Promise<{status: 'healthy' | 'degraded' | 'unhealthy', checks: any[]}> {
    const checks = [];
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    try {
      // Database connectivity check
      const dbStart = Date.now();
      await this.db.collection('health').limit(1).get();
      const dbTime = Date.now() - dbStart;

      checks.push({
        name: 'database',
        status: dbTime < 1000 ? 'healthy' : 'degraded',
        responseTime: `${dbTime}ms`,
        message: dbTime < 1000 ? 'Database responding normally' : 'Database response slow'
      });

      if (dbTime >= 1000) overallStatus = 'degraded';

      // Auth service check
      try {
        const authStart = Date.now();
        await getAuth().listUsers(1);
        const authTime = Date.now() - authStart;

        checks.push({
          name: 'auth',
          status: authTime < 500 ? 'healthy' : 'degraded',
          responseTime: `${authTime}ms`,
          message: authTime < 500 ? 'Auth service responding normally' : 'Auth service response slow'
        });

        if (authTime >= 500) overallStatus = 'degraded';
      } catch (error) {
        checks.push({
          name: 'auth',
          status: 'unhealthy',
          responseTime: 'N/A',
          message: 'Auth service error: ' + (error as Error).message
        });
        overallStatus = 'unhealthy';
      }

      // Memory usage check
      const memUsage = process.memoryUsage();
      const memUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

      checks.push({
        name: 'memory',
        status: memUsagePercent < 80 ? 'healthy' : memUsagePercent < 95 ? 'degraded' : 'unhealthy',
        usage: `${Math.round(memUsagePercent)}%`,
        message: `Memory usage: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
      });

      if (memUsagePercent >= 95) overallStatus = 'unhealthy';
      else if (memUsagePercent >= 80) overallStatus = 'degraded';

      return { status: overallStatus, checks };

    } catch (error) {
      this.logger.error('System health check failed', error as Error);
      return {
        status: 'unhealthy',
        checks: [{
          name: 'system',
          status: 'unhealthy',
          message: 'Health check failed: ' + (error as Error).message
        }]
      };
    }
  }

  private async getSystemMetrics(options: {
    from: Date;
    to: Date;
    granularity: string;
  }): Promise<any> {
    const { from, to, granularity } = options;

    try {
      // TODO: Implement actual metrics collection based on granularity
      // This is a placeholder implementation

      const timeDiff = to.getTime() - from.getTime();
      const timePoints = granularity === 'hour' ?
        Math.ceil(timeDiff / (1000 * 60 * 60)) :
        Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

      const metrics = {
        timeseries: [] as any[],
        summary: {
          period: {
            from: from.toISOString(),
            to: to.toISOString(),
            granularity
          },
          users: {
            active: 0,
            newSignups: 0,
            retention: 0
          },
          documents: {
            uploaded: 0,
            totalSize: 0,
            averageSize: 0
          },
          analyses: {
            started: 0,
            completed: 0,
            failed: 0,
            averageTime: 0
          },
          costs: {
            total: 0,
            perUser: 0,
            perAnalysis: 0
          },
          performance: {
            averageResponseTime: 0,
            errorRate: 0,
            uptime: 99.9
          }
        }
      };

      // Generate time series data points
      for (let i = 0; i < Math.min(timePoints, 100); i++) {
        const timestamp = new Date(from.getTime() + (i * timeDiff / timePoints));

        metrics.timeseries.push({
          timestamp: timestamp.toISOString(),
          users: {
            active: Math.floor(Math.random() * 100),
            newSignups: Math.floor(Math.random() * 10)
          },
          documents: {
            uploaded: Math.floor(Math.random() * 50),
            totalSize: Math.floor(Math.random() * 1000000)
          },
          analyses: {
            started: Math.floor(Math.random() * 20),
            completed: Math.floor(Math.random() * 18),
            failed: Math.floor(Math.random() * 2)
          },
          costs: Math.random() * 100,
          performance: {
            responseTime: 100 + Math.random() * 200,
            errorRate: Math.random() * 0.05
          }
        });
      }

      return metrics;

    } catch (error) {
      this.logger.error('Get system metrics failed', error as Error, { options });
      throw new Error('Failed to retrieve system metrics');
    }
  }

  /**
   * Index Legal Texts for RAG (Admin Only)
   * POST /api/admin/legal-texts/index
   */
  public async indexLegalTexts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { texts } = req.body;

      // Validate admin role
      const userRecord = await getAuth().getUser(userId);
      if (!userRecord.customClaims?.admin) {
        this.sendError(res, 403, 'Admin access required');
        return;
      }

      if (!texts || !Array.isArray(texts)) {
        this.sendError(res, 400, 'Legal texts array is required');
        return;
      }

      // Validate text format
      for (const text of texts) {
        if (!text.content || !text.title || !text.source) {
          this.sendError(res, 400, 'Each text must have content, title, and source');
          return;
        }
      }

      // Import AnalysisService dynamically to avoid circular dependency
      const { AnalysisService } = await import('../services/AnalysisService');
      const analysisService = new AnalysisService();

      this.logger.info('Starting legal texts indexing', {
        userId,
        textsCount: texts.length
      });

      let progress = 0;
      const progressCallback = (progressPercent: number, status: string) => {
        progress = progressPercent;
        this.logger.info('Indexing progress', { progress, status });
      };

      await analysisService.indexLegalTexts(texts, progressCallback);

      this.sendSuccess(res, {
        message: 'Legal texts indexed successfully',
        indexedTexts: texts.length,
        timestamp: new Date().toISOString()
      });

      this.logger.info('Legal texts indexing completed', {
        userId,
        textsCount: texts.length
      });

    } catch (error) {
      this.logger.error('Legal texts indexing failed', error as Error, {
        userId: this.getUserId(req)
      });
      next(error);
    }
  }

  /**
   * Search Legal Context (Admin Only - for testing)
   * POST /api/admin/legal-texts/search
   */
  public async searchLegalContext(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { query, legalArea, jurisdiction, topK = 5 } = req.body;

      // Validate admin role
      const userRecord = await getAuth().getUser(userId);
      if (!userRecord.customClaims?.admin) {
        this.sendError(res, 403, 'Admin access required');
        return;
      }

      if (!query || typeof query !== 'string') {
        this.sendError(res, 400, 'Search query is required');
        return;
      }

      // Import AnalysisService dynamically
      const { AnalysisService } = await import('../services/AnalysisService');
      const analysisService = new AnalysisService();

      const searchResults = await analysisService.searchLegalContext(
        query,
        legalArea,
        jurisdiction,
        topK
      );

      this.sendSuccess(res, {
        query,
        results: {
          total: searchResults.totalResults,
          returned: searchResults.documents.length,
          averageScore: searchResults.scores.length > 0
            ? searchResults.scores.reduce((a, b) => a + b, 0) / searchResults.scores.length
            : 0,
          documents: searchResults.documents.map((doc, index) => ({
            id: doc.metadata.id,
            title: doc.metadata.title,
            source: doc.metadata.source,
            legalArea: doc.metadata.legalArea,
            jurisdiction: doc.metadata.jurisdiction,
            excerpt: doc.pageContent.substring(0, 300) + '...',
            score: searchResults.scores[index],
            legalReferences: doc.metadata.legalReferences
          }))
        },
        timestamp: new Date().toISOString()
      });

      this.logger.info('Legal context search completed', {
        userId,
        query: query.substring(0, 100),
        resultsCount: searchResults.documents.length
      });

    } catch (error) {
      this.logger.error('Legal context search failed', error as Error, {
        userId: this.getUserId(req),
        query: req.body.query?.substring(0, 100)
      });
      next(error);
    }
  }

  public async indexSpecificLegalText(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);

      this.logger.info('Starting specific legal text indexing', {});

      // Datenschutzrecht - Index 1 (bestehende Dokumente)
      const datenschutzTexts = [];

      // Read the dsg.pdf file from the assets directory
      const dsgPdfPath = path.join(__dirname, '../../assets/dsg.pdf');
      if (fs.existsSync(dsgPdfPath)) {
        const dsgPdfBuffer = fs.readFileSync(dsgPdfPath);
        const dsgPdfData = await pdfParse(dsgPdfBuffer);
        datenschutzTexts.push({
          content: dsgPdfData.text,
          title: 'DSG - Datenschutzgesetz',
          source: 'DSG',
          jurisdiction: 'CH',
          legalArea: 'Datenschutzrecht'
        });
      }

      // Read the dsgvo.pdf file from the assets directory
      const dsgvoPdfPath = path.join(__dirname, '../../assets/dsgvo.pdf');
      if (fs.existsSync(dsgvoPdfPath)) {
        const dsgvoPdfBuffer = fs.readFileSync(dsgvoPdfPath);
        const dsgvoPdfData = await pdfParse(dsgvoPdfBuffer);
        datenschutzTexts.push({
          content: dsgvoPdfData.text,
          title: 'DSGVO - Datenschutz-Grundverordnung',
          source: 'DSGVO',
          jurisdiction: 'EU',
          legalArea: 'Datenschutzrecht'
        });
      }

      // Obligationenrecht - Index 2 (neues Dokument)
      const obligationenrechtTexts = [];

      // Read the OR.pdf file from the assets directory
      const orPdfPath = path.join(__dirname, '../../assets/OR.pdf');
      if (fs.existsSync(orPdfPath)) {
        const orPdfBuffer = fs.readFileSync(orPdfPath);
        const orPdfData = await pdfParse(orPdfBuffer);
        obligationenrechtTexts.push({
          content: orPdfData.text,
          title: 'OR - Obligationenrecht',
          source: 'OR',
          jurisdiction: 'CH',
          legalArea: 'Obligationenrecht'
        });
      }

      // Import AnalysisService dynamically to avoid circular dependency
      const { AnalysisService } = await import('../services/AnalysisService');
      const analysisService = new AnalysisService();

      const indexingPromises = [];
      const indexedDocuments = [];

      // Index Datenschutzrecht wenn Dokumente vorhanden
      if (datenschutzTexts.length > 0) {
        this.logger.info('Starting datenschutz legal text indexing', {
          userId,
          documents: datenschutzTexts.map(t => t.title),
          index: 'legal-texts',
          namespace: 'datenschutz-regulations'
        });

        const datenschutzProgressCallback = (progressPercent: number, status: string) => {
          this.logger.info('Datenschutz indexing progress', { progress: progressPercent, status });
        };

        indexingPromises.push(
          analysisService.indexLegalTextsToSpecificIndex(
            datenschutzTexts,
            {
              indexName: process.env.PINECONE_LEGAL_INDEX || 'legal-texts',
              namespace: 'datenschutz-regulations',
              createIfNotExists: true
            },
            datenschutzProgressCallback
          )
        );

        indexedDocuments.push(...datenschutzTexts.map(t => ({
          title: t.title,
          index: 'legal-texts',
          namespace: 'datenschutz-regulations'
        })));
      }

      // Index Obligationenrecht wenn Dokument vorhanden
      if (obligationenrechtTexts.length > 0) {
        this.logger.info('Starting obligationenrecht legal text indexing', {
          userId,
          documents: obligationenrechtTexts.map(t => t.title),
          index: 'obligationenrecht-texts',
          namespace: 'obligationenrecht-regulations'
        });

        const orProgressCallback = (progressPercent: number, status: string) => {
          this.logger.info('Obligationenrecht indexing progress', { progress: progressPercent, status });
        };

        indexingPromises.push(
          analysisService.indexLegalTextsToSpecificIndex(
            obligationenrechtTexts,
            {
              indexName: process.env.PINECONE_OR_INDEX || 'obligationenrecht-texts',
              namespace: 'obligationenrecht-regulations',
              createIfNotExists: true
            },
            orProgressCallback
          )
        );

        indexedDocuments.push(...obligationenrechtTexts.map(t => ({
          title: t.title,
          index: 'obligationenrecht-texts',
          namespace: 'obligationenrecht-regulations'
        })));
      }

      if (indexingPromises.length === 0) {
        this.sendError(res, 404, 'No legal text files found in assets directory');
        return;
      }

      // Alle Indexierungen parallel ausführen
      await Promise.all(indexingPromises);

      this.sendSuccess(res, {
        message: 'All specific legal texts indexed successfully',
        indexes: [
          ...(datenschutzTexts.length > 0 ? [{
            name: 'legal-texts',
            namespace: 'datenschutz-regulations',
            documents: datenschutzTexts.length
          }] : []),
          ...(obligationenrechtTexts.length > 0 ? [{
            name: 'obligationenrecht-texts',
            namespace: 'obligationenrecht-regulations',
            documents: obligationenrechtTexts.length
          }] : [])
        ],
        indexedDocuments,
        timestamp: new Date().toISOString()
      });

      this.logger.info('All specific legal text indexing completed', {
        userId,
        totalIndexes: indexingPromises.length,
        indexedDocuments: indexedDocuments.length
      });

    } catch (error) {
      this.logger.error('Specific legal text indexing failed', error as Error, {
        userId: this.getUserId(req)
      });
      next(error);
    }
  }
  /**
   * Get Vector Store Statistics (Admin Only)
   * GET /api/admin/vector-store/stats
   */
  public async getVectorStoreStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);

      // Validate admin role
      const userRecord = await getAuth().getUser(userId);
      if (!userRecord.customClaims?.admin) {
        this.sendError(res, 403, 'Admin access required');
        return;
      }

      // Import services dynamically
      const { AnalysisService } = await import('../services/AnalysisService');
      const { PineconeVectorStore } = await import('../vectorstore/PineconeVectorStore');
      const { EmbeddingService } = await import('../services/EmbeddingService');

      const embeddingService = new EmbeddingService();
      const vectorStore = new PineconeVectorStore(embeddingService);

      const indexName = process.env.PINECONE_LEGAL_INDEX || 'legal-texts';
      const namespace = 'legal-regulations';

      const [healthCheck, stats] = await Promise.all([
        vectorStore.healthCheck(indexName),
        vectorStore.getStats({ indexName, namespace })
      ]);

      this.sendSuccess(res, {
        vectorStore: {
          status: healthCheck ? 'healthy' : 'unhealthy',
          indexName,
          namespace,
          stats: {
            totalVectors: stats.totalVectors,
            dimension: stats.dimension,
            indexFullness: Math.round(stats.indexFullness * 100) / 100
          }
        },
        timestamp: new Date().toISOString()
      });

      this.logger.info('Vector store stats retrieved', {
        userId,
        indexName,
        totalVectors: stats.totalVectors
      });

    } catch (error) {
      this.logger.error('Failed to get vector store stats', error as Error, {
        userId: this.getUserId(req)
      });
      next(error);
    }
  }
}
