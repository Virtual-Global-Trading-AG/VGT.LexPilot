import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import AuthService from '../firebase/auth';

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
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;

  // Actions
  setUser: (user: User | null) => void;
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
  
  // Utility
  initialize: () => void;
}

export const useAuthStore = create<AuthState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    user: null,
    userProfile: null,
    loading: true,
    error: null,
    isAuthenticated: false,

    // Actions
    setUser: (user) => set({ 
      user, 
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
        
        if (result.error) {
          set({ error: result.error, loading: false });
          return false;
        }

        // User will be set by the auth state listener
        return true;
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
        
        if (result.error) {
          set({ error: result.error, loading: false });
          return false;
        }

        // User will be set by the auth state listener
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
          set({ error: result.error });
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

    // Initialize auth state listener
    initialize: () => {
      if (typeof window === 'undefined') return;

      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          // Get user profile from backend
          try {
            const idToken = await user.getIdToken();
            const response = await fetch('/api/auth/me', {
              headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json',
              },
            });

            if (response.ok) {
              const data = await response.json();
              set({ 
                user,
                userProfile: data.user?.profile,
                isAuthenticated: true,
                loading: false 
              });
            } else {
              // Fallback to basic user info
              set({ 
                user,
                userProfile: {
                  uid: user.uid,
                  email: user.email!,
                  displayName: user.displayName || undefined,
                  emailVerified: user.emailVerified,
                  photoURL: user.photoURL || undefined,
                },
                isAuthenticated: true,
                loading: false 
              });
            }
          } catch (error) {
            console.error('Error fetching user profile:', error);
            // Fallback to basic user info
            set({ 
              user,
              userProfile: {
                uid: user.uid,
                email: user.email!,
                displayName: user.displayName || undefined,
                emailVerified: user.emailVerified,
                photoURL: user.photoURL || undefined,
              },
              isAuthenticated: true,
              loading: false 
            });
          }
        } else {
          set({ 
            user: null, 
            userProfile: null, 
            isAuthenticated: false, 
            loading: false 
          });
        }
      });

      // Return cleanup function
      return unsubscribe;
    },
  }))
);

// Initialize the store when imported
if (typeof window !== 'undefined') {
  useAuthStore.getState().initialize();
}
