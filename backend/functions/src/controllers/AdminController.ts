import { Request, Response, NextFunction } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { BaseController } from './BaseController';
import { Logger } from '../utils/logger';

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
   * Admin middleware - verify admin role
   */
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
}
