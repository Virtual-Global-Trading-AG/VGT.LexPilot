# Document Upload Funktionalität

## Übersicht

Die Document Upload Funktionalität ermöglicht es Benutzern, Rechtsdokumente (Verträge, PDFs, etc.) hochzuladen und zu verwalten. Die Implementierung nutzt einen mehrstufigen Upload-Prozess mit signed URLs für sicheren Dateitransfer.

## Komponenten

### 1. DocumentService (`/lib/api/documents.ts`)

Der `DocumentService` stellt die API-Schnittstelle für alle dokumentbezogenen Operationen bereit:

#### Hauptfunktionen:
- `uploadDocument()` - Kompletter Upload-Prozess
- `getDocuments()` - Dokumentenliste abrufen
- `searchDocuments()` - Dokumentensuche
- `deleteDocument()` - Dokument löschen
- `getDownloadUrl()` - Download-Link generieren

#### Upload-Prozess:
1. **Initiate Upload**: Anfrage an `/api/documents` mit Metadaten
2. **Upload zu Signed URL**: Datei wird direkt zu Firebase Storage hochgeladen
3. **Status Update**: Dokumentstatus wird auf 'uploaded' gesetzt

### 2. DocumentUpload Component (`/components/features/document-upload.tsx`)

React-Komponente für den Datei-Upload mit Drag & Drop Funktionalität:

#### Features:
- Drag & Drop Interface
- Dateitypvalidierung
- Größenlimitierung
- Upload-Progress anzeige
- Metadaten-Eingabe (Kategorie, Tags, Beschreibung)
- Mehrfach-Upload Unterstützung

#### Props:
```typescript
interface DocumentUploadProps {
  onUploadComplete?: (documentId: string) => void;
  onUploadError?: (error: string) => void;
  acceptedFileTypes?: string[];
  maxFileSize?: number;
  multiple?: boolean;
}
```

### 3. useDocuments Hook (`/lib/hooks/useDocuments.ts`)

React Hook für Document Management:

#### Funktionalität:
- Dokumentenliste laden und verwalten
- Paginierung
- Suche und Filterung
- Upload-Progress tracking
- Optimistische Updates

### 4. Contracts Page (`/app/(private)/contracts/page.tsx`)

Hauptseite für die Vertragsverwaltung:

#### Features:
- Upload-Dialog mit DocumentUpload Component
- Dokumentenliste mit Tabelle
- Suchfunktionalität
- Download und Löschen von Dokumenten
- Toast-Benachrichtigungen

## Backend API Integration

### DocumentController Endpunkte:

- `POST /api/documents` - Upload initialisieren
- `GET /api/documents` - Dokumentenliste
- `GET /api/documents/search` - Dokumentensuche
- `DELETE /api/documents/:id` - Dokument löschen
- `GET /api/documents/:id/download` - Download-URL
- `PATCH /api/documents/:id/status` - Status aktualisieren

### Upload-Flow:

```
1. Frontend → POST /api/documents (Metadaten)
   ← { uploadUrl, documentId, expiresAt }

2. Frontend → PUT uploadUrl (Datei)
   ← 200 OK

3. Frontend → PATCH /api/documents/:id/status
   ← { status: 'uploaded' }
```

## Konfiguration

### Environment Variables:
```
NEXT_PUBLIC_API_URL=http://localhost:5001/project-id/us-central1/api
```

### Unterstützte Dateitypen:
- PDF (.pdf)
- Word Dokumente (.doc, .docx)
- Text Dateien (.txt)

### Limits:
- Maximale Dateigröße: 10MB (konfigurierbar)
- Gleichzeitige Uploads: 1 (kann auf mehrere erweitert werden)

## Toast-Benachrichtigungen

Das System verwendet Radix UI Toast für Benutzerbenachrichtigungen:

- Upload-Erfolg
- Upload-Fehler
- Download-Status
- Löschbestätigungen

## Sicherheit

- Authentifizierte API-Requests mit JWT Tokens
- Signed URLs für sicheren Dateitransfer
- Dateitypvalidierung
- Größenlimitierung
- CORS-Schutz

## Testing

### Manuelle Tests:
1. Upload einer PDF-Datei
2. Upload mehrerer Dateien
3. Drag & Drop Funktionalität
4. Suchfunktionalität
5. Download und Löschen

### Fehlerfälle:
- Ungültiger Dateityp
- Überschreitung der Dateigröße
- Netzwerkfehler
- Authentifizierungsfehler

## Deployment

Die Upload-Funktionalität ist produktionsbereit und integriert sich nahtlos in die bestehende Firebase-Backend-Architektur.

### Nächste Schritte:
1. Document Analysis Integration
2. Batch Upload Funktionalität
3. Resume Upload bei Unterbrechungen
4. Erweiterte Metadaten-Felder
5. Vorschau-Funktionalität
