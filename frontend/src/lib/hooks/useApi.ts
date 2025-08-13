// React hooks für die RAG-API Endpunkte
import { useState, useCallback } from 'react';
import apiClient from '../api/client';
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
  recommendations: any[];
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
      category?: 'contract' | 'legal_document' | 'policy' | 'other';
      description?: string;
      tags?: string[];
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
