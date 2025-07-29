import 'reflect-metadata';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { Logger, ILogger } from '@/utils/logger';
import { config } from '@/config/environment';

// Initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  // Check if we have service account credentials
  const hasServiceAccountCredentials = 
    config.firebase.projectId && 
    config.firebase.privateKey && 
    config.firebase.clientEmail;

  console.log('🔍 Firebase credentials check (container):', {
    hasProjectId: !!config.firebase.projectId,
    hasPrivateKey: !!config.firebase.privateKey,
    hasClientEmail: !!config.firebase.clientEmail,
    projectId: config.firebase.projectId,
    clientEmail: config.firebase.clientEmail
  });

  if (hasServiceAccountCredentials) {
    console.log('🔧 Initializing Firebase Admin with Service Account credentials (container)...');
    initializeApp({
      credential: cert({
        projectId: config.firebase.projectId!,
        privateKey: config.firebase.privateKey!,
        clientEmail: config.firebase.clientEmail!,
      }),
      projectId: config.firebase.projectId,
    });
    console.log('✅ Firebase Admin initialized with Service Account (container)');
  } else {
    console.log('🔧 Initializing Firebase Admin with default credentials (container)...');
    initializeApp();
    console.log('✅ Firebase Admin initialized with default credentials (container)');
  }
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
