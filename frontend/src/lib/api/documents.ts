// Document API Service
import apiClient, { ApiResponse } from './client';

export interface DocumentUploadRequest {
  fileName: string;
  contentType: string;
  size: number;
  metadata?: {
    category?: 'contract' | 'legal_document' | 'policy' | 'other';
    description?: string;
    tags?: string[];
  };
}

export interface DocumentUploadResponse {
  documentId: string;
  uploadUrl: string;
  expiresAt: string;
  expiresIn: number;
  quotaInfo: {
    used: number;
    limit: number;
    available: number;
    usagePercentage: number;
  };
}

export interface DocumentMetadata {
  documentId: string;
  fileName: string;
  contentType: string;
  size: number;
  status: 'uploading' | 'uploaded' | 'processing' | 'processed' | 'error';
  uploadedAt: string;
  processedAt?: string;
  category?: string;
  description?: string;
  tags?: string[];
  analyses?: any[];
}

export interface DocumentListResponse {
  documents: DocumentMetadata[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface DocumentFilters {
  status?: string;
  category?: string;
}

class DocumentService {
  /**
   * Startet den Upload-Prozess und gibt die Upload-URL zurück
   */
  async initiateUpload(request: DocumentUploadRequest): Promise<ApiResponse<DocumentUploadResponse>> {
    // Flatten the request structure to match backend expectations
    const requestBody = {
      fileName: request.fileName,
      contentType: request.contentType,
      size: request.size,
      ...request.metadata // Spread metadata fields directly into the request body
    };
    
    console.log('Sending upload request:', requestBody);
    
    return apiClient.post<DocumentUploadResponse>('/documents', requestBody);
  }

  /**
   * Lädt die Datei zur bereitgestellten Upload-URL hoch
   */
  async uploadToSignedUrl(
    uploadUrl: string, 
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();

      // Set up progress tracking
      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = (e.loaded / e.total) * 100;
            onProgress(progress);
          }
        });
      }

      // Set up response handler
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ success: true });
        } else {
          resolve({
            success: false,
            error: `Upload failed with status ${xhr.status}`
          });
        }
      });

      // Set up error handler
      xhr.addEventListener('error', () => {
        resolve({
          success: false,
          error: 'Network error during upload'
        });
      });

      // Start upload to signed URL
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
  }

  /**
   * Kompletter Upload-Prozess: Initiate -> Upload -> Update Status
   */
  async uploadDocument(
    file: File,
    metadata?: DocumentUploadRequest['metadata'],
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<{ documentId: string; message: string }>> {
    try {
      // Debug: Log file properties
      console.log('uploadDocument called with file:', {
        name: file.name,
        type: file.type,
        size: file.size,
        metadata: metadata
      });

      // Schritt 1: Upload initialisieren
      const initiateResponse = await this.initiateUpload({
        fileName: file.name,
        contentType: file.type,
        size: file.size,
        metadata
      });

      if (!initiateResponse.success || !initiateResponse.data) {
        return {
          success: false,
          error: initiateResponse.error || 'Failed to initiate upload'
        };
      }

      const { documentId, uploadUrl } = initiateResponse.data;

      // Schritt 2: Datei zur signed URL hochladen
      const uploadResult = await this.uploadToSignedUrl(uploadUrl, file, onProgress);

      if (!uploadResult.success) {
        return {
          success: false,
          error: uploadResult.error || 'File upload failed'
        };
      }

      // Schritt 3: Status auf 'uploaded' setzen
      const statusUpdateResponse = await this.updateDocumentStatus(documentId, 'uploaded');

      if (!statusUpdateResponse.success) {
        console.warn('Status update failed, but file was uploaded successfully');
      }

      return {
        success: true,
        data: {
          documentId,
          message: 'Document uploaded successfully'
        }
      };

    } catch (error) {
      console.error('Document upload error:', error);
      return {
        success: false,
        error: 'Upload process failed'
      };
    }
  }

  /**
   * Holt Details eines spezifischen Dokuments
   */
  async getDocument(documentId: string): Promise<ApiResponse<DocumentMetadata>> {
    return apiClient.get<DocumentMetadata>(`/documents/${documentId}`);
  }

  /**
   * Holt Liste aller Dokumente des Benutzers
   */
  async getDocuments(
    pagination?: PaginationOptions,
    filters?: DocumentFilters
  ): Promise<ApiResponse<DocumentListResponse>> {
    const queryParams = new URLSearchParams();
    
    if (pagination?.page) queryParams.append('page', pagination.page.toString());
    if (pagination?.limit) queryParams.append('limit', pagination.limit.toString());
    if (filters?.status) queryParams.append('status', filters.status);
    if (filters?.category) queryParams.append('category', filters.category);

    const queryString = queryParams.toString();
    const endpoint = queryString ? `/documents?${queryString}` : '/documents';

    return apiClient.get<DocumentListResponse>(endpoint);
  }

  /**
   * Sucht nach Dokumenten
   */
  async searchDocuments(
    searchText: string,
    filters?: DocumentFilters,
    pagination?: PaginationOptions
  ): Promise<ApiResponse<DocumentListResponse>> {
    const queryParams = new URLSearchParams();
    queryParams.append('q', searchText);
    
    if (pagination?.page) queryParams.append('page', pagination.page.toString());
    if (pagination?.limit) queryParams.append('limit', pagination.limit.toString());
    if (filters?.status) queryParams.append('status', filters.status);
    if (filters?.category) queryParams.append('category', filters.category);

    return apiClient.get<DocumentListResponse>(`/documents/search?${queryParams.toString()}`);
  }

  /**
   * Aktualisiert Dokument-Metadaten
   */
  async updateDocument(
    documentId: string,
    updates: {
      title?: string;
      description?: string;
      tags?: string[];
      category?: string;
    }
  ): Promise<ApiResponse<{ documentId: string; message: string }>> {
    return apiClient.put(`/documents/${documentId}`, updates);
  }

  /**
   * Aktualisiert Dokument-Status
   */
  async updateDocumentStatus(
    documentId: string,
    status: DocumentMetadata['status']
  ): Promise<ApiResponse<{ documentId: string; status: string; message: string }>> {
    return apiClient.patch(`/documents/${documentId}/status`, { status });
  }

  /**
   * Löscht ein Dokument
   */
  async deleteDocument(documentId: string): Promise<ApiResponse<{ documentId: string; message: string }>> {
    return apiClient.delete(`/documents/${documentId}`);
  }

  /**
   * Holt Storage-Statistiken
   */
  async getStorageStats(): Promise<ApiResponse<{
    documents: {
      total: number;
      byStatus: Record<string, number>;
      byCategory: Record<string, number>;
    };
    storage: {
      used: number;
      limit: number;
      available: number;
      usagePercentage: number;
      usedMB: number;
      limitMB: number;
    };
  }>> {
    return apiClient.get('/documents/stats');
  }

  /**
   * Startet Dokumentanalyse
   */
  async analyzeDocument(
    documentId: string,
    analysisType: 'gdpr' | 'contract_risk' | 'legal_review',
    options?: {
      priority?: 'low' | 'normal' | 'high';
      notifyByEmail?: boolean;
      detailedReport?: boolean;
      language?: string;
    }
  ): Promise<ApiResponse<{
    analysisId: string;
    documentId: string;
    analysisType: string;
    status: string;
    message: string;
  }>> {
    return apiClient.post(`/documents/${documentId}/analyze`, {
      analysisType,
      options
    });
  }

  /**
   * Holt Analyseergebnisse
   */
  async getAnalysisResults(
    documentId: string,
    analysisId: string
  ): Promise<ApiResponse<any>> {
    return apiClient.get(`/documents/${documentId}/analysis/${analysisId}`);
  }

  /**
   * Download-URL für Dokument generieren
   */
  async getDownloadUrl(documentId: string): Promise<ApiResponse<{
    downloadUrl: string;
    fileName: string;
    contentType: string;
    size: number;
    expiresAt: string;
    expiresIn: number;
  }>> {
    return apiClient.get(`/documents/${documentId}/download`);
  }
}

// Export singleton instance
const documentService = new DocumentService();
export default documentService;
