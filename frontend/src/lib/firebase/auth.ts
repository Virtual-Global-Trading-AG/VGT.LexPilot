import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updatePassword,
  User,
  AuthError,
  sendEmailVerification,
} from 'firebase/auth';
import { auth } from './config';

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
  user: User | null;
  error?: string;
}

export class AuthService {
  /**
   * Sign in with email and password
   */
  static async signIn(credentials: LoginCredentials): Promise<AuthResult> {
    try {
      const { email, password } = credentials;
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return { user: userCredential.user };
    } catch (error) {
      const authError = error as AuthError;
      return {
        user: null,
        error: this.getErrorMessage(authError.code)
      };
    }
  }

  /**
   * Register new user with email and password
   */
  static async register(data: RegisterData): Promise<AuthResult> {
    try {
      const { email, password } = data;
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Send email verification
      if (userCredential.user) {
        await sendEmailVerification(userCredential.user);
      }

      return { user: userCredential.user };
    } catch (error) {
      const authError = error as AuthError;
      return {
        user: null,
        error: this.getErrorMessage(authError.code)
      };
    }
  }

  /**
   * Sign out current user
   */
  static async signOut(): Promise<void> {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  }

  /**
   * Send password reset email
   */
  static async resetPassword(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (error) {
      const authError = error as AuthError;
      return {
        success: false,
        error: this.getErrorMessage(authError.code)
      };
    }
  }

  /**
   * Update user password
   */
  static async changePassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      const user = auth.currentUser;
      if (!user) {
        return { success: false, error: 'Kein Benutzer angemeldet' };
      }

      await updatePassword(user, newPassword);
      return { success: true };
    } catch (error) {
      const authError = error as AuthError;
      return {
        success: false,
        error: this.getErrorMessage(authError.code)
      };
    }
  }

  /**
   * Get current user
   */
  static getCurrentUser(): User | null {
    return auth.currentUser;
  }

  /**
   * Get user ID token
   */
  static async getIdToken(): Promise<string | null> {
    try {
      const user = auth.currentUser;
      if (!user) return null;
      
      return await user.getIdToken();
    } catch (error) {
      console.error('Error getting ID token:', error);
      return null;
    }
  }

  /**
   * Convert Firebase error codes to user-friendly messages
   */
  private static getErrorMessage(errorCode: string): string {
    switch (errorCode) {
      case 'auth/user-not-found':
        return 'Kein Benutzer mit dieser E-Mail-Adresse gefunden.';
      case 'auth/wrong-password':
        return 'Falsches Passwort.';
      case 'auth/email-already-in-use':
        return 'Diese E-Mail-Adresse wird bereits verwendet.';
      case 'auth/weak-password':
        return 'Das Passwort ist zu schwach. Verwenden Sie mindestens 6 Zeichen.';
      case 'auth/invalid-email':
        return 'Ungültige E-Mail-Adresse.';
      case 'auth/user-disabled':
        return 'Dieser Benutzeraccount wurde deaktiviert.';
      case 'auth/too-many-requests':
        return 'Zu viele Anmeldeversuche. Versuchen Sie es später erneut.';
      case 'auth/network-request-failed':
        return 'Netzwerkfehler. Prüfen Sie Ihre Internetverbindung.';
      case 'auth/requires-recent-login':
        return 'Bitte melden Sie sich erneut an, um diese Aktion durchzuführen.';
      default:
        return 'Ein unerwarteter Fehler ist aufgetreten. Versuchen Sie es erneut.';
    }
  }
}

export default AuthService;
