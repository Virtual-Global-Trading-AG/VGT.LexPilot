// API-basierte Authentication Service
// Kommuniziert mit dem Backend anstelle von direkter Firebase Auth

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
}

export interface AuthResult {
  success: boolean;
  user?: {
    uid: string;
    email: string;
    displayName?: string;
    emailVerified: boolean;
    role?: string;
  };
  tokens?: {
    idToken: string;
    refreshToken: string;
  };
  error?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

class ApiAuthService {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor() {
    // In development: http://localhost:5001/project-id/us-central1/api
    // In production: your cloud function URL
    this.baseUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
    
    // Load tokens from localStorage if available
    if (typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('accessToken');
      this.refreshToken = localStorage.getItem('refreshToken');
    }
  }

  /**
   * Make authenticated API request
   */
  private async makeRequest<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    // Add auth header if we have a token
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle token refresh for 401 errors
        if (response.status === 401 && this.refreshToken && endpoint !== '/auth/refresh') {
          const refreshResult = await this.refreshTokens();
          if (refreshResult.success) {
            // Retry the original request with new token
            return this.makeRequest(endpoint, options);
          } else {
            // Refresh failed, logout user
            this.logout();
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
        data: data.data || data, // Fallback to data itself if data.data doesn't exist
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
   * Sign in with email and password
   */
  async signIn(credentials: LoginCredentials): Promise<AuthResult> {
    const result = await this.makeRequest<{
      user: any;
      tokens: { idToken: string; refreshToken: string };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });

    if (result.success && result.data) {
      // Store tokens
      this.accessToken = result.data.tokens.idToken;
      this.refreshToken = result.data.tokens.refreshToken;
      
      if (typeof window !== 'undefined') {
        localStorage.setItem('accessToken', this.accessToken);
        localStorage.setItem('refreshToken', this.refreshToken);
      }

      return {
        success: true,
        user: result.data.user,
        tokens: result.data.tokens
      };
    }

    return {
      success: false,
      error: result.error
    };
  }

  /**
   * Register new user
   */
  async register(data: RegisterData): Promise<AuthResult> {
    const result = await this.makeRequest<{
      user: any;
      tokens?: { idToken: string; refreshToken: string };
      verificationLink?: string;
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (result.success && result.data) {
      // Check if tokens were returned (auto-login after registration)
      if (result.data.tokens) {
        // Store tokens
        this.accessToken = result.data.tokens.idToken;
        this.refreshToken = result.data.tokens.refreshToken;
        
        if (typeof window !== 'undefined') {
          localStorage.setItem('accessToken', this.accessToken);
          localStorage.setItem('refreshToken', this.refreshToken);
        }

        return {
          success: true,
          user: result.data.user,
          tokens: result.data.tokens
        };
      }

      // Registration successful but no auto-login
      return {
        success: true,
        user: result.data.user
      };
    }

    return {
      success: false,
      error: result.error
    };
  }

  /**
   * Sign out user
   */
  async signOut(): Promise<void> {
    // Call backend logout endpoint if we have a token
    if (this.accessToken) {
      await this.makeRequest('/auth/logout', {
        method: 'POST',
      });
    }

    // Clear local state
    this.logout();
  }

  /**
   * Logout locally (clear tokens)
   */
  logout(): void {
    this.accessToken = null;
    this.refreshToken = null;
    
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    }
  }

  /**
   * Reset password
   */
  async resetPassword(email: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.makeRequest('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });

    return {
      success: result.success,
      error: result.error
    };
  }

  /**
   * Refresh access token
   */
  async refreshTokens(): Promise<AuthResult> {
    if (!this.refreshToken) {
      return { success: false, error: 'No refresh token available' };
    }

    const result = await this.makeRequest<{
      tokens: { idToken: string; refreshToken: string };
    }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    });

    if (result.success && result.data) {
      this.accessToken = result.data.tokens.idToken;
      this.refreshToken = result.data.tokens.refreshToken;
      
      if (typeof window !== 'undefined') {
        localStorage.setItem('accessToken', this.accessToken);
        localStorage.setItem('refreshToken', this.refreshToken);
      }

      return {
        success: true,
        tokens: result.data.tokens
      };
    }

    return {
      success: false,
      error: result.error
    };
  }

  /**
   * Get current user profile
   */
  async getCurrentUser(): Promise<{
    success: boolean;
    user?: any;
    error?: string;
  }> {
    const result = await this.makeRequest<{ user: any }>('/auth/me');

    if (result.success && result.data) {
      return {
        success: true,
        user: result.data.user
      };
    }

    return {
      success: false,
      error: result.error
    };
  }

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    const result = await this.makeRequest('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword,
        newPassword
      }),
    });

    return {
      success: result.success,
      error: result.error
    };
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  /**
   * Get current access token
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Get auth headers for manual API calls
   */
  getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    return headers;
  }
}

// Export singleton instance
const AuthService = new ApiAuthService();
export default AuthService;
