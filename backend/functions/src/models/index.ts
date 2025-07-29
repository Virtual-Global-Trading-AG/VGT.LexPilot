// Base Types
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

// User Types
export interface User extends BaseEntity {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: UserRole;
  subscription: SubscriptionTier;
  lastLogin?: Date;
  settings: UserSettings;
  statistics: UserStatistics;
}

export enum UserRole {
  USER = 'user',
  PREMIUM = 'premium', 
  ADMIN = 'admin',
  LAWYER = 'lawyer'
}

export enum SubscriptionTier {
  FREE = 'free',
  BASIC = 'basic',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise'
}

export interface UserSettings {
  language: 'de' | 'fr' | 'it' | 'en';
  timezone: string;
  notifications: NotificationSettings;
  privacy: PrivacySettings;
  billing: BillingSettings;
}

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  analysisComplete: boolean;
  weeklyReport: boolean;
  securityAlerts: boolean;
}

export interface PrivacySettings {
  dataRetention: number; // Tage
  anonymizeData: boolean;
  shareUsageStats: boolean;
}

export interface BillingSettings {
  monthlyBudget: number;
  warningThreshold: number;
  autoTopup: boolean;
}

export interface UserStatistics {
  documentsAnalyzed: number;
  totalCost: number;
  monthlyUsage: MonthlyUsage[];
  averageConfidence: number;
  lastActivity: Date;
}

export interface MonthlyUsage {
  month: string; // YYYY-MM
  documentsCount: number;
  cost: number;
  tokensUsed: number;
}

// Document Types
export interface Document extends BaseEntity {
  userId: string;
  name: string;
  originalName: string;
  type: DocumentType;
  mimeType: string;
  size: number;
  language: 'de' | 'fr' | 'it' | 'en' | 'auto';
  status: DocumentStatus;
  content: DocumentContent;
  metadata: DocumentMetadata;
  storageUrl: string;
  extractedText?: string;
  processingError?: string;
}

export enum DocumentType {
  CONTRACT = 'contract',
  TERMS_CONDITIONS = 'terms_conditions',
  PRIVACY_POLICY = 'privacy_policy',
  EMPLOYMENT_CONTRACT = 'employment_contract',
  NDA = 'nda',
  GDPR_ASSESSMENT = 'gdpr_assessment',
  LEGAL_OPINION = 'legal_opinion',
  REGULATION = 'regulation',
  OTHER = 'other'
}

export enum DocumentStatus {
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  ANALYZED = 'analyzed',
  ERROR = 'error',
  ARCHIVED = 'archived'
}

export interface DocumentContent {
  rawText: string;
  structuredData?: any;
  extractedEntities?: ExtractedEntity[];
  legalReferences?: LegalReference[];
}

export interface ExtractedEntity {
  type: EntityType;
  value: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
}

export enum EntityType {
  PERSON = 'person',
  ORGANIZATION = 'organization',
  DATE = 'date',
  AMOUNT = 'amount',
  LEGAL_ARTICLE = 'legal_article',
  CONTRACT_CLAUSE = 'contract_clause',
  JURISDICTION = 'jurisdiction'
}

export interface LegalReference {
  law: string;
  article: string;
  description: string;
  url?: string;
  jurisdiction: string;
}

export interface DocumentMetadata {
  tags: string[];
  category: string;
  jurisdiction: string;
  relevantLaws: string[];
  contractParties?: ContractParty[];
  keyDates?: KeyDate[];
  riskLevel: RiskLevel;
}

export interface ContractParty {
  name: string;
  type: 'natural_person' | 'legal_entity';
  role: string;
  address?: string;
  identifiers?: Record<string, string>;
}

export interface KeyDate {
  type: 'start' | 'end' | 'deadline' | 'notice_period' | 'renewal';
  date: Date;
  description: string;
  critical: boolean;
}

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium', 
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Analysis Types
export interface Analysis extends BaseEntity {
  documentId: string;
  userId: string;
  type: AnalysisType;
  status: AnalysisStatus;
  result: AnalysisResult;
  confidence: number;
  processingTime: number;
  cost: number;
  tokensUsed: number;
  model: string;
}

