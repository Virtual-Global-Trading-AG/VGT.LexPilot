// TypeScript Definitions für LexPilot AI

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
  recommendations: Recommendation[];
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

export interface Recommendation {
  id: string;
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  actionRequired: boolean;
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
