# Frontend Authentication - VGT.LexPilot

## Übersicht

Das Frontend Authentication System für VGT.LexPilot bietet eine moderne, sichere und benutzerfreundliche Authentifizierungslösung mit Firebase Authentication.

## Features

### 🔐 Authentifizierung
- **Login**: E-Mail/Passwort Anmeldung mit Validierung
- **Registrierung**: Benutzerregistrierung mit erweiterten Profildaten
- **Passwort Reset**: Passwort zurücksetzen per E-Mail
- **E-Mail Verifikation**: Automatische E-Mail-Bestätigung nach Registrierung

### 🎨 Modern UI/UX
- **Responsive Design**: Funktioniert perfekt auf allen Geräten
- **Dark Mode**: Vollständige Dark/Light Mode Unterstützung
- **Animations**: Smooth Motion-Animationen für bessere UX
- **Interactive Elements**: Passwort-Sichtbarkeit, Loading States, Form Validation
- **Beautiful Branding**: Professionelles Design mit VGT.LexPilot Branding

### 🛡️ Sicherheit & Validierung
- **Client-side Validation**: Echtzeitvalidierung mit visuellen Feedback
- **Passwort Stärke**: Passwort-Stärke-Indikator bei Registrierung
- **Auth Guards**: Automatische Umleitung für geschützte/öffentliche Routen
- **Error Handling**: Benutzerfreundliche Fehlermeldungen

### 🧠 State Management
- **Zustand Store**: Effizientes State Management mit Zustand
- **Auth State Persistence**: Automatische Wiederherstellung der Auth-Session
- **Real-time Updates**: Sofortige UI-Updates bei Auth-Änderungen

## Architektur

### Komponenten-Struktur
```
src/components/features/auth/
├── AuthLayout.tsx          # Layout für Auth-Seiten mit Branding
├── LoginForm.tsx           # Login-Formular mit Validierung
├── RegisterForm.tsx        # Registrierungs-Formular
├── ForgotPasswordForm.tsx  # Passwort-Reset-Formular
└── AuthGuard.tsx          # Route-Schutz Komponenten
```

### Services & State
```
src/lib/
├── firebase/
│   ├── config.ts          # Firebase Konfiguration
│   └── auth.ts           # Auth Service Layer
└── stores/
    └── authStore.ts      # Zustand Auth Store
```

### Routes
```
src/app/
├── (auth)/               # Auth Route Group
│   ├── login/           # Login Seite
│   ├── register/        # Registrierung Seite
│   └── forgot-password/ # Passwort Reset Seite
└── dashboard/           # Geschützte Dashboard Seite
```

## Setup & Konfiguration

### 1. Environment Variables
Erstellen Sie eine `.env.local` Datei basierend auf `.env.local.example`:

```bash
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Backend API Configuration
NEXT_PUBLIC_API_URL=localhost:
```

### 2. Firebase Setup
1. Erstellen Sie ein Firebase Projekt
2. Aktivieren Sie Authentication mit E-Mail/Passwort
3. Konfigurieren Sie die autorisierten Domains
4. Kopieren Sie die Config-Werte in `.env.local`

### 3. Installation
```bash
cd frontend
pnpm install
pnpm dev
```

## Verwendung

### Auth Guards
```tsx
import { ProtectedRoute, PublicRoute } from '@/components/features/auth/AuthGuard'

// Geschützte Route (nur für angemeldete Benutzer)
export default function DashboardPage() {
  return (
    <ProtectedRoute redirectTo="/login">
      <DashboardContent />
    </ProtectedRoute>
  )
}

// Öffentliche Route (nur für nicht-angemeldete Benutzer)
export default function LoginPage() {
  return (
    <PublicRoute redirectTo="/dashboard">
      <LoginForm />
    </PublicRoute>
  )
}
```

### Auth Store Verwendung
```tsx
import { useAuthStore } from '@/lib/stores/authStore'

function MyComponent() {
  const { 
    user, 
    userProfile, 
    isAuthenticated, 
    loading, 
    signIn, 
    signOut,
    register 
  } = useAuthStore()

  const handleLogin = async () => {
    const success = await signIn(email, password)
    if (success) {
      // Login erfolgreich
    }
  }
}
```

