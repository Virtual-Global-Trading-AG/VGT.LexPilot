// Services
export { EmbeddingService, DocumentType } from '../services/EmbeddingService';

// Factories
export { LLMFactory, LLMType } from '../factories/LLMFactory';

// Chains
export { ContractAnalysisChain, ContractAnalysisResult } from './ContractAnalysisChain';
export { GDPRComplianceChain, ComplianceReport } from './GDPRComplianceChain';
export { BaseLegalChain } from './BaseChain';

// Strategies
export { LegalDocumentSplitter, HierarchicalChunk, ChunkLevel } from '../strategies/LegalDocumentSplitter';
export { HybridRetriever, DocumentFilters, RetrievalOptions } from '../strategies/HybridRetriever';

// Utils
export { Logger } from '../utils/logger';
export { env } from '../config/environment';
