# LexPilot Backend - Firebase Functions

## 🏗️ Architektur Übersicht

Das LexPilot Backend ist als serverlose Lösung mit Firebase Functions implementiert und nutzt moderne Design Patterns für saubere, skalierbare Code-Architektur.

### Projekt-Struktur

```
backend/
├── functions/
│   ├── src/
│   │   ├── config/              # Konfigurationsdateien
│   │   ├── controllers/         # Request Handler (MVC Pattern)
│   │   ├── services/            # Business Logic (Service Layer Pattern)
│   │   ├── repositories/        # Data Access Layer (Repository Pattern)
│   │   ├── factories/           # Factory Pattern Implementierungen
│   │   ├── strategies/          # Strategy Pattern für Analysen
│   │   ├── observers/           # Observer Pattern für Events
│   │   ├── decorators/          # Decorator Pattern für Middleware
│   │   ├── models/              # TypeScript Interfaces & Types
│   │   ├── middleware/          # Express Middleware
│   │   ├── utils/               # Helper Functions (Singleton Pattern für Logger)
│   │   ├── chains/              # LangChain Implementierungen
│   │   ├── agents/              # LangChain Agents
│   │   ├── vectorstore/         # Pinecone Integration (Adapter Pattern)
│   │   ├── websocket/           # WebSocket Handler
│   │   ├── index.ts             # Firebase Functions Entry Point
│   │   └── app.ts               # Express App Setup
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── firestore.rules              # Firestore Security Rules
├── storage.rules                # Storage Security Rules
└── firebase.json                # Firebase Configuration
```

## 🚀 Setup & Installation

### 1. Prerequisites

- Node.js 18+
- Firebase CLI
- OpenAI API Key
- Pinecone Account

### 2. Installation

```bash
# Backend Dependencies installieren
cd backend/functions
npm install

# Firebase CLI installieren (falls nicht vorhanden)
npm install -g firebase-tools

# Firebase Login
firebase login
```

### 3. Environment Configuration

```bash
# Environment Datei erstellen
cp .env.example .env

# Environment Variablen konfigurieren
# Siehe .env.example für alle verfügbaren Optionen
```

### 4. Entwicklung starten

```bash
# TypeScript kompilieren
npm run build

# Firebase Emulators starten
npm run serve

# Alternativ: Watch Mode
npm run build:watch
```

## 🔧 Design Patterns Implementation

### Singleton Pattern - Logger Service
```typescript
// utils/logger.ts
class Logger {
  private static instance: Logger;
  
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }
}
```

### Chain of Responsibility - Error Handling
```typescript
// middleware/errorHandler.ts
abstract class BaseErrorHandler implements IErrorHandler {
  private nextHandler?: IErrorHandler;
  
  public setNext(handler: IErrorHandler): IErrorHandler {
    this.nextHandler = handler;
    return handler;
  }
}
```

### Dependency Injection - Service Container
```typescript
// config/container.ts
import { container } from 'tsyringe';

export const setupDependencyInjection = () => {
  container.registerSingleton<ILogger>('ILogger', Logger);
};
```

## 🔐 Security & Permissions

### Firestore Rules
- Benutzer können nur ihre eigenen Dokumente verwalten
- Admins haben Vollzugriff auf System-Collections
- Geteilte Dokumente basieren auf expliziten Berechtigungen

### Storage Rules
- File-Upload nur für authentifizierte Benutzer
- File-Type und Größen-Validierung
- User-spezifische Ordner-Struktur

## 📊 Monitoring & Analytics

### Logging
- Strukturierte JSON-Logs mit Winston
- User-spezifische Log-Korrelation
- Error Tracking mit Stack Traces

### Usage Tracking
- Token-Usage für alle LLM-Aufrufe
- Kosten-Tracking pro Benutzer
- Performance-Metriken

## 🔄 Firebase Functions

### HTTP Functions
- `api` - Haupt-REST API mit Express.js
- `webhooks` - Externe Service-Integrations

### Callable Functions
- `analyzeDocument` - Sichere Dokument-Analyse
- `generateContract` - KI-basierte Vertragserstellung

### Scheduled Functions
- `dailyMaintenance` - Tägliche Wartungsaufgaben
- `updateLegalDatabase` - Rechtsdatenbank-Synchronisation
- `cleanupOldData` - Datenbereinigung

### Triggers
- `onDocumentCreated` - Automatische Verarbeitung neuer Dokumente
- `onAnalysisCompleted` - Post-Analysis Actions
- `processUploadedDocument` - File-Upload Verarbeitung

## 🌍 Regional Deployment

Alle Functions werden in der Region `europe-west6` (Zürich) deployed:

```typescript
export const api = functions
  .region('europe-west6')
  .runWith({
    memory: '1GB',
    timeoutSeconds: 540
  })
  .https.onRequest(app);
```

## 💰 Kosten-Optimierung

### Cold Start Minimierung
- Globale Variablen für Client-Instanzen
- Lazy Loading für schwere Dependencies
- Connection Pooling

### Batch Processing
- Embedding-Generierung in Batches
- Rate Limiting für API-Aufrufe
- Intelligent Caching

## 🚀 Deployment

### Development
```bash
# Emulators starten
npm run serve
```

### Production
```bash
# Build und Deploy
npm run build
firebase deploy --only functions
```

### Environment-spezifisches Deployment
```bash
# Staging
firebase use staging
firebase deploy --only functions

# Production
firebase use production
firebase deploy --only functions
```

## 📝 API Endpoints

### Health Check
```
GET /health
```

### API Version
```
GET /api/v1/ping
```

## 🔍 Debugging

### Logs anzeigen
```bash
# Alle Logs
firebase functions:log

# Spezifische Function
firebase functions:log --only analyzeDocument

# Echtzeitl Logs
firebase functions:log --follow
```

### Emulator Debugging
- Functions Emulator: http://localhost:5001
- Firestore Emulator: http://localhost:8080  
- Auth Emulator: http://localhost:9099
- Emulator UI: http://localhost:4000

## 🧪 Testing

```bash
# Unit Tests
npm test

# Watch Mode
npm run test:watch
```

## 📚 Nächste Schritte

Nach erfolgreichem Setup von Phase 1.1:

1. **Phase 1.2**: Design Patterns Implementation
   - Repository Pattern für Data Access
   - Factory Pattern für Chain/Agent Erstellung
   - Strategy Pattern für Analyse-Typen
   - Observer Pattern für WebSocket Updates

2. **Phase 1.3**: Firebase Functions Deployment Testing
3. **Phase 2**: Core RAG System mit LangChain
4. **Phase 3**: Frontend Integration
5. **Phase 4**: Monitoring & Analytics

## 🆘 Support

Bei Problemen oder Fragen:
1. Prüfe die Firebase Functions Logs
2. Kontrolliere Environment-Variablen
3. Verifiziere Firebase Projekt-Konfiguration
4. Teste mit Emulators vor Production-Deployment
