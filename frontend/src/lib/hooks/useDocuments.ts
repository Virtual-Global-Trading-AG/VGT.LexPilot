'use client';

import { useState, useEffect, useCallback } from 'react';
import documentService, { 
  DocumentMetadata, 
  DocumentListResponse, 
  PaginationOptions, 
  DocumentFilters 
} from '@/lib/api/documents';

interface UseDocumentsOptions {
  initialPage?: number;
  initialLimit?: number;
  initialFilters?: DocumentFilters;
  autoLoad?: boolean;
}

interface UseDocumentsReturn {
  documents: DocumentMetadata[];
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filters: DocumentFilters;
  
  // Actions
  loadDocuments: () => Promise<void>;
  searchDocuments: (query: string) => Promise<void>;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  setFilters: (filters: DocumentFilters) => void;
  refreshDocuments: () => Promise<void>;
  deleteDocument: (documentId: string) => Promise<boolean>;
  
  // Upload tracking
  uploadProgress: Record<string, number>;
  addUploadProgress: (fileId: string, progress: number) => void;
  removeUploadProgress: (fileId: string) => void;
}

export const useDocuments = (options: UseDocumentsOptions = {}): UseDocumentsReturn => {
  const {
    initialPage = 1,
    initialLimit = 10,
    initialFilters = {},
    autoLoad = true,
  } = options;

  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: initialPage,
    limit: initialLimit,
    total: 0,
    totalPages: 0,
  });
  const [filters, setFiltersState] = useState<DocumentFilters>(initialFilters);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const paginationOptions: PaginationOptions = {
        page: pagination.page,
        limit: pagination.limit,
      };

      const response = await documentService.getDocuments(paginationOptions, filters);

      if (response.success && response.data) {
        setDocuments(response.data.documents);
        setPagination(prev => ({
          ...prev,
          total: response.data!.pagination.total,
          totalPages: response.data!.pagination.totalPages,
        }));
      } else {
        setError(response.error || 'Failed to load documents');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  const searchDocuments = useCallback(async (query: string) => {
    if (!query.trim()) {
      return loadDocuments();
    }

    setLoading(true);
    setError(null);

    try {
      const paginationOptions: PaginationOptions = {
        page: 1, // Reset to first page for search
        limit: pagination.limit,
      };

      const response = await documentService.searchDocuments(query, filters, paginationOptions);

      if (response.success && response.data) {
        setDocuments(response.data.documents);
        setPagination(prev => ({
          ...prev,
          page: 1,
          total: response.data!.pagination.total,
          totalPages: response.data!.pagination.totalPages,
        }));
      } else {
        setError(response.error || 'Search failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, filters, loadDocuments]);

  const setPage = useCallback((page: number) => {
    setPagination(prev => ({ ...prev, page }));
  }, []);

  const setLimit = useCallback((limit: number) => {
    setPagination(prev => ({ ...prev, limit, page: 1 })); // Reset to first page
  }, []);

  const setFilters = useCallback((newFilters: DocumentFilters) => {
    setFiltersState(newFilters);
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  }, []);

  const refreshDocuments = useCallback(async () => {
    await loadDocuments();
  }, [loadDocuments]);

  const deleteDocument = useCallback(async (documentId: string): Promise<boolean> => {
    try {
      const response = await documentService.deleteDocument(documentId);

      if (response.success) {
        // Remove document from local state
        setDocuments(prev => prev.filter(doc => doc.documentId !== documentId));
        
        // Update pagination if necessary
        setPagination(prev => ({
          ...prev,
          total: Math.max(0, prev.total - 1),
          totalPages: Math.max(1, Math.ceil((prev.total - 1) / prev.limit)),
        }));

        // If current page is empty and not the first page, go to previous page
        const remainingDocs = documents.length - 1;
        if (remainingDocs === 0 && pagination.page > 1) {
          setPagination(prev => ({ ...prev, page: prev.page - 1 }));
        }

        return true;
      } else {
        setError(response.error || 'Failed to delete document');
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document');
      return false;
    }
  }, [documents.length, pagination.page]);

  const addUploadProgress = useCallback((fileId: string, progress: number) => {
    setUploadProgress(prev => ({ ...prev, [fileId]: progress }));
  }, []);

  const removeUploadProgress = useCallback((fileId: string) => {
    setUploadProgress(prev => {
      const { [fileId]: removed, ...rest } = prev;
      return rest;
    });
  }, []);

  // Load documents when dependencies change
  useEffect(() => {
    if (autoLoad) {
      loadDocuments();
    }
  }, [loadDocuments, autoLoad]);

  return {
    documents,
    loading,
    error,
    pagination,
    filters,
    loadDocuments,
    searchDocuments,
    setPage,
    setLimit,
    setFilters,
    refreshDocuments,
    deleteDocument,
    uploadProgress,
    addUploadProgress,
    removeUploadProgress,
  };
};

export default useDocuments;
