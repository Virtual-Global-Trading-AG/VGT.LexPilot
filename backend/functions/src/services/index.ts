// Service Exports
export { StorageService } from './StorageService';
export { FirestoreService } from './FirestoreService';
export { EmbeddingService } from './EmbeddingService';
export { AnalysisService } from './AnalysisService';
export { TextExtractionService } from './TextExtractionService';
export { SwissObligationLawService } from './SwissObligationLawService';
export { JobQueueService } from './JobQueueService';
export { FirebaseInitializer, ensureFirebaseInitialized } from './FirebaseInitializer';

// Re-export types for convenience
export type {
  StorageQuotaInfo
} from './StorageService';

export type {
  PaginationOptions,
  SortOptions,
  DocumentFilters,
  PaginatedResult
} from './FirestoreService';

export type {
  ContractSection,
  GeneratedQuery,
  SectionAnalysisResult,
  SwissObligationAnalysisResult
} from './SwissObligationLawService';

export type {
  Job,
  JobProgress
} from './JobQueueService';
