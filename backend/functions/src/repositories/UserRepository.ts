import { BaseRepository } from './BaseRepository';
import { User, UserRole, SubscriptionTier } from '../models';

/**
 * User Repository implementing Repository Pattern
 * Handles all user-related database operations
 */
export class UserRepository extends BaseRepository<User> {
  constructor() {
    super('users');
  }

  /**
   * Find user by UID (Firebase Auth ID)
   */
  async findByUid(uid: string): Promise<User | null> {
    try {
      const snapshot = await this.getCollection()
        .where('uid', '==', uid)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      if (!doc) return null;
      
      return {
        id: doc.id,
        ...doc.data()
      } as User;
    } catch (error) {
      this.logger.error('Failed to find user by UID', error as Error, { uid });
      throw error;
    }
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    try {
      const snapshot = await this.getCollection()
        .where('email', '==', email.toLowerCase())
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      if (!doc) return null;
      
      return {
        id: doc.id,
        ...doc.data()
      } as User;
    } catch (error) {
      this.logger.error('Failed to find user by email', error as Error, { email });
      throw error;
    }
  }

  /**
   * Create or update user from Firebase Auth
   */
  async createOrUpdateFromAuth(authUser: {
    uid: string;
    email: string;
    displayName?: string;
    photoURL?: string;
  }): Promise<User> {
    try {
      const existingUser = await this.findByUid(authUser.uid);
      
      if (existingUser) {
        // Update existing user including lastLogin
        await this.update(existingUser.id, {
          email: authUser.email.toLowerCase(),
          displayName: authUser.displayName,
          photoURL: authUser.photoURL,
          lastLogin: new Date()
        });

        const updatedUser = await this.findById(existingUser.id);
        if (!updatedUser) {
          throw new Error('Failed to retrieve updated user in store');
        }
        
        return updatedUser;
      } else {
        // Create new user
        const newUserId = await this.create({
          uid: authUser.uid,
          email: authUser.email.toLowerCase(),
          displayName: authUser.displayName,
          photoURL: authUser.photoURL,
          role: UserRole.USER,
          subscription: SubscriptionTier.FREE,
          lastLogin: new Date(),
          settings: {
            language: 'de',
            timezone: 'Europe/Zurich',
            notifications: {
              email: true,
              push: true,
              analysisComplete: true,
              weeklyReport: false,
              securityAlerts: true
            },
            privacy: {
              dataRetention: 365,
              anonymizeData: false,
              shareUsageStats: true
            },
            billing: {
              monthlyBudget: 50,
              warningThreshold: 80,
              autoTopup: false
            }
          },
          statistics: {
            documentsAnalyzed: 0,
            totalCost: 0,
            monthlyUsage: [],
            averageConfidence: 0,
            lastActivity: new Date()
          },
          documents: []
        });

        const newUser = await this.findById(newUserId);
        if (!newUser) {
          throw new Error('Failed to retrieve created user');
        }

        this.logger.info('New user created', { userId: newUserId, email: authUser.email });
        return newUser;
      }
    } catch (error) {
      this.logger.error('Failed to create or update user from auth', error as Error, { 
        uid: authUser.uid, 
        email: authUser.email 
      });
      throw error;
    }
  }

  /**
   * Update user subscription
   */
  async updateSubscription(
    userId: string, 
    subscription: SubscriptionTier
  ): Promise<void> {
    try {
      await this.update(userId, { subscription });
      
      this.logger.info('User subscription updated', {
        userId,
        subscription
      });
    } catch (error) {
      this.logger.error('Failed to update user subscription', error as Error, {
        userId,
        subscription
      });
      throw error;
    }
  }

  /**
   * Update user role
   */
  async updateRole(userId: string, role: UserRole): Promise<void> {
    try {
      await this.update(userId, { role });
      
      this.logger.info('User role updated', {
        userId,
        role
      });
    } catch (error) {
      this.logger.error('Failed to update user role', error as Error, {
        userId,
        role
      });
      throw error;
    }
  }

  /**
   * Update user statistics
   */
  async updateStatistics(
    userId: string,
    updates: Partial<User['statistics']>
  ): Promise<void> {
    try {
      const user = await this.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const newStatistics = {
        ...user.statistics,
        ...updates,
        lastActivity: new Date()
      };

      await this.update(userId, { statistics: newStatistics });
      
      this.logger.debug('User statistics updated', {
        userId,
        updates
      });
    } catch (error) {
      this.logger.error('Failed to update user statistics', error as Error, {
        userId
      });
      throw error;
    }
  }

  /**
   * Add monthly usage record
   */
  async addMonthlyUsage(
    userId: string,
    month: string,
    documentsCount: number,
    cost: number,
    tokensUsed: number
  ): Promise<void> {
    try {
      const user = await this.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const monthlyUsage = user.statistics.monthlyUsage || [];
      const existingIndex = monthlyUsage.findIndex(usage => usage.month === month);

      if (existingIndex >= 0) {
        // Update existing month
        const existingUsage = monthlyUsage[existingIndex];
        if (existingUsage) {
          monthlyUsage[existingIndex] = {
            month,
            documentsCount: existingUsage.documentsCount + documentsCount,
            cost: existingUsage.cost + cost,
            tokensUsed: existingUsage.tokensUsed + tokensUsed
          };
        }
      } else {
        // Add new month
        monthlyUsage.push({
          month,
          documentsCount,
          cost,
          tokensUsed
        });
      }

      // Keep only last 12 months
      monthlyUsage.sort((a, b) => b.month.localeCompare(a.month));
      const last12Months = monthlyUsage.slice(0, 12);

      await this.updateStatistics(userId, {
        monthlyUsage: last12Months,
        totalCost: user.statistics.totalCost + cost,
        documentsAnalyzed: user.statistics.documentsAnalyzed + documentsCount
      });

      this.logger.info('Monthly usage added', {
        userId,
        month,
        documentsCount,
        cost,
        tokensUsed
      });
    } catch (error) {
      this.logger.error('Failed to add monthly usage', error as Error, {
        userId,
        month
      });
      throw error;
    }
  }

  /**
   * Get users by subscription tier
   */
  async findBySubscription(
    subscription: SubscriptionTier,
    limit: number = 50
  ): Promise<User[]> {
    try {
      const snapshot = await this.getCollection()
        .where('subscription', '==', subscription)
        .limit(limit)
        .get();

      const users = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as User));

      return users;
    } catch (error) {
      this.logger.error('Failed to find users by subscription', error as Error, {
        subscription
      });
      throw error;
    }
  }

  /**
   * Get admin users
   */
  async findAdmins(): Promise<User[]> {
    try {
      const snapshot = await this.getCollection()
        .where('role', '==', UserRole.ADMIN)
        .get();

      const admins = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as User));

      return admins;
    } catch (error) {
      this.logger.error('Failed to find admin users', error as Error);
      throw error;
    }
  }

  /**
   * Update user activity timestamp
   */
  async updateLastActivity(userId: string): Promise<void> {
    try {
      await this.updateStatistics(userId, {
        lastActivity: new Date()
      });
    } catch (error) {
      this.logger.error('Failed to update user last activity', error as Error, {
        userId
      });
      throw error;
    }
  }
}
