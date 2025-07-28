// Repository Pattern Index
// Centralized export for all repositories

export { BaseRepository } from './BaseRepository';
export { DocumentRepository } from './DocumentRepository';
export { AnalysisRepository } from './AnalysisRepository';
export { UserRepository } from './UserRepository';

import { DocumentRepository } from './DocumentRepository';
import { AnalysisRepository } from './AnalysisRepository';
import { UserRepository } from './UserRepository';

// Repository Factory for Dependency Injection
export class RepositoryFactory {
  private static documentRepository: DocumentRepository;
  private static analysisRepository: AnalysisRepository;
  private static userRepository: UserRepository;

  static getDocumentRepository(): DocumentRepository {
    if (!this.documentRepository) {
      this.documentRepository = new DocumentRepository();
    }
    return this.documentRepository;
  }

  static getAnalysisRepository(): AnalysisRepository {
    if (!this.analysisRepository) {
      this.analysisRepository = new AnalysisRepository();
    }
    return this.analysisRepository;
  }

  static getUserRepository(): UserRepository {
    if (!this.userRepository) {
      this.userRepository = new UserRepository();
    }
    return this.userRepository;
  }
}
