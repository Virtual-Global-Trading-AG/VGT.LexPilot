import { Logger } from '../utils/logger';
import { WebSocketEvent, EventType } from '../models';

/**
 * Observer Pattern Interface for Analysis Events
 */
export interface IAnalysisObserver {
  update(event: AnalysisEvent): void;
  getId(): string;
}

/**
 * Analysis Event Interface
 */
export interface AnalysisEvent {
  id: string;
  type: EventType;
  userId: string;
  documentId?: string;
  analysisId?: string;
  data: any;
  timestamp: Date;
}

/**
 * Subject Interface for Observer Pattern
 */
export interface IAnalysisSubject {
  attach(observer: IAnalysisObserver): void;
  detach(observer: IAnalysisObserver): void;
  notify(event: AnalysisEvent): void;
}

/**
 * Analysis Subject - Manages observers and notifications
 */
export class AnalysisSubject implements IAnalysisSubject {
  private observers: Map<string, IAnalysisObserver> = new Map();
  private logger = Logger.getInstance();

  attach(observer: IAnalysisObserver): void {
    const observerId = observer.getId();
    this.observers.set(observerId, observer);
    
    this.logger.debug('Observer attached', {
      observerId,
      totalObservers: this.observers.size
    });
  }

  detach(observer: IAnalysisObserver): void {
    const observerId = observer.getId();
    const removed = this.observers.delete(observerId);
    
    this.logger.debug('Observer detached', {
      observerId,
      removed,
      totalObservers: this.observers.size
    });
  }

  notify(event: AnalysisEvent): void {
    this.logger.info('Notifying observers', {
      eventType: event.type,
      observerCount: this.observers.size,
      userId: event.userId
    });

    let notifiedCount = 0;
    let errorCount = 0;

    for (const [observerId, observer] of this.observers) {
      try {
        observer.update(event);
        notifiedCount++;
      } catch (error) {
        errorCount++;
        this.logger.error('Error notifying observer', error as Error, {
          observerId,
          eventType: event.type
        });
      }
    }

    this.logger.info('Observer notification completed', {
      eventType: event.type,
      notifiedCount,
      errorCount,
      totalObservers: this.observers.size
    });
  }

  getObserverCount(): number {
    return this.observers.size;
  }

  hasObserver(observerId: string): boolean {
    return this.observers.has(observerId);
  }
}

/**
 * WebSocket Observer - Sends updates via WebSocket
 */
export class WebSocketObserver implements IAnalysisObserver {
  private id: string;
  private userId: string;
  private socket: any; // Will be typed properly with socket.io
  private logger = Logger.getInstance();

  constructor(id: string, userId: string, socket: any) {
    this.id = id;
    this.userId = userId;
    this.socket = socket;
  }

  getId(): string {
    return this.id;
  }

  getUserId(): string {
    return this.userId;
  }

  update(event: AnalysisEvent): void {
    try {
      // Only send events relevant to this user
      if (event.userId !== this.userId) {
        return;
      }

      const wsEvent: WebSocketEvent = {
        type: event.type,
        userId: event.userId,
        data: {
          ...event.data,
          eventId: event.id,
          documentId: event.documentId,
          analysisId: event.analysisId
        },
        timestamp: event.timestamp
      };

      // Send event via WebSocket
      this.socket.emit('analysisUpdate', wsEvent);

      this.logger.debug('WebSocket event sent', {
        observerId: this.id,
        userId: this.userId,
        eventType: event.type
      });
    } catch (error) {
      this.logger.error('Failed to send WebSocket event', error as Error, {
        observerId: this.id,
        userId: this.userId,
        eventType: event.type
      });
    }
  }

  isConnected(): boolean {
    return this.socket && this.socket.connected;
  }
}

/**
 * Database Observer - Stores events in database
 */
export class DatabaseObserver implements IAnalysisObserver {
  private id: string;
  private logger = Logger.getInstance();

  constructor(id: string = 'database-observer') {
    this.id = id;
  }