## Features im Detail

### Login Form
- E-Mail und Passwort Validierung
- Passwort-Sichtbarkeit Toggle
- "Angemeldet bleiben" Checkbox
- Direkte Links zu Registrierung und Passwort-Reset
- Loading States und Error Handling

### Register Form
- Erweiterte Felder: Vor-/Nachname, Unternehmen, Telefon
- Passwort-Stärke-Indikator
- AGB und Datenschutz Zustimmung
- E-Mail Verifikation nach Registrierung

### Forgot Password
- E-Mail Eingabe mit Validierung
- Bestätigungsseite nach E-Mail-Versand
- Möglichkeit andere E-Mail zu verwenden

### Dashboard
- Benutzer-Profil Anzeige
- E-Mail Verifikations-Status
- Schnellzugriff Buttons
- Abmelde-Funktionalität

## Styling & Themes

Das System verwendet:
- **Tailwind CSS**: Utility-first CSS Framework
- **Radix UI**: Accessible UI Primitives
- **Motion**: Smooth Animations
- **CSS Variables**: Für Dynamic Theming

### Theme Toggle
Der Theme Provider unterstützt:
- System-Präferenz Detection
- Manual Dark/Light Mode Toggle
- Persistierung der Theme-Einstellung

## Error Handling

Das System behandelt verschiedene Auth-Fehler:
- Ungültige E-Mail/Passwort Kombinationen
- Schwache Passwörter
- E-Mail bereits registriert
- Netzwerk-Fehler
- Rate Limiting

Alle Fehler werden benutzerfreundlich auf Deutsch angezeigt.

## Performance

### Optimierungen
- **Code Splitting**: Automatisches Route-based Splitting
- **Lazy Loading**: Auth Guards und Forms
- **Bundle Optimization**: Tree-shaking für Firebase SDK
- **SSR Support**: Server-side Rendering kompatibel

### Loading States
- Skeleton Loading für Forms
- Spinner für API Calls
- Progressive Enhancement

## Sicherheit

### Best Practices
- Keine Passwörter im localStorage
- Secure HTTP-only Cookies für Session
- CSRF Protection
- Rate Limiting auf Frontend-Ebene
- Input Sanitization

### Validierung
- Client-side Validation für UX
- Server-side Validation für Sicherheit
- Email Format Validation
- Password Strength Requirements

## Integration mit Backend

Das Frontend kommuniziert mit dem Firebase Functions Backend:
- ID Token basierte Authentifizierung
- Automatische Token Refresh
- User Profile Synchronisation
- Role-based Access Control

## Deployment

### Vercel Deployment
```bash
# Build für Production
pnpm build

# Vercel Deployment
vercel --prod
```

### Environment Setup
1. Konfigurieren Sie alle Environment Variables in Vercel
2. Stellen Sie sicher, dass Firebase Domains konfiguriert sind
3. Testen Sie die Auth-Flows in Production

## Troubleshooting

### Häufige Probleme
1. **Firebase Config Fehler**: Überprüfen Sie `.env.local` Variablen
2. **Redirect Loops**: Prüfen Sie Auth Guard Konfiguration
3. **CORS Errors**: Konfigurieren Sie Firebase authorized domains
4. **Build Errors**: Stellen Sie sicher, dass alle Dependencies installiert sind

### Debug Mode
```bash
# Development mit Debug Logs
NEXT_PUBLIC_DEBUG=true pnpm dev
```

## Roadmap

### Geplante Features
- [ ] Social Login (Google, Microsoft)
- [ ] Multi-Factor Authentication (MFA)
- [ ] Passwordless Login
- [ ] Session Management Dashboard
- [ ] Advanced User Roles
- [ ] Audit Logging

### Performance Improvements
- [ ] Progressive Web App (PWA) Support
- [ ] Offline Authentication Cache
- [ ] Biometric Authentication
- [ ] WebAuthn Support

---

## Support

Bei Fragen oder Problemen:
1. Überprüfen Sie die Konsole auf Fehler
2. Validieren Sie die Firebase Konfiguration
3. Testen Sie die Backend API Erreichbarkeit
4. Prüfen Sie die Netzwerk-Tabs in den Entwicklertools
