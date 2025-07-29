# LexPilot Deployment Guide

## Übersicht

Dieser Leitfaden führt Sie durch die Bereitstellung von LexPilot auf Firebase Functions mit einer vollständig integrierten RAG-Pipeline.

## Voraussetzungen

### 1. Software-Anforderungen
- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Firebase CLI >= 12.0.0
- Git

### 2. Konten & Services
- Firebase-Projekt mit aktivierten Services:
  - Authentication
  - Firestore Database
  - Cloud Storage
  - Cloud Functions
- OpenAI API-Konto
- Pinecone-Konto
- (Optional) Sentry für Error-Tracking

## Umgebungskonfiguration

### 1. Environment-Datei erstellen

```bash
cd backend/functions
cp .env.example .env
```

### 2. Umgebungsvariablen konfigurieren

Bearbeiten Sie die `.env`-Datei mit Ihren spezifischen Werten:

#### Firebase-Konfiguration
```env
# Firebase Project ID von der Firebase Console
PROJECT_ID=ihr-firebase-projekt-id

# Firebase Service Account (von Firebase Console > Projekteinstellungen > Dienstkonten)
PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nIhr Private Key\n-----END PRIVATE KEY-----\n"
CLIENT_EMAIL=firebase-adminsdk-xxxxx@ihr-projekt.iam.gserviceaccount.com

# Firebase Storage Bucket
STORAGE_BUCKET=ihr-projekt.appspot.com
```

**Wichtig:** Der `PRIVATE_KEY` muss korrekt escapt sein. Ersetzen Sie Zeilenumbrüche durch `\n`.

#### OpenAI-Konfiguration
```env
# Von https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Empfohlene Modelle
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Optional: Organisation ID
OPENAI_ORGANIZATION_ID=org-xxxxxxxxxxxxxxxxxxxxxxxx
```

#### Pinecone-Konfiguration
```env
# Von https://app.pinecone.io/
PINECONE_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
PINECONE_ENVIRONMENT=gcp-starter
PINECONE_INDEX_NAME=lexilot-legal-docs
```

### 3. Pinecone Index erstellen

```bash
# Verwenden Sie die Pinecone CLI oder das Dashboard
# Index-Konfiguration:
# - Dimensionen: 1536 (für text-embedding-3-small)
# - Metrik: cosine
# - Pod Type: s1.x1 (für Starter)
```

## Firebase-Setup

### 1. Firebase CLI installieren und anmelden

```bash
npm install -g firebase-tools
firebase login
```

### 2. Firebase-Projekt auswählen

```bash
cd backend
firebase use --add
# Wählen Sie Ihr Projekt aus der Liste
```

### 3. Firebase-Konfiguration überprüfen

Bearbeiten Sie `firebase.json`:

```json
{
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "ignore": [
        "node_modules",
        ".git",
        "firebase-debug.log",
        "firebase-debug.*.log",
        "*.local"
      ],
      "runtime": "nodejs18",
      "memory": "1GB",
      "timeout": "540s",
      "region": "europe-west6"
    }
  ],
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "storage": {
    "rules": "storage.rules"
  }
}
```

## Deployment-Prozess

### 1. Dependencies installieren

```bash
cd backend/functions
pnpm install
```

### 2. TypeScript kompilieren

```bash
pnpm run build
```

### 3. Tests ausführen (optional)

```bash
pnpm run test
```

### 4. Environment-Variablen zu Firebase übertragen

```bash
# Alle Variablen aus .env übertragen
firebase functions:config:set \
  openai.api_key="$(grep OPENAI_API_KEY .env | cut -d '=' -f2)" \
  openai.model="$(grep OPENAI_MODEL .env | cut -d '=' -f2)" \
  pinecone.api_key="$(grep PINECONE_API_KEY .env | cut -d '=' -f2)" \
  pinecone.environment="$(grep PINECONE_ENVIRONMENT .env | cut -d '=' -f2)" \
  pinecone.index_name="$(grep PINECONE_INDEX_NAME .env | cut -d '=' -f2)"

# Oder einzeln:
firebase functions:config:set openai.api_key="sk-your-key"
firebase functions:config:set pinecone.api_key="your-pinecone-key"
```

### 5. Firestore Rules & Indexes deployen

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

### 6. Storage Rules deployen

```bash
firebase deploy --only storage
```

### 7. Functions deployen

```bash
firebase deploy --only functions
```

## Post-Deployment Konfiguration

