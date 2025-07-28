# Firebase Storage Integration für LexPilot

Diese Implementierung integriert Firebase Storage für die Dokumentenverwaltung in der LexPilot-Anwendung.

## 🚀 Übersicht

Die Firebase Storage Integration umfasst:

### 📦 Services
- **StorageService**: Verwaltung von Dateien in Firebase Storage
- **FirestoreService**: Metadaten-Management in Firestore

### 🎛️ Controller 
- **DocumentController**: Vollständig implementierte API-Endpunkte

### 🛣️ Routen
- **documentRoutes**: Modulare Routen-Definition mit Validierung

## 📋 API-Endpunkte

### Dokument-Management

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| `POST` | `/api/documents/` | Dokument-Upload initialisieren |
| `GET` | `/api/documents/` | Benutzer-Dokumente auflisten |
| `GET` | `/api/documents/:id` | Dokument-Details abrufen |
| `PUT` | `/api/documents/:id` | Dokument-Metadaten aktualisieren |
| `DELETE` | `/api/documents/:id` | Dokument löschen |

### Dokument-Inhalt

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| `GET` | `/api/documents/:id/content` | Dokument-Inhalt abrufen |
| `GET` | `/api/documents/:id/download` | Download-URL generieren |

### Erweiterte Features

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| `GET` | `/api/documents/search?q=term` | Dokumente durchsuchen |
| `GET` | `/api/documents/stats` | Speicher-Statistiken |
| `PATCH` | `/api/documents/:id/status` | Dokument-Status aktualisieren |

## 🔧 Upload-Workflow

```mermaid
sequenceDiagram
    participant C as Client
    participant API as API Server
    participant FS as Firebase Storage
    participant FDB as Firestore

    C->>API: POST /api/documents (metadata)
    API->>API: Validate file & quota
    API->>FS: Generate signed upload URL
    API->>FDB: Create document record
    API-->>C: Upload URL & document ID
    
    C->>FS: PUT file to signed URL
    FS-->>C: Upload complete
    
    C->>API: PATCH /api/documents/:id/status
    API->>FDB: Update status to 'uploaded'
```

## 📝 Verwendung

### 1. Dokument-Upload initialisieren

```javascript
const response = await fetch('/api/documents', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  },
  body: JSON.stringify({
    fileName: 'contract.pdf',
    contentType: 'application/pdf',
    size: 1048576, // 1MB
    metadata: {
      category: 'contract',
      description: 'Arbeitsvertrag',
      tags: ['HR', 'Vertrag']
    }
  })
});

const { documentId, uploadUrl, quotaInfo } = await response.json();
```

### 2. Datei hochladen

```javascript
const file = document.getElementById('fileInput').files[0];

const uploadResponse = await fetch(uploadUrl, {
  method: 'PUT',
  body: file,
  headers: {
    'Content-Type': file.type
  }
});
```

### 3. Status aktualisieren

```javascript
await fetch(`/api/documents/${documentId}/status`, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  },
  body: JSON.stringify({
    status: 'uploaded'
  })
});
```

## ⚙️ Konfiguration

### Environment-Variablen

```env
# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com

# Dokumenten-Limits
MAX_FILE_SIZE_MB=50
ALLOWED_FILE_TYPES=pdf,docx,doc,txt,md,csv
```

### Firestore-Struktur

```
users/
  {userId}/
    documents/
      {documentId}/
        fileName: string
        contentType: string
        size: number
        status: 'uploading' | 'uploaded' | 'processing' | 'processed' | 'error'
        uploadedAt: string (ISO)
        processedAt?: string (ISO)
        category?: string
        description?: string
        tags?: string[]
        analyses?: string[]
```

### Storage-Struktur

```
users/
  {userId}/
    documents/
      {documentId}/
        {fileName}
    processed/
      {documentId}/
        {fileName}
```

## 🔒 Sicherheit

