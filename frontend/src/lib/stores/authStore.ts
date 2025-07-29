import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import AuthService from '../api/auth';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  emailVerified: boolean;
  photoURL?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  phone?: string;
  role?: 'user' | 'premium' | 'admin';
  subscription?: {
    type: 'free' | 'premium';
    expiresAt?: Date;
  };
}

interface AuthState {
  // State
  user: UserProfile | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  accessToken: string | null;

  // Actions
  setUser: (user: UserProfile | null) => void;
  setUserProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  
  // Auth actions
  signIn: (email: string, password: string) => Promise<boolean>;
  register: (data: {
    email: string;
    password: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
  }) => Promise<boolean>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  
  // Utility
  initialize: () => Promise<void>;
  refreshAuth: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    user: null,
    userProfile: null,
    loading: true,
    error: null,
    isAuthenticated: false,
    accessToken: null,

    // Actions
    setUser: (user) => set({ 
      user, 
      userProfile: user, // In API mode, user and userProfile are the same
      isAuthenticated: !!user,
      loading: false 
    }),

    setUserProfile: (userProfile) => set({ userProfile }),

    setLoading: (loading) => set({ loading }),

    setError: (error) => set({ error }),

    clearError: () => set({ error: null }),

    // Auth actions
    signIn: async (email, password) => {
      set({ loading: true, error: null });
      
      try {
        const result = await AuthService.signIn({ email, password });
        
        if (!result.success) {
          set({ error: result.error || 'Login failed', loading: false });
          return false;
        }

        if (result.user && result.tokens) {
          set({ 
            user: {
              ...result.user,
              role: (result.user.role as 'user' | 'premium' | 'admin') || 'user'
            },
            userProfile: {
              ...result.user,
              role: (result.user.role as 'user' | 'premium' | 'admin') || 'user'
            },
            isAuthenticated: true,
            accessToken: result.tokens.idToken,
            loading: false,
            error: null
          });
          return true;
        }

        set({ error: 'Invalid response from server', loading: false });
        return false;
      } catch (error) {
        set({ 
          error: 'Ein unerwarteter Fehler ist aufgetreten.', 
          loading: false 
        });
        return false;
      }
    },

    register: async (data) => {
      set({ loading: true, error: null });
      
      try {
        const result = await AuthService.register(data);
        
        if (!result.success) {
          set({ error: result.error || 'Registration failed', loading: false });
          return false;
        }

        // Check if registration returned tokens (auto-login)
        if (result.user && result.tokens) {
          set({ 
            user: {
              ...result.user,
              role: (result.user.role as 'user' | 'premium' | 'admin') || 'user'
            },
            userProfile: {
              ...result.user,
              role: (result.user.role as 'user' | 'premium' | 'admin') || 'user'
            },
            isAuthenticated: true,
            accessToken: result.tokens.idToken,
            loading: false,
            error: null
          });
        } else {
          // Registration successful but no auto-login
          set({ loading: false, error: null });
        }
        
        return true;
      } catch (error) {
        set({ 
          error: 'Ein unerwarteter Fehler ist aufgetreten.', 
          loading: false 
        });
        return false;
      }
    },

    signOut: async () => {
      set({ loading: true, error: null });
      
      try {
        await AuthService.signOut();
        set({ 
          user: null, 
          userProfile: null, 
          isAuthenticated: false, 
          accessToken: null,
          loading: false 
        });
      } catch (error) {
        set({ 
          error: 'Fehler beim Abmelden.', 
          loading: false 
        });
      }
    },

    resetPassword: async (email) => {
      set({ loading: true, error: null });
      
      try {
        const result = await AuthService.resetPassword(email);
        set({ loading: false });
        
        if (!result.success) {
          set({ error: result.error || 'Password reset failed' });
          return false;
        }
        
        return true;
      } catch (error) {
        set({ 
          error: 'Fehler beim Zurücksetzen des Passworts.', 
          loading: false 
        });
        return false;
      }
    },

    changePassword: async (currentPassword, newPassword) => {
      set({ loading: true, error: null });
      
      try {
        const result = await AuthService.changePassword(currentPassword, newPassword);
        set({ loading: false });
        
        if (!result.success) {
          set({ error: result.error || 'Password change failed' });
          return false;
        }
        
        return true;
      } catch (error) {
        set({ 
          error: 'Fehler beim Ändern des Passworts.', 
          loading: false 
        });
        return false;
      }
    },

    // Refresh authentication state
    refreshAuth: async () => {
      const state = get();
      if (!state.isAuthenticated) {
        return false;
      }

      try {
        const result = await AuthService.getCurrentUser();
        
        if (result.success && result.user) {
          set({ 
            user: {
              ...result.user,
              role: (result.user.role as 'user' | 'premium' | 'admin') || 'user'
            },
            userProfile: {
              ...result.user,
              role: (result.user.role as 'user' | 'premium' | 'admin') || 'user'
            },
            isAuthenticated: true,
            accessToken: AuthService.getAccessToken()
          });
          return true;
        } else {
          // Token might be expired, try to refresh
          const refreshResult = await AuthService.refreshTokens();
          if (refreshResult.success) {
            const userResult = await AuthService.getCurrentUser();
            if (userResult.success && userResult.user) {
              set({ 
                user: {
                  ...userResult.user,
                  role: (userResult.user.role as 'user' | 'premium' | 'admin') || 'user'
                },
                userProfile: {
                  ...userResult.user,
                  role: (userResult.user.role as 'user' | 'premium' | 'admin') || 'user'
                },
                isAuthenticated: true,
                accessToken: AuthService.getAccessToken()
              });
              return true;
            }
          }
          
          // Refresh failed, logout user
          set({ 
            user: null, 
            userProfile: null, 
            isAuthenticated: false, 
            accessToken: null
          });
          return false;
        }
      } catch (error) {
        console.error('Error refreshing auth:', error);
        return false;
      }
    },

    // Initialize auth state from stored tokens
    initialize: async () => {
      if (typeof window === 'undefined') return;

      set({ loading: true });

      try {
        // Check if we have stored tokens
        if (AuthService.isAuthenticated()) {
          // Try to get current user with stored token
          const result = await AuthService.getCurrentUser();
          
          if (result.success && result.user) {
            set({ 
              user: {
                ...result.user,
                role: (result.user.role as 'user' | 'premium' | 'admin') || 'user'
              },
              userProfile: {
                ...result.user,
                role: (result.user.role as 'user' | 'premium' | 'admin') || 'user'
              },
              isAuthenticated: true,
              accessToken: AuthService.getAccessToken(),
              loading: false 
            });
          } else {
            // Token might be expired, try to refresh
            const refreshResult = await AuthService.refreshTokens();
            if (refreshResult.success) {
              const userResult = await AuthService.getCurrentUser();
              if (userResult.success && userResult.user) {
                set({ 
                  user: {
                    ...userResult.user,
                    role: (userResult.user.role as 'user' | 'premium' | 'admin') || 'user'
                  },
                  userProfile: {
                    ...userResult.user,
                    role: (userResult.user.role as 'user' | 'premium' | 'admin') || 'user'
                  },
                  isAuthenticated: true,
                  accessToken: AuthService.getAccessToken(),
                  loading: false 
                });
              } else {
                set({ loading: false });
              }
            } else {
              // Refresh failed, clear everything
              AuthService.logout();
              set({ loading: false });
            }
          }
        } else {
          set({ loading: false });
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        set({ loading: false });
      }
    },
  }))
);

// Initialize the store when imported
if (typeof window !== 'undefined') {
  useAuthStore.getState().initialize();
}
