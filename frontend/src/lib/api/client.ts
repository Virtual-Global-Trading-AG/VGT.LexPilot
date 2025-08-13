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
   * PATCH request
   */
  async patch<T = unknown>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
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
      const formData = new FormData();
      formData.append('file', file);

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
      });

      // Set up error handler
      xhr.addEventListener('error', () => {
        resolve({
          success: false,
          error: 'Network error during upload'
        });
      });

      // Set headers
      const authHeaders = AuthService.getAuthHeaders();
      Object.entries(authHeaders).forEach(([key, value]) => {
        if (key !== 'Content-Type') { // Don't set Content-Type for FormData
          xhr.setRequestHeader(key, value);
        }
      });

      // Start upload
      xhr.open('POST', `${this.baseUrl}${endpoint}`);
      xhr.send(formData);
    });
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