### 1. Frontend-Umgebung konfigurieren

Aktualisieren Sie die Frontend-Konfiguration mit der deployed Function URL:

```env
# frontend/.env.local
NEXT_PUBLIC_API_BASE_URL=https://europe-west6-ihr-projekt.cloudfunctions.net/api
NEXT_PUBLIC_PROJECT_ID=ihr-firebase-projekt-id
```

### 2. CORS konfigurieren

Fügen Sie Ihre Frontend-Domain zu den CORS-Einstellungen hinzu:

```typescript
// In functions/src/app.ts
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'https://ihr-frontend-domain.com',
    'https://ihr-projekt.web.app' // Falls Sie Firebase Hosting verwenden
  ],
  credentials: true
};
```

### 3. Firestore Security Rules

Überprüfen Sie und aktualisieren Sie `firestore.rules`:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users können nur ihre eigenen Daten lesen/schreiben
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Documents gehören zu einem User
    match /documents/{docId} {
      allow read, write: if request.auth != null && 
        request.auth.uid == resource.data.userId;
    }
    
    // Analyses gehören zu einem User
    match /analyses/{analysisId} {
      allow read, write: if request.auth != null && 
        request.auth.uid == resource.data.userId;
    }
  }
}
```

## Monitoring & Debugging

### 1. Logs anzeigen

```bash
# Alle Function Logs
firebase functions:log

# Nur Fehler
firebase functions:log --only-errors

# Spezifische Function
firebase functions:log --only api
```

### 2. Performance Monitoring

```bash
# Firebase Performance Monitoring aktivieren
firebase deploy --only functions --debug
```

### 3. Error Tracking mit Sentry

Falls Sentry konfiguriert ist:

```bash
# Sentry DSN zu Firebase Config hinzufügen
firebase functions:config:set sentry.dsn="your-sentry-dsn"
```

## Troubleshooting

### Häufige Probleme

#### 1. Memory/Timeout Errors
```bash
# Memory erhöhen in firebase.json
"memory": "2GB"
"timeout": "540s"
```

#### 2. Environment Variables nicht verfügbar
```bash
# Config überprüfen
firebase functions:config:get

# Neu deployen
firebase deploy --only functions
```

#### 3. CORS Errors
- Frontend-Domain in corsOptions hinzufügen
- Functions neu deployen

#### 4. Pinecone Connection Issues
- API Key und Environment überprüfen
- Index-Existenz in Pinecone Dashboard verifizieren

#### 5. OpenAI Rate Limits
- Rate Limiting in der Anwendung implementiert
- Monitoring der Token-Usage aktivieren

### Debug-Modus aktivieren

```bash
# Debug-Flags in .env setzen
DEBUG_CHAINS=true
DEBUG_EMBEDDINGS=true
DEBUG_STORAGE=true

# Neu deployen
firebase deploy --only functions
```

## Sicherheit

### 1. API Keys schützen
- Niemals API Keys in den Code committen
- Firebase Functions Config für Production verwenden
- Environment Variables für Development

### 2. Rate Limiting
- Implementiert für OpenAI API Calls
- User-basierte Rate Limits aktiv
- Monitoring der API-Usage

### 3. Input Validation
- Joi-basierte Validierung aller Inputs
- File-Type und Size Validation
- Sanitization von User-Inputs

## Skalierung

### 1. Function Limits
- Max. Instanzen: 1000 (konfigurierbar)
- Memory: 1GB-8GB
- Timeout: max. 540s

### 2. Database Skalierung
- Firestore: Automatische Skalierung
- Composite Indexes für komplexe Queries

### 3. Storage Skalierung
- Firebase Storage: Unbegrenzt
- CDN für globale Verteilung

## Wartung

### 1. Updates
```bash
# Dependencies aktualisieren
pnpm update

# Security Updates
pnpm audit fix

# Neu deployen
firebase deploy --only functions
```

### 2. Backup
- Firestore: Automatische Backups aktivieren
- Storage: Versioning aktivieren

### 3. Monitoring
- Firebase Analytics
- Custom Metrics für RAG-Pipeline
- Cost Monitoring

## Support

Bei Problemen:
1. Firebase Console für Logs überprüfen
2. Sentry Dashboard für Errors
3. Pinecone Dashboard für Vector Store Status
4. OpenAI Usage Dashboard für Token-Consumption

---

**Wichtig:** Stellen Sie sicher, dass alle API Keys sicher aufbewahrt und regelmäßig rotiert werden.