export enum AnalysisType {
  GDPR_COMPLIANCE = 'gdpr_compliance',
  CONTRACT_RISK = 'contract_risk',
  LEGAL_REVIEW = 'legal_review',
  TERMS_ANALYSIS = 'terms_analysis',
  CLAUSE_EXTRACTION = 'clause_extraction',
  DEADLINE_TRACKING = 'deadline_tracking',
  COMPLIANCE_CHECK = 'compliance_check'
}

export enum AnalysisStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface AnalysisResult {
  summary: string;
  findings: Finding[];
  recommendations: Recommendation[];
  riskScore: number;
  complianceScore?: number;
  detailedReport: any; // Type depends on analysis type
}

export interface Finding {
  id: string;
  type: FindingType;
  severity: FindingSeverity;
  title: string;
  description: string;
  location: TextLocation;
  evidence: string[];
  legalBasis?: string[];
}

export enum FindingType {
  MISSING_CLAUSE = 'missing_clause',
  UNCLEAR_CLAUSE = 'unclear_clause',
  LEGAL_VIOLATION = 'legal_violation',
  RISK_FACTOR = 'risk_factor',
  COMPLIANCE_ISSUE = 'compliance_issue',
  DEADLINE = 'deadline',
  AMBIGUITY = 'ambiguity'
}

export enum FindingSeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface TextLocation {
  startIndex: number;
  endIndex: number;
  page?: number;
  section?: string;
}

export interface Recommendation {
  id: string;
  type: RecommendationType;
  priority: Priority;
  title: string;
  description: string;
  suggestedAction: string;
  templateClause?: string;
  legalReference?: LegalReference;
  estimatedEffort: string;
}

export enum RecommendationType {
  ADD_CLAUSE = 'add_clause',
  MODIFY_CLAUSE = 'modify_clause',
  REMOVE_CLAUSE = 'remove_clause',
  CLARIFY_TERMS = 'clarify_terms',
  ADD_PROTECTION = 'add_protection',
  COMPLIANCE_UPDATE = 'compliance_update',
  RISK_MITIGATION = 'risk_mitigation'
}

export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

// Legal Database Types
export interface LegalDocument extends BaseEntity {
  title: string;
  type: LegalDocumentType;
  jurisdiction: string;
  language: string;
  content: string;
  metadata: LegalDocumentMetadata;
  url?: string;
  isActive: boolean;
}

export enum LegalDocumentType {
  LAW = 'law',
  REGULATION = 'regulation',
  ORDINANCE = 'ordinance',
  CASE_LAW = 'case_law',
  COMMENTARY = 'commentary',
  GUIDANCE = 'guidance'
}

export interface LegalDocumentMetadata {
  lawNumber?: string;
  articles: string[];
  keywords: string[];
  subjects: string[];
  enactmentDate?: Date;
  lastAmended?: Date;
  source: string;
}

// Usage and Billing Types
export interface UsageRecord extends BaseEntity {
  userId: string;
  action: UsageAction;
  metadata: any;
  cost: number;
  tokensUsed?: number;
  model?: string;
  timestamp: Date;
}

export enum UsageAction {
  DOCUMENT_UPLOAD = 'document_upload',
  TEXT_EXTRACTION = 'text_extraction',
  EMBEDDING_GENERATION = 'embedding_generation',
  GPT4_ANALYSIS = 'gpt4_analysis',
  GPT35_GENERATION = 'gpt35_generation',
  VECTOR_SEARCH = 'vector_search',
  DOCUMENT_EXPORT = 'document_export'
}

// WebSocket Event Types
export interface WebSocketEvent {
  type: EventType;
  userId: string;
  data: any;
  timestamp: Date;
}

export enum EventType {
  ANALYSIS_STARTED = 'analysis_started',
  ANALYSIS_PROGRESS = 'analysis_progress',
  ANALYSIS_COMPLETED = 'analysis_completed',
  ANALYSIS_FAILED = 'analysis_failed',
  DOCUMENT_PROCESSED = 'document_processed',
  QUOTA_WARNING = 'quota_warning',
  SYSTEM_NOTIFICATION = 'system_notification'
}

// Error Types
export interface ApiError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
  requestId?: string;
}
