// Service exports for centralized import management
export { StorageService } from './StorageService';
export { FirestoreService } from './FirestoreService';
export { FirebaseInitializer, ensureFirebaseInitialized } from './FirebaseInitializer';

// Re-export types for convenience
export type {
  DocumentMetadata,
  StorageQuotaInfo
} from './StorageService';

export type {
  PaginationOptions,
  SortOptions,
  DocumentFilters,
  PaginatedResult
} from './FirestoreService';
