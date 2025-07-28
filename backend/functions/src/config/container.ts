import 'reflect-metadata';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { Logger, ILogger } from '@/utils/logger';

// Initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  initializeApp();
}

// Firebase Services
export const firestore: Firestore = getFirestore();

// Container-Konfiguration
export const setupDependencyInjection = () => {
  // Logger als Singleton verwenden
  const logger = Logger.getInstance();
  
  // Weitere Services werden hier registriert wenn implementiert
  return { logger, firestore };
};

// Helper für Service-Auflösung
export const getLogger = (): ILogger => {
  return Logger.getInstance();
};

export const getFirestoreInstance = (): Firestore => {
  return firestore;
};

// Token Constants für Type Safety
export const TOKENS = {
  Logger: 'ILogger',
  Firestore: 'IFirestore',
  FirebaseService: 'IFirebaseService',
  VectorStoreService: 'IVectorStoreService', 
  LLMService: 'ILLMService',
  AnalysisService: 'IAnalysisService'
} as const;
