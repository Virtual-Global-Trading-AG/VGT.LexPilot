// React hooks für die RAG-API Endpunkte
import { useState, useCallback } from 'react';
import apiClient from '../api/client';
import AuthService from '../api/auth';
import { useAuthStore } from '../stores/authStore';

export interface ContractAnalysisRequest {
  legalArea?: string;
  jurisdiction?: string;
  language?: string;
}

export interface DSGVOCheckRequest {
  text: string;
  saveResults?: boolean;
  language?: string;
}

// Neues Interface für den vollständigen DSGVO Check
export interface CompleteDSGVOCheckRequest {
  question: string;
  language?: string;
  includeContext?: boolean;
  maxSources?: number;
}

export interface SimilaritySearchRequest {
  text: string;
  indexName?: string;
  namespace?: string;
  topK?: number;
}

export interface AnalysisResult {
  legalContext: {
    sources: any[];
    relevanceScores: number[];
  };
  complianceScore?: number;
  status?: string;
  findings?: any[];
}

export function useDocumentAnalysis() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);

  const analyzeContractWithRAG = useCallback(async (
    documentId: string,
    request: ContractAnalysisRequest
  ): Promise<AnalysisResult | null> => {
    if (!isAuthenticated) {
      setError('Not authenticated');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post<AnalysisResult>(
        `/documents/${documentId}/analyze-rag`,
        request
      );

      if (response.success && response.data) {
        return response.data;
      } else {
        setError(response.error || 'Analysis failed');
        return null;
      }
    } catch (err) {
      setError('Network error during analysis');
      return null;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const checkDSGVOCompliance = useCallback(async (
    request: DSGVOCheckRequest
  ): Promise<AnalysisResult | null> => {
    if (!isAuthenticated) {
      setError('Not authenticated');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post<AnalysisResult>(
        '/documents/dsgvo-check',
        request
      );

      if (response.success && response.data) {
        return response.data;
      } else {
        setError(response.error || 'DSGVO check failed');
        return null;
      }
    } catch (err) {
      setError('Network error during DSGVO check');
      return null;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Neue Methode für den vollständigen DSGVO Check
  const completeDSGVOCheck = useCallback(async (
    request: CompleteDSGVOCheckRequest
  ): Promise<any | null> => {
    if (!isAuthenticated) {
      setError('Authentifizierung erforderlich');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post<any>(
        '/documents/dsgvo-check-complete',
        request
      );

      if (response.success && response.data) {
        return response.data;
      } else {
        setError(response.error || 'Vollständiger DSGVO-Check fehlgeschlagen');
        return null;
      }
    } catch (err) {
      setError('Netzwerkfehler bei der DSGVO-Analyse');
      return null;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const textSimilaritySearch = useCallback(async (
    request: SimilaritySearchRequest
  ): Promise<any | null> => {
    if (!isAuthenticated) {
      setError('Not authenticated');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post<any>(
        '/documents/similarity-search',
        request
      );

      console.log(response);
      if (response.success && response.data) {
        return response.data;
      } else {
        setError(response.error || 'Similarity search failed');
        return null;
      }
    } catch (err) {
      setError('Network error during similarity search');
      return null;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  return {
    analyzeContractWithRAG,
    checkDSGVOCompliance,
    completeDSGVOCheck, // Neue Methode hinzugefügt
    textSimilaritySearch,
    loading,
    error,
    clearError: () => setError(null)
  };
}
export function useDocumentUpload() {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);

  const uploadDocument = useCallback(async (
    file: File,
    metadata?: {
      title?: string;
      description?: string;
      category?: string;
    }
  ): Promise<{ documentId: string; uploadUrl: string } | null> => {
    if (!isAuthenticated) {
      setError('Not authenticated');
      return null;
    }

    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      // First, get upload URL
      const uploadResponse = await apiClient.post<{
        documentId: string;
        uploadUrl: string;
      }>('/documents', {
        fileName: file.name,
        contentType: file.type,
        size: file.size,
        metadata
      });

      if (!uploadResponse.success || !uploadResponse.data) {
        setError(uploadResponse.error || 'Failed to get upload URL');
        return null;
      }

      const { documentId, uploadUrl } = uploadResponse.data;

      // Upload file with progress
      const uploadResult = await apiClient.uploadFile(
        uploadUrl,
        file,
        (progress) => setUploadProgress(progress)
      );

      if (uploadResult.success) {
        return { documentId, uploadUrl };
      } else {
        setError(uploadResult.error || 'Upload failed');
        return null;
      }
    } catch (err) {
      setError('Network error during upload');
      return null;
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [isAuthenticated]);

  const uploadDocumentDirect = useCallback(async (
    file: File,
    metadata?: {
      category?: 'contract' | 'nda' | 'other';
      description?: string;
      tags?: string[];
      anonymizedKeywords?: Array<{keyword: string, replaceWith: string}>;
    }
  ): Promise<{ documentId: string; fileName: string; size: number } | null> => {
    if (!isAuthenticated) {
      setError('Not authenticated');
      return null;
    }

    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      // Convert file to base64
      const base64Content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove the data URL prefix (e.g., "data:application/pdf;base64,")
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Simulate progress for base64 conversion
      setUploadProgress(50);

      // Upload directly with base64 content
      const uploadResult = await apiClient.uploadFileDirect(
        file.name,
        file.type,
        base64Content,
        metadata
      );

      setUploadProgress(100);

      if (uploadResult.success && uploadResult.data) {
        return uploadResult.data as { documentId: string; fileName: string; size: number };
      } else {
        setError(uploadResult.error || 'Direct upload failed');
        return null;
      }
    } catch (err) {
      setError('Network error during direct upload');
      return null;
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [isAuthenticated]);

  return {
    uploadDocument,
    uploadDocumentDirect,
    uploading,
    uploadProgress,
    error,
    clearError: () => setError(null)
  };
}

export function useDocuments() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const { isAuthenticated } = useAuthStore(state => state);

  const getDocuments = useCallback(async (params?: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    status?: string;
    category?: string;
  }): Promise<boolean> => {
    if (!isAuthenticated) {
      setError('Authentication required');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams();
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
      if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);
      if (params?.status) queryParams.append('status', params.status);
      if (params?.category) queryParams.append('category', params.category);

      const endpoint = `/documents${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await apiClient.get(endpoint);

      if (response.success && response.data) {
        setDocuments(response.data.documents || []);
        setPagination(response.data.pagination || null);
        return true;
      } else {
        setError(response.error || 'Failed to fetch documents');
        return false;
      }
    } catch (err) {
      setError('Network error while fetching documents');
      return false;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const deleteDocument = useCallback(async (documentId: string): Promise<boolean> => {
    if (!isAuthenticated) {
      setError('Authentication required');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.delete(`/documents/${documentId}`);

      if (response.success) {
        // Remove the deleted document from the local state
        setDocuments(prevDocs => prevDocs.filter(doc => doc.id !== documentId));
        return true;
      } else {
        setError(response.error || 'Failed to delete document');
        return false;
      }
    } catch (err) {
      setError('Network error while deleting document');
      return false;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const getDocumentText = useCallback(async (documentId: string): Promise<{
    success: boolean;
    data?: {
      documentId: string;
      fileName: string;
      contentType: string;
      size: number;
      text: string;
      textLength: number;
      extractedAt: string;
    };
    error?: string;
  }> => {
    if (!isAuthenticated) {
      setError('Authentication required');
      return { success: false, error: 'Authentication required' };
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get(`/documents/${documentId}/text`);

      if (response.success && response.data) {
        return { success: true, data: response.data };
      } else {
        const errorMsg = response.error || 'Failed to extract document text';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMsg = 'Network error while extracting document text';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const analyzeSwissObligationLaw = useCallback(async (documentId: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> => {
    if (!isAuthenticated) {
      setError('Authentication required');
      return { success: false, error: 'Authentication required' };
    }

    setError(null);

    try {
      const response = await apiClient.post(`/documents/${documentId}/analyze-swiss-obligation-law`);

      if (response.success && response.data) {
        return { success: true, data: response.data };
      } else {
        const errorMsg = response.error || 'Failed to start Swiss obligation law analysis';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMsg = 'Network error while starting analysis';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
  }, [isAuthenticated]);

  const getJobStatus = useCallback(async (jobId: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> => {
    if (!isAuthenticated) {
      setError('Authentication required');
      return { success: false, error: 'Authentication required' };
    }

    try {
      const response = await apiClient.get(`/documents/jobs/${jobId}`);

      if (response.success && response.data) {
        return { success: true, data: response.data };
      } else {
        const errorMsg = response.error || 'Failed to get job status';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMsg = 'Network error while getting job status';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
  }, [isAuthenticated]);

  const getUserJobs = useCallback(async (limit: number = 20, offset: number = 0): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> => {
    if (!isAuthenticated) {
      setError('Authentication required');
      return { success: false, error: 'Authentication required' };
    }

    try {
      const response = await apiClient.get(`/documents/jobs?limit=${limit}&offset=${offset}`);

      if (response.success && response.data) {
        return { success: true, data: response.data };
      } else {
        const errorMsg = response.error || 'Failed to get user jobs';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMsg = 'Network error while getting user jobs';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
  }, [isAuthenticated]);

  const getSwissObligationAnalysesByDocumentId = useCallback(async (documentId: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> => {
    if (!isAuthenticated) {
      setError('Authentication required');
      return { success: false, error: 'Authentication required' };
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get(`/documents/${documentId}/swiss-obligation-analyses`);

      if (response.success && response.data) {
        return { success: true, data: response.data };
      } else {
        const errorMsg = response.error || 'Failed to fetch Swiss obligation analyses for document';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMsg = 'Network error while fetching Swiss obligation analyses';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const startLawyerReview = useCallback(async (documentId: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> => {
    if (!isAuthenticated) {
      setError('Authentication required');
      return { success: false, error: 'Authentication required' };
    }

    setError(null);

    try {
      const response = await apiClient.post(`/documents/${documentId}/start-lawyer-review`);

      if (response.success && response.data) {
        return { success: true, data: response.data };
      } else {
        const errorMsg = response.error || 'Failed to start lawyer review';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMsg = 'Network error while starting lawyer review';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
  }, [isAuthenticated]);

  const getAllUserDocuments = useCallback(async (tag?: string): Promise<{
    success: boolean;
    data?: {
      documents: any[];
      count: number;
    };
    error?: string;
  }> => {
    if (!isAuthenticated) {
      setError('Authentication required');
      return { success: false, error: 'Authentication required' };
    }

    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams();
      if (tag) queryParams.append('tag', tag);

      const endpoint = `/contracts/documents${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await apiClient.get(endpoint);

      if (response.success && response.data) {
        return { 
          success: true, 
          data: {
            documents: response.data.documents || [],
            count: response.data.count || 0
          }
        };
      } else {
        const errorMsg = response.error || 'Failed to fetch all user documents';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMsg = 'Network error while fetching all user documents';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const getSharedSwissObligationAnalyses = useCallback(async (limit: number = 10): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> => {
    if (!isAuthenticated) {
      setError('Authentication required');
      return { success: false, error: 'Authentication required' };
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get(`/documents/swiss-obligation-analyses-shared?limit=${limit}`);

      if (response.success && response.data) {
        return { success: true, data: response.data };
      } else {
        const errorMsg = response.error || 'Failed to fetch shared Swiss obligation analyses';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMsg = 'Network error while fetching shared Swiss obligation analyses';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const submitLawyerAnalysisResult = useCallback(async (analysisId: string, decision: 'APPROVED' | 'DECLINE', comment?: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> => {
    if (!isAuthenticated) {
      setError('Authentication required');
      return { success: false, error: 'Authentication required' };
    }

    setError(null);

    try {
      const response = await apiClient.post(`/documents/swiss-obligation-analyses/${analysisId}/lawyer-result`, {
        decision,
        comment
      });

      if (response.success && response.data) {
        return { success: true, data: response.data };
      } else {
        const errorMsg = response.error || 'Failed to submit lawyer analysis result';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMsg = 'Network error while submitting lawyer analysis result';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
  }, [isAuthenticated]);

  return {
    getDocuments,
    deleteDocument,
    getDocumentText,
    analyzeSwissObligationLaw,
    getJobStatus,
    getUserJobs,
    getSwissObligationAnalysesByDocumentId,
    getSharedSwissObligationAnalyses,
    startLawyerReview,
    submitLawyerAnalysisResult,
    getAllUserDocuments,
    documents,
    pagination,
    loading,
    error,
    clearError: () => setError(null)
  };
}

// Dashboard hooks
export function useDashboard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);

  const getDashboardStats = useCallback(async (): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> => {
    if (!isAuthenticated) {
      setError('Authentication required');
      return { success: false, error: 'Authentication required' };
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get('/documents/dashboard/stats');

      if (response.success && response.data) {
        return { success: true, data: response.data };
      } else {
        const errorMsg = response.error || 'Failed to fetch dashboard statistics';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMsg = 'Network error while fetching dashboard statistics';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const getRecentActivities = useCallback(async (limit: number = 10): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> => {
    if (!isAuthenticated) {
      setError('Authentication required');
      return { success: false, error: 'Authentication required' };
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get(`/documents/dashboard/activities?limit=${limit}`);

      if (response.success && response.data) {
        return { success: true, data: response.data };
      } else {
        const errorMsg = response.error || 'Failed to fetch recent activities';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMsg = 'Network error while fetching recent activities';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const getAnalysisProgress = useCallback(async (): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> => {
    if (!isAuthenticated) {
      setError('Authentication required');
      return { success: false, error: 'Authentication required' };
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get('/documents/dashboard/progress');

      if (response.success && response.data) {
        return { success: true, data: response.data };
      } else {
        const errorMsg = response.error || 'Failed to fetch analysis progress';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMsg = 'Network error while fetching analysis progress';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  return {
    getDashboardStats,
    getRecentActivities,
    getAnalysisProgress,
    loading,
    error,
    clearError: () => setError(null)
  };
}

// Contract Generation interfaces
export interface ContractGenerationRequest {
  contractType: string;
  parameters: Record<string, any>;
}

export interface ContractGenerationProgress {
  progress: number;
  message: string;
  result?: any;
  error?: string;
}

export function useContractGeneration() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);

  const downloadContractPDF = useCallback(async (generationId: string): Promise<boolean> => {
    if (!isAuthenticated) {
      setError('Not authenticated');
      return false;
    }

    try {
      const result = await apiClient.downloadFile(
        `/contracts/${generationId}/pdf`,
        `contract-${generationId}.pdf`
      );

      if (!result.success) {
        setError(result.error || 'Failed to download PDF');
        return false;
      }

      return true;
    } catch (err) {
      setError('Network error during PDF download');
      return false;
    }
  }, [isAuthenticated]);

  const getGeneratedContracts = useCallback(async (limit: number = 20): Promise<any[] | null> => {
    if (!isAuthenticated) {
      setError('Not authenticated');
      return null;
    }

    try {
      const response = await apiClient.get(`/contracts?limit=${limit}`);

      if (!response.success || !response.data) {
        setError(response.error || 'Failed to fetch generated contracts');
        return null;
      }

      return response.data.results || [];
    } catch (err) {
      setError('Network error while fetching contracts');
      return null;
    }
  }, [isAuthenticated]);

  const deleteGeneratedContract = useCallback(async (generationId: string): Promise<boolean> => {
    if (!isAuthenticated) {
      setError('Not authenticated');
      return false;
    }

    try {
      const response = await apiClient.delete(`/contracts/${generationId}`);

      if (!response.success) {
        setError(response.error || 'Failed to delete contract');
        return false;
      }

      return true;
    } catch (err) {
      setError('Network error while deleting contract');
      return false;
    }
  }, [isAuthenticated]);

  const createContractGenerationJob = useCallback(async (request: {
    contractType: string;
    parameters: Record<string, any>;
  }): Promise<{ jobId: string } | null> => {
    if (!isAuthenticated) {
      setError('Authentication required');
      return null;
    }

    try {
      const jobResponse = await apiClient.post('/contracts/generate-async', request);

      if (!jobResponse.success || !jobResponse.data) {
        throw new Error(jobResponse.error || 'Failed to create contract generation job');
      }

      return { jobId: jobResponse.data.jobId };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return null;
    }
  }, [isAuthenticated]);

  return {
    downloadContractPDF,
    getGeneratedContracts,
    deleteGeneratedContract,
    createContractGenerationJob,
    loading,
    error,
    progress,
    progressMessage,
    clearError: () => setError(null)
  };
}

export function useAdminOperations() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userProfile = useAuthStore(state => state.userProfile);
  const isAdmin = userProfile?.role === 'admin';

  const indexLegalTexts = useCallback(async (texts: Array<{
    content: string;
    title: string;
    source: string;
    jurisdiction?: string;
    legalArea?: string;
  }>): Promise<boolean> => {
    if (!isAdmin) {
      setError('Admin access required');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post('/admin/legal-texts/index', {
        texts
      });

      if (response.success) {
        return true;
      } else {
        setError(response.error || 'Indexing failed');
        return false;
      }
    } catch (err) {
      setError('Network error during indexing');
      return false;
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  const getVectorStoreStats = useCallback(async (): Promise<any | null> => {
    if (!isAdmin) {
      setError('Admin access required');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get('/admin/vector-store/stats');

      if (response.success && response.data) {
        return response.data;
      } else {
        setError(response.error || 'Failed to get stats');
        return null;
      }
    } catch (err) {
      setError('Network error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  const searchLegalContext = useCallback(async (query: string): Promise<any[] | null> => {
    if (!isAdmin) {
      setError('Admin access required');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post<any[]>('/admin/legal-texts/search', {
        query
      });

      if (response.success && response.data) {
        return response.data;
      } else {
        setError(response.error || 'Search failed');
        return null;
      }
    } catch (err) {
      setError('Network error during search');
      return null;
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  return {
    indexLegalTexts,
    getVectorStoreStats,
    searchLegalContext,
    loading,
    error,
    isAdmin,
    clearError: () => setError(null)
  };
}
