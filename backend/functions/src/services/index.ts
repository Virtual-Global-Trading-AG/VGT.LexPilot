// Service Exports
export { StorageService } from './StorageService';
export { FirestoreService } from './FirestoreService';
export { TextExtractionService } from './TextExtractionService';
export { AnalyseLawService } from './AnalyseLawService';
export { DataProtectionService } from './DataProtectionService';
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
} from './AnalyseLawService';

export type {
  DataProtectionCheckRequest,
  DataProtectionReference,
  DataProtectionAnalysis,
  DataProtectionCheckResult
} from './DataProtectionService';

export type {
  Job,
  JobProgress
} from './JobQueueService';
