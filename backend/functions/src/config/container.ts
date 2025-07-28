import 'reflect-metadata';
import { Logger, ILogger } from '@/utils/logger';

// Container-Konfiguration
export const setupDependencyInjection = () => {
  // Logger als Singleton verwenden
  const logger = Logger.getInstance();
  
  // Weitere Services werden hier registriert wenn implementiert
  return { logger };
};

// Helper für Service-Auflösung
export const getLogger = (): ILogger => {
  return Logger.getInstance();
};

// Token Constants für Type Safety
export const TOKENS = {
  Logger: 'ILogger',
  FirebaseService: 'IFirebaseService',
  VectorStoreService: 'IVectorStoreService', 
  LLMService: 'ILLMService',
  AnalysisService: 'IAnalysisService'
} as const;