  getId(): string {
    return this.id;
  }

  update(event: AnalysisEvent): void {
    try {
      // Store event in Firestore
      this.storeEvent(event);

      this.logger.debug('Database event stored', {
        observerId: this.id,
        eventType: event.type,
        userId: event.userId
      });
    } catch (error) {
      this.logger.error('Failed to store database event', error as Error, {
        observerId: this.id,
        eventType: event.type,
        userId: event.userId
      });
    }
  }

  private async storeEvent(event: AnalysisEvent): Promise<void> {
    // TODO: Implement Firestore storage
    // const eventDoc = {
    //   id: event.id,
    //   type: event.type,
    //   userId: event.userId,
    //   documentId: event.documentId,
    //   analysisId: event.analysisId,
    //   data: event.data,
    //   timestamp: event.timestamp
    // };
    // 
    // await firestore.collection('events').add(eventDoc);
    
    this.logger.debug('Event would be stored', { eventId: event.id });
  }
}

/**
 * Email Observer - Sends notifications via email
 */
export class EmailObserver implements IAnalysisObserver {
  private id: string;
  private emailService: any; // Will be typed properly
  private logger = Logger.getInstance();

  constructor(id: string, emailService: any) {
    this.id = id;
    this.emailService = emailService;
  }

  getId(): string {
    return this.id;
  }

  update(event: AnalysisEvent): void {
    try {
      // Only send emails for specific event types
      if (this.shouldSendEmail(event.type)) {
        this.sendEmailNotification(event);
      }

      this.logger.debug('Email notification processed', {
        observerId: this.id,
        eventType: event.type,
        shouldSend: this.shouldSendEmail(event.type)
      });
    } catch (error) {
      this.logger.error('Failed to process email notification', error as Error, {
        observerId: this.id,
        eventType: event.type,
        userId: event.userId
      });
    }
  }

  private shouldSendEmail(eventType: EventType): boolean {
    // Send emails for completed and failed analyses
    return [
      EventType.ANALYSIS_COMPLETED,
      EventType.ANALYSIS_FAILED
    ].includes(eventType);
  }

  private async sendEmailNotification(event: AnalysisEvent): Promise<void> {
    // TODO: Implement email sending
    // const emailData = {
    //   to: event.userId, // This should be the user's email
    //   subject: this.getEmailSubject(event.type),
    //   template: this.getEmailTemplate(event.type),
    //   data: event.data
    // };
    // 
    // await this.emailService.send(emailData);
    
    this.logger.debug('Email would be sent', { 
      eventId: event.id,
      eventType: event.type
    });
  }

  private getEmailSubject(eventType: EventType): string {
    switch (eventType) {
      case EventType.ANALYSIS_COMPLETED:
        return 'LexForm: Analyse abgeschlossen';
      case EventType.ANALYSIS_FAILED:
        return 'LexForm Analyse fehlgeschlagen';
      default:
        return 'LexForm: Benachrichtigung';
    }
  }

  private getEmailTemplate(eventType: EventType): string {
    switch (eventType) {
      case EventType.ANALYSIS_COMPLETED:
        return 'analysis-completed';
      case EventType.ANALYSIS_FAILED:
        return 'analysis-failed';
      default:
        return 'generic-notification';
    }
  }
}

/**
 * Event Builder for creating structured events
 */
export class AnalysisEventBuilder {
  private event: Partial<AnalysisEvent> = {};

  static create(): AnalysisEventBuilder {
    return new AnalysisEventBuilder();
  }

  withId(id: string): this {
    this.event.id = id;
    return this;
  }

  withType(type: EventType): this {
    this.event.type = type;
    return this;
  }

  withUser(userId: string): this {
    this.event.userId = userId;
    return this;
  }

  withDocument(documentId: string): this {
    this.event.documentId = documentId;
    return this;
  }

  withAnalysis(analysisId: string): this {
    this.event.analysisId = analysisId;
    return this;
  }

