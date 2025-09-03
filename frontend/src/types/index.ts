// TypeScript Definitions für LexForm AI

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'lawyer' | 'user';
  subscription: 'free' | 'pro' | 'enterprise';
  createdAt: Date;
  lastLoginAt: Date;
}

export interface Document {
  id: string;
  userId: string;
  name: string;
  type: DocumentType;
  size: number;
  uploadedAt: Date;
  status: DocumentStatus;
  language: 'de' | 'fr' | 'it' | 'en';
  metadata: DocumentMetadata;
}

export type DocumentType = 
  | 'contract'
  | 'gdpr_policy'
  | 'employment_contract'
  | 'terms_of_service'
  | 'privacy_policy'
  | 'other';

export type DocumentStatus = 
  | 'uploading'
  | 'processing'
  | 'analyzed'
  | 'error';

export interface DocumentMetadata {
  extractedText?: string;
  pageCount?: number;
  wordCount?: number;
  parties?: string[];
  keyDates?: Date[];
  legalReferences?: string[];
}

export interface Analysis {
  id: string;
  documentId: string;
  type: AnalysisType;
  status: AnalysisStatus;
  result: AnalysisResult;
  createdAt: Date;
  completedAt?: Date;
  confidence: number;
}

export type AnalysisType = 
  | 'gdpr_compliance'
  | 'contract_risk'
  | 'clause_analysis'
  | 'legal_summary'
  | 'compliance_check';

export type AnalysisStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed';

export interface AnalysisResult {
  summary: string;
  findings: Finding[];
  recommendations: string[];
  riskScore: number;
  complianceScore?: number;
}

export interface Finding {
  id: string;
  type: 'risk' | 'compliance' | 'missing' | 'unclear';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  location?: string;
  legalBasis?: string;
}


export interface WebSocketEvent {
  type: 'analysis_progress' | 'analysis_complete' | 'error';
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Swiss Obligation Law Analysis Types
export interface DocumentContext {
  documentType: string;
  businessDomain: string;
  keyTerms: string[];
  contextDescription: string;
  country: string;
  legalFramework: string;
}

export interface GeneratedQuery {
  query: string;
  context: string;
  relevanceScore?: number;
}

export interface SectionComplianceAnalysis {
  isCompliant: boolean;
  confidence: number;
  reasoning: string;
  violations: string[];
  recommendations: string[];
}

export interface SwissObligationSectionResult {
  sectionId: string;
  sectionContent: string;
  title?: string;
  queries: GeneratedQuery[];
  legalContext: any[];
  complianceAnalysis: SectionComplianceAnalysis;
  findings: Finding[];
  recommendations: string[];
  // Computed properties for display
  isCompliant: boolean;
  confidence: number;
  violationCount: number;
  recommendationCount: number;
  violations: string[];
}

export interface SwissObligationOverallCompliance {
  isCompliant: boolean;
  complianceScore: number;
  summary: string;
}

export interface SwissObligationAnalysisSummary {
  totalSections: number;
  compliantSections: number;
  totalViolations: number;
  totalRecommendations: number;
}

export interface SwissObligationAnalysisResult {
  analysisId: string;
  documentId: string;
  userId: string;
  documentContext?: DocumentContext;
  sections: SwissObligationSectionResult[];
  overallCompliance: SwissObligationOverallCompliance;
  summary?: SwissObligationAnalysisSummary;
  createdAt: string;
  completedAt?: string;
  lawyerStatus?: 'UNCHECKED' | 'CHECK_PENDING' | 'APPROVED' | 'DECLINE';
  lawyerComment?: string;
}
