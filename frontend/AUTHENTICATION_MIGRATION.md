# Frontend Authentication Migration

## Überblick

Das Frontend wurde von direkter Firebase-Authentifizierung auf Backend-API-basierte Authentifizierung umgestellt. Dies bietet bessere Kontrolle, Sicherheit und Integration mit der Backend-Logik.

## Wichtige Änderungen

### 1. Neue API-basierte Authentication (`/lib/api/auth.ts`)

**Ersetzt**: `/lib/firebase/auth.ts`

**Neue Features**:
- Backend-API Integration anstelle direkter Firebase Auth
- Automatisches Token-Refresh
- Lokale Token-Speicherung (localStorage)
- Retry-Logik für 401-Fehler
- Vollständige TypeScript-Typisierung

**API-Endpunkte**:
```typescript
// Login
await AuthService.signIn({ email, password });

// Registration
await AuthService.register({ email, password, displayName });

// Logout
await AuthService.signOut();

// Password Reset
await AuthService.resetPassword(email);

// Get Current User
await AuthService.getCurrentUser();

// Change Password
await AuthService.changePassword(currentPassword, newPassword);
```

### 2. Aktualisierter Auth Store (`/lib/stores/authStore.ts`)

**Wichtige Änderungen**:
- Entfernung der Firebase Auth State Listener
- Integration mit Backend-API
- Automatische Token-Verwaltung
- Verbessertes Error Handling
- Zusätzliche `accessToken` State

**Neue Store-Methoden**:
```typescript
const authStore = useAuthStore();

// Neuer async initialize
await authStore.initialize();

// Token refresh
await authStore.refreshAuth();

// Password change
await authStore.changePassword(current, new);
```

### 3. API Client (`/lib/api/client.ts`)

**Neue zentrale API-Client-Klasse**:
- Automatische Authentifizierung für alle Requests
- Built-in Token-Refresh
- File Upload mit Progress
- File Download
- Vollständige Error Handling

**Usage**:
```typescript
import apiClient from '@/lib/api/client';

// GET Request
const response = await apiClient.get('/users/profile');

// POST Request
const result = await apiClient.post('/documents/analyze', data);

// File Upload mit Progress
const upload = await apiClient.uploadFile('/documents/upload', file, 
  (progress) => console.log(`${progress}%`)
);
```

### 4. React Hooks für API Operations (`/lib/hooks/useApi.ts`)

**Neue Hooks für RAG-Funktionalität**:

#### Document Analysis Hook
```typescript
const { analyzeContractWithRAG, checkDSGVOCompliance, loading, error } = useDocumentAnalysis();

// RAG-enhanced Contract Analysis
const result = await analyzeContractWithRAG(documentId, {
  legalArea: 'Arbeitsrecht',
  jurisdiction: 'CH',
  language: 'de'
});

// DSGVO Compliance Check
const compliance = await checkDSGVOCompliance({
  text: 'Privacy policy text...',
  saveResults: true,
  language: 'de'
});
```

#### Document Upload Hook
```typescript
const { uploadDocument, uploading, uploadProgress, error } = useDocumentUpload();

const result = await uploadDocument(file, {
  title: 'Contract XYZ',
  category: 'legal'
});
```

#### Admin Operations Hook
```typescript
const { indexLegalTexts, getVectorStoreStats, isAdmin } = useAdminOperations();

// Index Legal Texts (Admin only)
await indexLegalTexts([
  {
    content: 'Art. 1 OR...',
    title: 'Obligationenrecht Art. 1',
    source: 'OR-Art-1',
    jurisdiction: 'CH',
    legalArea: 'Vertragsrecht'
  }
]);
```

### 5. Real-time Progress Updates (`/lib/hooks/useProgress.ts`)

**Firestore-basierte Progress Updates**:
```typescript
const { progress, message, isComplete, result } = useAnalysisProgress(requestId);

// Analysis History
const { analyses, loading } = useAnalysisHistory();

// Document Processing Progress
const { uploadProgress, processingProgress, status } = useDocumentProgress(documentId);
```

## Migration Steps

### 1. Environment Variables

Aktualisieren Sie Ihre `.env.local`:

```bash
# API Base URL
NEXT_PUBLIC_API_URL=http://localhost:5001/your-project/us-central1/api

# Firebase (für Firestore Real-time Updates)
NEXT_PUBLIC_API_KEY=your-api-key
NEXT_PUBLIC_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_PROJECT_ID=your-project
```

### 2. Komponenten-Updates

**Alte Login-Komponente**:
```typescript
// Alt: Firebase Auth
import { signInWithEmailAndPassword } from 'firebase/auth';
const userCredential = await signInWithEmailAndPassword(auth, email, password);
```

**Neue Login-Komponente**:
```typescript
// Neu: Auth Store
import { useAuthStore } from '@/lib/stores/authStore';
const signIn = useAuthStore(state => state.signIn);
const success = await signIn(email, password);
```

### 3. API Calls Migration

**Alt**:
```typescript
// Manual fetch mit Firebase Token
const idToken = await user.getIdToken();
const response = await fetch('/api/documents', {
  headers: { Authorization: `Bearer ${idToken}` }
});
```

**Neu**:
```typescript
// Automatisch authentifiziert
import apiClient from '@/lib/api/client';
const response = await apiClient.get('/documents');
```

### 4. Progress Updates Migration

**Alt**:
```typescript
// WebSocket oder Polling
const socket = new WebSocket('ws://...');
socket.onmessage = (event) => {
  const progress = JSON.parse(event.data);
};
```

**Neu**:
```typescript
// Firestore Real-time
const { progress, message } = useAnalysisProgress(requestId);
// Automatisch real-time updates
```

## Vorteile der Migration

### 1. Bessere Sicherheit
- Tokens werden backend-seitig validiert
- Refresh-Token-Rotation
- Rate Limiting auf API-Ebene

### 2. Verbesserte UX
- Automatisches Token-Refresh
- Seamless Session Management
- Real-time Progress Updates

### 3. Entwickler-Freundlichkeit
- Zentrale API-Client-Klasse
- TypeScript-Typisierung
- React Hooks für häufige Operationen

### 4. Performance
- Token-Caching
- Request-Retry-Logik
- Batch-Operations Support

## Troubleshooting

### 1. "Session expired" Errors
- Prüfen Sie die Token-Expiration-Zeit im Backend
- Sicherstellen, dass Refresh-Token korrekt gespeichert werden

### 2. CORS Issues
- Backend CORS-Konfiguration prüfen
- Sicherstellen, dass API-URL korrekt konfiguriert ist

### 3. Real-time Updates funktionieren nicht
- Firebase Firestore Rules prüfen
- Sicherstellen, dass User authenticated ist

### 4. API Requests schlagen fehl
- Network Tab in DevTools prüfen
- Backend-Logs für Fehlerdetails

## Testing

### 1. Unit Tests
```typescript
// Test für Auth Store
import { useAuthStore } from '@/lib/stores/authStore';

test('should sign in user', async () => {
  const store = useAuthStore.getState();
  const result = await store.signIn('test@example.com', 'password');
  expect(result).toBe(true);
  expect(store.isAuthenticated).toBe(true);
});
```

### 2. Integration Tests
```typescript
// Test für API Client
import apiClient from '@/lib/api/client';

test('should make authenticated request', async () => {
  const response = await apiClient.get('/auth/me');
  expect(response.success).toBe(true);
});
```

Die Migration ist vollständig rückwärtskompatibel und kann schrittweise implementiert werden. Alle bestehenden Firebase-Features (Firestore, Storage) bleiben unverändert.
