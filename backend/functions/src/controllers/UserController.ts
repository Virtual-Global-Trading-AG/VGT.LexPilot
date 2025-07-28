import { Request, Response, NextFunction } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { BaseController } from './BaseController';
import { Logger } from '../utils/logger';

interface UserProfileUpdateRequest {
  firstName?: string;
  lastName?: string;
  company?: string;
  phone?: string;
  preferences?: {
    language?: string;
    timezone?: string;
    notifications?: {
      email?: boolean;
      push?: boolean;
      sms?: boolean;
    };
  };
}

interface UserStatsResponse {
  documentsUploaded: number;
  analysesCompleted: number;
  storageUsed: number;
  costThisMonth: number;
  lastLogin: string;
  memberSince: string;
}

export class UserController extends BaseController {
  private db = getFirestore();

  /**
   * Get user profile
   * GET /api/user/profile
   */
  public async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      
      // Benutzerprofil aus Firestore abrufen
      const userRef = this.db.collection('users').doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        // Benutzer existiert noch nicht in Firestore - erstellen
        await this.createUserProfile(userId);
        const newUserDoc = await userRef.get();
        
        this.sendSuccess(res, {
          profile: newUserDoc.data()
        }, 'User profile retrieved');
        return;
      }

      const profileData = userDoc.data();

      // Sensible Daten entfernen
      const { hashedPassword, ...safeProfile } = profileData || {};

      this.sendSuccess(res, {
        profile: safeProfile
      }, 'User profile retrieved');

    } catch (error) {
      this.logger.error('Get user profile failed', error as Error, {
        userId: this.getUserId(req)
      });
      next(error);
    }
  }

  /**
   * Update user profile
   * PUT /api/user/profile
   */
  public async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const updateData: UserProfileUpdateRequest = req.body;

      // Validation
      const missingFields = this.validateRequiredFields(req.body, []);
      if (missingFields.length > 0) {
        this.sendError(res, 400, 'Missing required fields', `Required: ${missingFields.join(', ')}`);
        return;
      }

      this.logger.info('User profile update requested', {
        userId,
        fields: Object.keys(updateData)
      });

      // Profil in Firestore aktualisieren
      const userRef = this.db.collection('users').doc(userId);
      const updatePayload = {
        ...updateData,
        updatedAt: new Date().toISOString()
      };

      await userRef.update(updatePayload);

      // Aktualisiertes Profil abrufen
      const updatedDoc = await userRef.get();
      const { hashedPassword, ...safeProfile } = updatedDoc.data() || {};

      this.sendSuccess(res, {
        profile: safeProfile
      }, 'Profile updated successfully');

    } catch (error) {
      this.logger.error('Update user profile failed', error as Error, {
        userId: this.getUserId(req),
        body: req.body
      });
      next(error);
    }
  }

  /**
   * Get user statistics and usage
   * GET /api/user/stats
   */
  public async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);

      // Statistiken aus verschiedenen Collections abrufen
      const [documentsCount, analysesCount, usage] = await Promise.all([
        this.getDocumentsCount(userId),
        this.getAnalysesCount(userId),
        this.getUserUsage(userId)
      ]);

      const stats: UserStatsResponse = {
        documentsUploaded: documentsCount,
        analysesCompleted: analysesCount,
        storageUsed: usage.storageUsed,
        costThisMonth: usage.costThisMonth,
        lastLogin: usage.lastLogin,
        memberSince: usage.memberSince
      };

      this.sendSuccess(res, { stats }, 'User statistics retrieved');

    } catch (error) {
      this.logger.error('Get user stats failed', error as Error, {
        userId: this.getUserId(req)
      });
      next(error);
    }
  }

  /**
   * Update user preferences
   * PUT /api/user/preferences
   */
  public async updatePreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { preferences } = req.body;

      if (!preferences) {
        this.sendError(res, 400, 'Missing preferences data');
        return;
      }

      this.logger.info('User preferences update requested', {
        userId,
        preferences
      });

      // Preferences in Firestore aktualisieren
      const userRef = this.db.collection('users').doc(userId);
      await userRef.update({
        preferences,
        updatedAt: new Date().toISOString()
      });

      this.sendSuccess(res, { preferences }, 'Preferences updated successfully');

    } catch (error) {
      this.logger.error('Update user preferences failed', error as Error, {
        userId: this.getUserId(req),
        body: req.body
      });
      next(error);
    }
  }

  /**
   * Delete user account
   * DELETE /api/user/account
   */
  public async deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { confirmDelete } = req.body;

      if (!confirmDelete) {
        this.sendError(res, 400, 'Account deletion requires confirmation');
        return;
      }

      this.logger.warn('User account deletion requested', { userId });

      // Alle Benutzerdaten löschen
      await this.deleteUserData(userId);

      // Firebase Auth Benutzer löschen
      await getAuth().deleteUser(userId);

      this.sendSuccess(res, {}, 'Account deleted successfully');

    } catch (error) {
      this.logger.error('Delete user account failed', error as Error, {
        userId: this.getUserId(req)
      });
      next(error);
    }
  }

  /**
   * Get user notifications
   * GET /api/user/notifications
   */
  public async getNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { page = 1, limit = 20, unreadOnly = false } = req.query;

      const pagination = this.getPaginationParams({ page, limit });
      
      // Benachrichtigungen aus Firestore abrufen
      let query = this.db.collection('notifications')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(pagination.limit)
        .offset(pagination.offset);

      if (unreadOnly === 'true') {
        query = query.where('read', '==', false);
      }

      const notificationsSnapshot = await query.get();
      const notifications = notificationsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Gesamtanzahl für Pagination
      const totalQuery = await this.db.collection('notifications')
        .where('userId', '==', userId)
        .get();

      const total = totalQuery.size;
      const totalPages = Math.ceil(total / pagination.limit);

      this.sendSuccess(res, {
        notifications,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages
        }
      }, 'Notifications retrieved');

    } catch (error) {
      this.logger.error('Get user notifications failed', error as Error, {
        userId: this.getUserId(req)
      });
      next(error);
    }
  }

  /**
   * Mark notification as read
   * PUT /api/user/notifications/:notificationId/read
   */
  public async markNotificationRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { notificationId } = req.params;

      if (!notificationId) {
        this.sendError(res, 400, 'Missing notificationId parameter');
        return;
      }

      const notificationRef = this.db.collection('notifications').doc(notificationId);
      const notificationDoc = await notificationRef.get();

      if (!notificationDoc.exists) {
        this.sendError(res, 404, 'Notification not found');
        return;
      }

      const notification = notificationDoc.data();
      if (notification?.userId !== userId) {
        this.sendError(res, 403, 'Access denied');
        return;
      }

      await notificationRef.update({
        read: true,
        readAt: new Date().toISOString()
      });

      this.sendSuccess(res, {}, 'Notification marked as read');

    } catch (error) {
      this.logger.error('Mark notification read failed', error as Error, {
        userId: this.getUserId(req),
        notificationId: req.params.notificationId
      });
      next(error);
    }
  }

  // Private helper methods
  
  private async createUserProfile(userId: string): Promise<void> {
    const user = await getAuth().getUser(userId);
    
    const userProfile = {
      uid: userId,
      email: user.email,
      emailVerified: user.emailVerified,
      displayName: user.displayName,
      photoURL: user.photoURL,
      firstName: '',
      lastName: '',
      company: '',
      phone: user.phoneNumber || '',
      role: 'user',
      status: 'active',
      preferences: {
        language: 'de',
        timezone: 'Europe/Zurich',
        notifications: {
          email: true,
          push: true,
          sms: false
        }
      },
      subscription: {
        type: 'free',
        expiresAt: null
      },
      usage: {
        documentsUploaded: 0,
        analysesCompleted: 0,
        storageUsed: 0,
        costThisMonth: 0
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    };

    await this.db.collection('users').doc(userId).set(userProfile);
  }

  private async getDocumentsCount(userId: string): Promise<number> {
    const documentsSnapshot = await this.db.collection('documents')
      .where('userId', '==', userId)
      .get();
    return documentsSnapshot.size;
  }

  private async getAnalysesCount(userId: string): Promise<number> {
    const analysesSnapshot = await this.db.collection('analyses')
      .where('userId', '==', userId)
      .where('status', '==', 'completed')
      .get();
    return analysesSnapshot.size;
  }

  private async getUserUsage(userId: string): Promise<{
    storageUsed: number;
    costThisMonth: number;
    lastLogin: string;
    memberSince: string;
  }> {
    const userDoc = await this.db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData) {
      return {
        storageUsed: 0,
        costThisMonth: 0,
        lastLogin: new Date().toISOString(),
        memberSince: new Date().toISOString()
      };
    }

    // Aktuelle Monatskosten berechnen
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const costsSnapshot = await this.db.collection('costs')
      .where('userId', '==', userId)
      .where('createdAt', '>=', startOfMonth.toISOString())
      .get();

    const costThisMonth = costsSnapshot.docs
      .reduce((total, doc) => total + (doc.data().amount || 0), 0);

    return {
      storageUsed: userData.usage?.storageUsed || 0,
      costThisMonth,
      lastLogin: userData.lastLogin || userData.createdAt,
      memberSince: userData.createdAt
    };
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