  withData(data: any): this {
    this.event.data = data;
    return this;
  }

  build(): AnalysisEvent {
    if (!this.event.id || !this.event.type || !this.event.userId) {
      throw new Error('AnalysisEvent must have id, type, and userId');
    }

    return {
      ...this.event,
      timestamp: new Date()
    } as AnalysisEvent;
  }
}

/**
 * Singleton Event Manager for global event handling
 */
export class EventManager {
  private static instance: EventManager;
  private subject: AnalysisSubject;
  private logger = Logger.getInstance();

  private constructor() {
    this.subject = new AnalysisSubject();
  }

  static getInstance(): EventManager {
    if (!EventManager.instance) {
      EventManager.instance = new EventManager();
    }
    return EventManager.instance;
  }

  addObserver(observer: IAnalysisObserver): void {
    this.subject.attach(observer);
    this.logger.info('Observer added to EventManager', {
      observerId: observer.getId(),
      totalObservers: this.subject.getObserverCount()
    });
  }

  removeObserver(observer: IAnalysisObserver): void {
    this.subject.detach(observer);
    this.logger.info('Observer removed from EventManager', {
      observerId: observer.getId(),
      totalObservers: this.subject.getObserverCount()
    });
  }

  emitEvent(event: AnalysisEvent): void {
    this.logger.info('Event emitted', {
      eventId: event.id,
      eventType: event.type,
      userId: event.userId
    });

    this.subject.notify(event);
  }

  getObserverCount(): number {
    return this.subject.getObserverCount();
  }
}

/**
 * Convenience functions for common events
 */
export class EventEmitters {
  private static eventManager = EventManager.getInstance();

  static emitAnalysisStarted(
    analysisId: string,
    userId: string,
    documentId: string,
    analysisType: string
  ): void {
    const event = AnalysisEventBuilder.create()
      .withId(`analysis-started-${analysisId}`)
      .withType(EventType.ANALYSIS_STARTED)
      .withUser(userId)
      .withDocument(documentId)
      .withAnalysis(analysisId)
      .withData({ analysisType })
      .build();

    this.eventManager.emitEvent(event);
  }

  static emitAnalysisProgress(
    analysisId: string,
    userId: string,
    documentId: string,
    progress: number,
    step: string
  ): void {
    const event = AnalysisEventBuilder.create()
      .withId(`analysis-progress-${analysisId}-${Date.now()}`)
      .withType(EventType.ANALYSIS_PROGRESS)
      .withUser(userId)
      .withDocument(documentId)
      .withAnalysis(analysisId)
      .withData({ progress, step })
      .build();

    this.eventManager.emitEvent(event);
  }

  static emitAnalysisCompleted(
    analysisId: string,
    userId: string,
    documentId: string,
    result: any
  ): void {
    const event = AnalysisEventBuilder.create()
      .withId(`analysis-completed-${analysisId}`)
      .withType(EventType.ANALYSIS_COMPLETED)
      .withUser(userId)
      .withDocument(documentId)
      .withAnalysis(analysisId)
      .withData({ result })
      .build();

    this.eventManager.emitEvent(event);
  }

  static emitAnalysisFailed(
    analysisId: string,
    userId: string,
    documentId: string,
    error: string
  ): void {
    const event = AnalysisEventBuilder.create()
      .withId(`analysis-failed-${analysisId}`)
      .withType(EventType.ANALYSIS_FAILED)
      .withUser(userId)
      .withDocument(documentId)
      .withAnalysis(analysisId)
      .withData({ error })
      .build();

    this.eventManager.emitEvent(event);
  }

  static emitDocumentProcessed(
    documentId: string,
    userId: string,
    processingResult: any
  ): void {
    const event = AnalysisEventBuilder.create()
      .withId(`document-processed-${documentId}`)
      .withType(EventType.DOCUMENT_PROCESSED)
      .withUser(userId)
      .withDocument(documentId)
      .withData({ processingResult })
      .build();

    this.eventManager.emitEvent(event);
  }
}