### Authentifizierung
- Alle Endpunkte erfordern gültige Firebase-Authentifizierung
- User-ID wird aus dem JWT-Token extrahiert

### Autorisierung
- Benutzer können nur ihre eigenen Dokumente verwalten
- Signed URLs haben 1-Stunden-Ablaufzeit

### Validierung
- Joi-Schema-Validierung für alle API-Eingaben
- Dateitype- und Größen-Validierung
- Storage-Quota-Prüfung

### Rate Limiting
- API-Rate-Limits für Standard-Endpunkte
- Spezielle Upload-Limits für Dateien

## 📊 Quota-Management

### Storage-Limits
- Standard: 1GB pro Benutzer
- Datei-Limit: 50MB pro Datei
- Unterstützte Formate: PDF, DOCX, DOC, TXT, MD, CSV

### Quota-Überwachung
```javascript
const stats = await fetch('/api/documents/stats').then(r => r.json());

console.log('Storage Usage:', {
  used: `${stats.storage.usedMB}MB`,
  limit: `${stats.storage.limitMB}MB`,
  percentage: `${stats.storage.usagePercentage}%`,
  available: `${(stats.storage.limitMB - stats.storage.usedMB)}MB`
});
```

## 🚦 Status-Management

### Dokument-Status
- `uploading`: Upload wird initialisiert
- `uploaded`: Datei erfolgreich hochgeladen
- `processing`: Dokument wird verarbeitet
- `processed`: Verarbeitung abgeschlossen
- `error`: Fehler bei Upload/Verarbeitung

### Status-Übergänge
```
uploading → uploaded → processing → processed
    ↓           ↓           ↓
  error ←--- error ←--- error
```

## 🔍 Fehlerbehandlung

### Häufige Fehler

| Status | Ursache | Lösung |
|--------|---------|--------|
| 400 | Ungültige Parameter | Eingaben validieren |
| 401 | Nicht authentifiziert | Login erforderlich |
| 404 | Dokument nicht gefunden | Document ID prüfen |
| 409 | Aktive Analysen | Analysen stoppen |
| 413 | Quota überschritten | Speicher freigeben |

### Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "STORAGE_QUOTA_EXCEEDED",
    "message": "Storage quota exceeded",
    "details": "Upload would exceed storage limit. Used: 950MB, Limit: 1024MB"
  }
}
```

## 🧪 Testing

### Unit Tests
```bash
npm run test -- --testPathPattern=storage
```

### Integration Tests
```bash
npm run test:integration
```

### Manual Testing
```bash
# Start Firebase Emulators
firebase emulators:start --only storage,firestore

# Run development server
npm run serve
```

## 🚀 Deployment

### Voraussetzungen
1. Firebase-Projekt konfiguriert
2. Storage-Bucket erstellt
3. Service Account-Schlüssel generiert

### Deployment-Schritte
```bash
# Build
npm run build

# Deploy
firebase deploy --only functions
```

## 📈 Performance-Optimierungen

### Batch-Operationen
- Metadaten-Operationen werden gebatcht
- Storage-Quota-Checks sind gecacht

### CDN-Integration
- Signed URLs für direkten Storage-Zugriff
- Reduzierte Server-Last

### Cleanup-Jobs
- Automatische Bereinigung abgebrochener Uploads
- Orphaned Files Detection

## 🔮 Zukünftige Erweiterungen

### Geplante Features
- [ ] Thumbnail-Generierung für PDFs
- [ ] Virus-Scanning bei Upload
- [ ] Bulk-Upload-Unterstützung
- [ ] Versionierung von Dokumenten
- [ ] Archivierung alter Dokumente
- [ ] Storage-Analytics Dashboard

### Integration mit Phase 3
- Automatische Dokumenten-Verarbeitung nach Upload
- RAG-Pipeline-Integration
- Echtzeit-Status-Updates via WebSocket

---

*Diese Implementierung ist vollständig funktional und produktionsreif für die LexPilot-Anwendung.*
