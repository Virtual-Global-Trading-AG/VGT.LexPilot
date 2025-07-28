import { Request, Response, NextFunction } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { BaseController } from './BaseController';
import { Logger } from '../utils/logger';
import { UserRepository } from '../repositories/UserRepository';

interface LoginRequest {
  email: string;
  password: string;
}

interface RefreshTokenRequest {
  refreshToken: string;
}

interface PasswordResetRequest {
  email: string;
}

interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
}

interface VerifyEmailRequest {
  oobCode: string;
}

interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export class AuthController extends BaseController {
  private db = getFirestore();
  private userRepository = new UserRepository();

  /**
   * Login endpoint - validates credentials and returns custom token
   * POST /api/auth/login
   */
  public async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password }: LoginRequest = req.body;

      this.logger.info('Login attempt', { email, ip: req.ip });

      // Validation
      if (!email || !password) {
        this.sendError(res, 400, 'Missing email or password');
        return;
      }

      // Firebase Admin SDK doesn't directly validate password
      // We use Firebase Auth REST API for sign-in
      const signInResult = await this.signInWithEmailAndPassword(email, password);
      
      if (!signInResult.success) {
        this.logger.warn('Login failed', { email, error: signInResult.error });
        this.sendError(res, 401, 'Invalid credentials', signInResult.error);
        return;
      }

      const { idToken, refreshToken, localId } = signInResult.data;

      // Get user data from Firebase Auth
      const user = await getAuth().getUser(localId);

      // Create or update user in Firestore
      const userData = await this.userRepository.createOrUpdateFromAuth({
        uid: user.uid,
        email: user.email!,
        displayName: user.displayName,
        photoURL: user.photoURL
      });

      // Update last login
      await this.db.collection('users').doc(user.uid).update({
        lastLogin: new Date().toISOString()
      });

      this.logger.info('Login successful', { userId: user.uid, email });

      this.sendSuccess(res, {
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          emailVerified: user.emailVerified,
          role: userData.role
        },
        tokens: {
          idToken,
          refreshToken
        }
      }, 'Login successful');

    } catch (error) {
      this.logger.error('Login error', error as Error, { email: req.body.email });
      next(error);
    }
  }

  /**
   * Register new user
   * POST /api/auth/register
   */
  public async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, displayName, firstName, lastName }: RegisterRequest = req.body;

      this.logger.info('Registration attempt', { email, ip: req.ip });

      // Validation
      if (!email || !password) {
        this.sendError(res, 400, 'Missing email or password');
        return;
      }

      if (password.length < 6) {
        this.sendError(res, 400, 'Password must be at least 6 characters');
        return;
      }

      // Create user in Firebase Auth
      const userRecord = await getAuth().createUser({
        email: email.toLowerCase(),
        password,
        displayName: displayName || `${firstName} ${lastName}`.trim() || undefined,
        emailVerified: false
      });

      // Create user profile in Firestore
      const userProfile = {
        uid: userRecord.uid,
        email: email.toLowerCase(),
        emailVerified: false,
        displayName: displayName || '',
        firstName: firstName || '',
        lastName: lastName || '',
        company: '',
        phone: '',
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
        statistics: {
          documentsAnalyzed: 0,
          totalCost: 0,
          monthlyUsage: [],
          averageConfidence: 0,
          lastActivity: new Date()
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };

      await this.db.collection('users').doc(userRecord.uid).set(userProfile);

      // Generate email verification link
      const verificationLink = await getAuth().generateEmailVerificationLink(email);

      this.logger.info('User registered successfully', { 
        userId: userRecord.uid, 
        email 
      });

      this.sendSuccess(res, {
        user: {
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userRecord.displayName,
          emailVerified: userRecord.emailVerified
        },
        verificationLink // In production, send this via email instead
      }, 'Registration successful. Please verify your email.');

    } catch (error) {
      this.logger.error('Registration error', error as Error, { 
        email: req.body.email 
      });
      
      if ((error as any).code === 'auth/email-already-exists') {
        this.sendError(res, 409, 'Email already exists');
        return;
      }
      
      next(error);
    }
  }

  /**
   * Logout user
   * POST /api/auth/logout
   */
  public async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);

      this.logger.info('Logout attempt', { userId });

      // Revoke all refresh tokens for the user
      await getAuth().revokeRefreshTokens(userId);

      this.logger.info('Logout successful', { userId });

      this.sendSuccess(res, {}, 'Logout successful');

    } catch (error) {
      this.logger.error('Logout error', error as Error, { 
        userId: this.getUserId(req) 
      });
      next(error);
    }
  }

  /**
   * Refresh token
   * POST /api/auth/refresh
   */
  public async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken }: RefreshTokenRequest = req.body;

      if (!refreshToken) {
        this.sendError(res, 400, 'Missing refresh token');
        return;
      }

      this.logger.info('Token refresh attempt');

      // Use Firebase Auth REST API to refresh token
      const refreshResult = await this.refreshIdToken(refreshToken);

      if (!refreshResult.success) {
        this.logger.warn('Token refresh failed', { error: refreshResult.error });
        this.sendError(res, 401, 'Invalid refresh token', refreshResult.error);
        return;
      }

      this.logger.info('Token refresh successful');

      this.sendSuccess(res, {
        tokens: refreshResult.data
      }, 'Token refreshed successfully');

    } catch (error) {
      this.logger.error('Token refresh error', error as Error);
      next(error);
    }
  }

  /**
   * Send password reset email
   * POST /api/auth/reset-password
   */
  public async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email }: PasswordResetRequest = req.body;

      if (!email) {
        this.sendError(res, 400, 'Missing email address');
        return;
      }

      this.logger.info('Password reset requested', { email, ip: req.ip });

      // Check if user exists
      try {
        await getAuth().getUserByEmail(email);
      } catch (error) {
        // Don't reveal if email exists or not for security
        this.sendSuccess(res, {}, 'If the email exists, a password reset link has been sent.');
        return;
      }

      // Generate password reset link
      const resetLink = await getAuth().generatePasswordResetLink(email);

      this.logger.info('Password reset link generated', { email });

      // In production, send this via email service
      this.sendSuccess(res, {
        resetLink // Remove this in production
      }, 'Password reset link has been sent to your email.');

    } catch (error) {
      this.logger.error('Password reset error', error as Error, { 
        email: req.body.email 
      });
      next(error);
    }
  }

  /**
   * Verify email address
   * POST /api/auth/verify-email
   */
  public async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { oobCode }: VerifyEmailRequest = req.body;

      if (!oobCode) {
        this.sendError(res, 400, 'Missing verification code');
        return;
      }

      this.logger.info('Email verification attempt');

      // Note: applyActionCode is not available in Admin SDK
      // This would typically be handled on the frontend
      // For now, we'll return a message indicating the action should be performed client-side
      this.sendError(res, 501, 'Email verification must be performed on the client side');
      return;

      this.logger.info('Email verification successful');

      this.sendSuccess(res, {}, 'Email verified successfully');

    } catch (error) {
      this.logger.error('Email verification error', error as Error);
      
      if ((error as any).code === 'auth/invalid-action-code') {
        this.sendError(res, 400, 'Invalid or expired verification code');
        return;
      }
      
      next(error);
    }
  }

  /**
   * Change password for authenticated user
   * POST /api/auth/change-password
   */
  public async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { currentPassword, newPassword }: ChangePasswordRequest = req.body;

      if (!currentPassword || !newPassword) {
        this.sendError(res, 400, 'Missing current or new password');
        return;
      }

      if (newPassword.length < 6) {
        this.sendError(res, 400, 'New password must be at least 6 characters');
        return;
      }

      this.logger.info('Password change attempt', { userId });

      // Update password in Firebase Auth
      await getAuth().updateUser(userId, {
        password: newPassword
      });

      // Revoke all refresh tokens to force re-login
      await getAuth().revokeRefreshTokens(userId);

      this.logger.info('Password changed successfully', { userId });

      this.sendSuccess(res, {}, 'Password changed successfully. Please log in again.');

    } catch (error) {
      this.logger.error('Password change error', error as Error, { 
        userId: this.getUserId(req) 
      });
      next(error);
    }
  }

  /**
   * Get current user profile
   * GET /api/auth/me
   */
  public async getCurrentUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);

      // Get user from Firebase Auth
      const authUser = await getAuth().getUser(userId);

      // Get user profile from Firestore
      const userDoc = await this.db.collection('users').doc(userId).get();
      const userProfile = userDoc.data();

      this.sendSuccess(res, {
        user: {
          uid: authUser.uid,
          email: authUser.email,
          displayName: authUser.displayName,
          emailVerified: authUser.emailVerified,
          photoURL: authUser.photoURL,
          profile: userProfile ? {
            firstName: userProfile.firstName,
            lastName: userProfile.lastName,
            company: userProfile.company,
            phone: userProfile.phone,
            role: userProfile.role,
            preferences: userProfile.preferences,
            subscription: userProfile.subscription
          } : null
        }
      }, 'User profile retrieved successfully');

    } catch (error) {
      this.logger.error('Get current user error', error as Error, { 
        userId: this.getUserId(req) 
      });
      next(error);
    }
  }

  // Private helper methods

  /**
   * Sign in with email and password using Firebase REST API
   */
  private async signInWithEmailAndPassword(email: string, password: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            password,
            returnSecureToken: true
          })
        }
      );

      const data = await response.json() as any;

      if (!response.ok) {
        return {
          success: false,
          error: data.error?.message || 'Authentication failed'
        };
      }

      return {
        success: true,
        data: {
          idToken: data.idToken,
          refreshToken: data.refreshToken,
          localId: data.localId,
          expiresIn: data.expiresIn
        }
      };

    } catch (error) {
      return {
        success: false,
        error: 'Network error during authentication'
      };
    }
  }

  /**
   * Refresh ID token using Firebase REST API
   */
  private async refreshIdToken(refreshToken: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      const response = await fetch(
        `https://securetoken.googleapis.com/v1/token?key=${process.env.FIREBASE_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
          })
        }
      );

      const data = await response.json() as any;

      if (!response.ok) {
        return {
          success: false,
          error: data.error?.message || 'Token refresh failed'
        };
      }

      return {
        success: true,
        data: {
          idToken: data.id_token,
          refreshToken: data.refresh_token,
          expiresIn: data.expires_in
        }
      };

    } catch (error) {
      return {
        success: false,
        error: 'Network error during token refresh'
      };
    }
  }
}
