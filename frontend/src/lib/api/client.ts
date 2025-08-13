// API Client helper für authentifizierte Requests
import AuthService from './auth';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
  }

  /**
   * Make authenticated API request
   */
  async request<T = unknown>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      ...AuthService.getAuthHeaders(),
      ...(options.headers as Record<string, string>),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle token refresh for 401 errors
        if (response.status === 401 && endpoint !== '/auth/refresh') {
          const refreshResult = await AuthService.refreshTokens();
          if (refreshResult.success) {
            // Retry the original request with new token
            return this.request(endpoint, options);
          } else {
            // Refresh failed, logout user
            AuthService.logout();
            return { success: false, error: 'Session expired. Please login again.' };
          }
        }

        return {
          success: false,
          error: data.error || data.message || 'Request failed'
        };
      }

      return {
        success: true,
        data: data.data,
        message: data.message
      };
    } catch (error) {
      console.error('API request failed:', error);
      return {
        success: false,
        error: 'Network error. Please check your connection.'
      };
    }
  }

  /**
   * GET request
   */
  async get<T = unknown>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T = unknown>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PUT request
   */
  async put<T = unknown>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete<T = unknown>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  /**
   * Upload file with progress
   */
  async uploadFile<T = unknown>(
    endpoint: string, 
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<T>> {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      const isSignedUrl = endpoint.startsWith('http://') || endpoint.startsWith('https://');

      // For signed URLs, send raw file data; for API endpoints, use FormData
      const uploadData = isSignedUrl ? file : (() => {
        const formData = new FormData();
        formData.append('file', file);
        return formData;
      })();

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
        if (isSignedUrl) {
          // For signed URLs, success is indicated by 2xx status codes
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({
              success: true,
              data: null as T,
              message: 'Upload successful'
            });
          } else {
            console.error('Signed URL upload failed:', {
              status: xhr.status,
              statusText: xhr.statusText,
              responseText: xhr.responseText,
              uploadUrl: endpoint
            });
            resolve({
              success: false,
              error: `Upload failed with status ${xhr.status}: ${xhr.statusText}${xhr.responseText ? ` - ${xhr.responseText}` : ''}`
            });
          }
        } else {
          // For API endpoints, parse JSON response
          try {
            const response = JSON.parse(xhr.responseText);

            if (xhr.status >= 200 && xhr.status < 300) {
              resolve({
                success: true,
                data: response.data,
                message: response.message
              });
            } else {
              resolve({
                success: false,
                error: response.error || response.message || 'Upload failed'
              });
            }
          } catch (error) {
            resolve({
              success: false,
              error: 'Invalid response from server'
            });
          }
        }
      });

      // Set up error handler
      xhr.addEventListener('error', () => {
        console.error('XMLHttpRequest error during upload:', {
          readyState: xhr.readyState,
          status: xhr.status,
          statusText: xhr.statusText,
          responseText: xhr.responseText,
          uploadUrl: isSignedUrl ? endpoint : `${this.baseUrl}${endpoint}`,
          isSignedUrl
        });
        resolve({
          success: false,
          error: `Network error during upload (Status: ${xhr.status})`
        });
      });

      // Set headers
      if (isSignedUrl) {
        // For signed URLs, don't set Content-Type header manually
        // The signed URL already includes the content type constraint
        // and setting it manually can cause conflicts
      } else {
        // For API endpoints, set auth headers (don't set Content-Type for FormData)
        const authHeaders = AuthService.getAuthHeaders();
        Object.entries(authHeaders).forEach(([key, value]) => {
          if (key !== 'Content-Type') {
            xhr.setRequestHeader(key, value);
          }
        });
      }

      // Start upload
      const uploadUrl = isSignedUrl ? endpoint : `${this.baseUrl}${endpoint}`;
      const method = isSignedUrl ? 'PUT' : 'POST'; // Use PUT for signed URLs, POST for API endpoints
      xhr.open(method, uploadUrl);
      xhr.send(uploadData);
    });
  }

  /**
   * Upload file directly with base64 content
   */
  async uploadFileDirect<T = unknown>(
    fileName: string,
    contentType: string,
    base64Content: string,
    metadata?: {
      category?: 'contract' | 'legal_document' | 'policy' | 'other';
      description?: string;
      tags?: string[];
    }
  ): Promise<ApiResponse<T>> {
    const payload = {
      fileName,
      contentType,
      base64Content,
      metadata
    };

    return this.post<T>('/documents/upload-direct', payload);
  }

  /**
   * Download file
   */
  async downloadFile(endpoint: string, filename?: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: AuthService.getAuthHeaders(),
      });

      if (!response.ok) {
        return {
          success: false,
          error: 'Download failed'
        };
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'download';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      return { success: true };
    } catch (error) {
      console.error('Download error:', error);
      return {
        success: false,
        error: 'Download failed'
      };
    }
  }
}

// Export singleton instance
const apiClient = new ApiClient();
export default apiClient;
