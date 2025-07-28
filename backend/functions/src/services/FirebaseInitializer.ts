import * as admin from 'firebase-admin';
import { Logger } from '../utils/logger';
import { config } from '../config/environment';

/**
 * Firebase Services Initializer
 * Centralized initialization of Firebase Admin SDK
 */
export class FirebaseInitializer {
  private static logger = Logger.getInstance();
  private static initialized = false;

  /**
   * Initialize Firebase Admin SDK if not already initialized
   */
  public static async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.debug('Firebase Admin SDK already initialized');
      return;
    }

    try {
      // Check if Firebase Admin is already initialized
      if (admin.apps.length === 0) {
        // Initialize Firebase Admin
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: config.firebase.projectId,
            privateKey: config.firebase.privateKey.replace(/\\n/g, '\n'),
            clientEmail: config.firebase.clientEmail,
          }),
          storageBucket: `${config.firebase.projectId}.appspot.com`,
          databaseURL: `https://${config.firebase.projectId}-default-rtdb.firebaseio.com/`
        });

        this.logger.info('Firebase Admin SDK initialized successfully', {
          projectId: config.firebase.projectId,
          storageBucket: `${config.firebase.projectId}.appspot.com`
        });
      } else {
        this.logger.debug('Firebase Admin SDK already configured');
      }

      // Test connections
      await this.testConnections();
      
      this.initialized = true;
      this.logger.info('Firebase services initialization completed');
      
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK', error as Error);
      throw new Error('Firebase initialization failed');
    }
  }

  /**
   * Test Firebase service connections
   */
  private static async testConnections(): Promise<void> {
    try {
      // Test Firestore connection
      const db = admin.firestore();
      await db.doc('_health/test').get();
      this.logger.debug('Firestore connection test successful');

      // Test Storage connection
      const storage = admin.storage();
      const bucket = storage.bucket();
      await bucket.exists();
      this.logger.debug('Storage connection test successful');

    } catch (error) {
      this.logger.warn('Firebase connection test failed', { error: (error as Error).message });
      // Don't throw here - services might still work
    }
  }

  /**
   * Get Firebase Admin instance
   */
  public static getApp(): admin.app.App {
    if (!this.initialized) {
      throw new Error('Firebase not initialized. Call FirebaseInitializer.initialize() first.');
    }
    return admin.app();
  }

  /**
   * Get Firestore instance
   */
  public static getFirestore(): admin.firestore.Firestore {
    if (!this.initialized) {
      throw new Error('Firebase not initialized. Call FirebaseInitializer.initialize() first.');
    }
    return admin.firestore();
  }

  /**
   * Get Storage instance
   */
  public static getStorage(): admin.storage.Storage {
    if (!this.initialized) {
      throw new Error('Firebase not initialized. Call FirebaseInitializer.initialize() first.');
    }
    return admin.storage();
  }

  /**
   * Health check for Firebase services
   */
  public static async healthCheck(): Promise<{
    firebase: boolean;
    firestore: boolean;
    storage: boolean;
  }> {
    const health = {
      firebase: false,
      firestore: false,
      storage: false
    };

    try {
      // Check Firebase Admin
      if (admin.apps.length > 0) {
        health.firebase = true;
      }

      // Check Firestore
      const db = admin.firestore();
      await db.doc('_health/check').get();
      health.firestore = true;

      // Check Storage
      const storage = admin.storage();
      const bucket = storage.bucket();
      await bucket.exists();
      health.storage = true;

    } catch (error) {
      this.logger.error('Firebase health check failed', error as Error);
    }

    return health;
  }
}

/**
 * Express middleware to ensure Firebase is initialized
 */
export function ensureFirebaseInitialized() {
  return async (req: any, res: any, next: any) => {
    try {
      await FirebaseInitializer.initialize();
      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'FIREBASE_INIT_FAILED',
          message: 'Firebase services unavailable'
        }
      });
    }
  };
}
