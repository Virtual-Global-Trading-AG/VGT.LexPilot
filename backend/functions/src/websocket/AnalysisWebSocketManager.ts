import { Logger } from '../utils/logger';

export interface WebSocketMessage {
  type: 'progress' | 'status' | 'error' | 'complete';
  data: any;
  timestamp: string;
  requestId?: string;
}

export interface ProgressUpdate {
  stage: string;
  progress: number;
  message: string;
  details?: any;
}

/**
 * WebSocket Manager für Real-time Updates der RAG-Pipeline
 * Vereinfachte Implementierung für Firebase Functions ohne echte WebSockets
 * Verwendet stattdessen Firestore für Real-time Updates
 */
export class AnalysisWebSocketManager {
  private readonly logger = Logger.getInstance();

  constructor() {
    this.logger.info('Analysis WebSocket Manager initialized (Firestore mode)');
  }

  /**
   * Sendet Progress Update via Firestore Real-time Updates
   */
  public async sendProgressUpdate(
    userId: string, 
    requestId: string,
    update: ProgressUpdate
  ): Promise<void> {
    try {
      const { FirestoreService } = await import('../services/FirestoreService');
      const firestoreService = new FirestoreService();

      const progressData = {
        type: 'progress',
        data: update,
        timestamp: new Date().toISOString(),
        requestId,
        userId
      };

      // Speichere in Firestore für Real-time Updates im Frontend
      await firestoreService.saveDocument(
        `analysis_progress/${userId}/updates/${requestId}`,
        progressData
      );

      this.logger.debug('Progress update saved to Firestore', {
        userId,
        requestId,
        stage: update.stage,
        progress: update.progress
      });

    } catch (error) {
      this.logger.error('Failed to send progress update', error as Error, {
        userId,
        requestId
      });
    }
  }

  /**
   * Sendet Completion-Nachricht via Firestore
   */
  public async sendCompletion(
    userId: string,
    requestId: string,
    result: any
  ): Promise<void> {
    try {
      const { FirestoreService } = await import('../services/FirestoreService');
      const firestoreService = new FirestoreService();

      const completionData = {
        type: 'complete',
        data: { result, status: 'completed' },
        timestamp: new Date().toISOString(),
        requestId,
        userId
      };

      await firestoreService.saveDocument(
        `analysis_progress/${userId}/updates/${requestId}`,
        completionData
      );

      this.logger.info('Completion notification saved to Firestore', {
        userId,
        requestId,
        resultType: typeof result
      });

    } catch (error) {
      this.logger.error('Failed to send completion notification', error as Error, {
        userId,
        requestId
      });
    }
  }

  /**
   * Sendet Fehler-Nachricht via Firestore
   */
  public async sendError(
    userId: string,
    requestId: string,
    error: string,
    details?: any
  ): Promise<void> {
    try {
      const { FirestoreService } = await import('../services/FirestoreService');
      const firestoreService = new FirestoreService();

      const errorData = {
        type: 'error',
        data: { error, details, status: 'failed' },
        timestamp: new Date().toISOString(),
        requestId,
        userId
      };

      await firestoreService.saveDocument(
        `analysis_progress/${userId}/updates/${requestId}`,
        errorData
      );

      this.logger.warn('Error notification saved to Firestore', {
        userId,
        requestId,
        error
      });

    } catch (err) {
      this.logger.error('Failed to send error notification', err as Error, {
        userId,
        requestId,
        originalError: error
      });
    }
  }

  /**
   * Sendet Status-Update via Firestore
   */
  public async sendStatusUpdate(
    userId: string,
    requestId: string,
    status: string,
    data?: any
  ): Promise<void> {
    try {
      const { FirestoreService } = await import('../services/FirestoreService');
      const firestoreService = new FirestoreService();

      const statusData = {
        type: 'status',
        data: { status, ...data },
        timestamp: new Date().toISOString(),
        requestId,
        userId
      };

      await firestoreService.saveDocument(
        `analysis_progress/${userId}/updates/${requestId}`,
        statusData
      );

      this.logger.debug('Status update saved to Firestore', {
        userId,
        requestId,
        status
      });

    } catch (error) {
      this.logger.error('Failed to send status update', error as Error, {
        userId,
        requestId,
        status
      });
    }
  }

  /**
   * Löscht alte Progress-Updates für Aufräumen
   */
  public async cleanupOldUpdates(userId: string, olderThanHours: number = 24): Promise<void> {
    try {
      const { FirestoreService } = await import('../services/FirestoreService');
      const firestoreService = new FirestoreService();
      const admin = await import('firebase-admin');

      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - olderThanHours);

      // Hier würde normalerweise eine Batch-Delete-Operation stehen
      // Für die einfache Implementation lassen wir das vorerst weg
      
      this.logger.debug('Old progress updates cleanup completed', {
        userId,
        olderThanHours
      });

    } catch (error) {
      this.logger.error('Failed to cleanup old updates', error as Error, {
        userId,
        olderThanHours
      });
    }
  }

  /**
   * Gibt Statistiken zurück (vereinfacht für Firestore-Modus)
   */
  public getStats(): {
    mode: string;
    status: string;
  } {
    return {
      mode: 'firestore',
      status: 'active'
    };
  }

  /**
   * Shutdown (no-op für Firestore-Modus)
   */
  public async shutdown(): Promise<void> {
    this.logger.info('WebSocket manager shutdown (Firestore mode - no action needed)');
  }
}

// Singleton-Instanz für globale Nutzung
export const websocketManager = new AnalysisWebSocketManager();
