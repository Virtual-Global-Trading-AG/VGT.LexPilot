# Firebase Authentication Implementation

Diese Implementierung bietet eine vollständige Firebase Authentication-Lösung für das VGT.LexPilot Backend.

## Übersicht

Die Authentifizierungs-Implementierung besteht aus folgenden Komponenten:

### 1. AuthController (`/src/controllers/AuthController.ts`)

Der AuthController implementiert die gesamte Authentifizierungs-Business-Logik:

- **Login**: Benutzer-Anmeldung mit E-Mail und Passwort
- **Register**: Neue Benutzer-Registrierung mit Profilerstellung
- **Logout**: Sichere Abmeldung mit Token-Widerruf
- **Token Refresh**: Automatische Token-Erneuerung
- **Password Reset**: Passwort-Reset-Funktionalität
- **Change Password**: Passwort-Änderung für authentifizierte Benutzer
- **Get Current User**: Abrufen des aktuellen Benutzerprofils
- **Email Verification**: E-Mail-Verifizierung (Client-seitig)

### 2. Auth Routes (`/src/routes/authRoutes.ts`)

Zentrale Route-Konfiguration für alle Authentifizierungs-Endpunkte:

#### Öffentliche Endpunkte (keine Authentifizierung erforderlich):
- `POST /api/auth/login` - Benutzer-Anmeldung
- `POST /api/auth/register` - Benutzer-Registrierung
- `POST /api/auth/refresh` - Token-Erneuerung
- `POST /api/auth/reset-password` - Passwort-Reset anfordern
- `POST /api/auth/verify-email` - E-Mail-Verifizierung
- `POST /api/auth/check-email` - E-Mail-Verfügbarkeit prüfen
- `GET /api/auth/health` - Service-Status

#### Geschützte Endpunkte (Authentifizierung erforderlich):
- `POST /api/auth/logout` - Benutzer-Abmeldung
- `GET /api/auth/me` - Aktuelles Benutzerprofil abrufen
- `POST /api/auth/change-password` - Passwort ändern

### 3. Integration

Die Authentication Routes wurden vollständig in die Haupt-Router-Konfiguration integriert:

```typescript
// In /src/routes/index.ts
import { createAuthRoutes } from './authRoutes';

// Integration der Auth-Routes
router.use('/auth', createAuthRoutes());
```

Die alte auth-Logik wurde vollständig aus der `index.ts` entfernt und durch die neue modulare Struktur ersetzt.

## Funktionen im Detail

### Benutzer-Registrierung
- Erstellt Firebase Auth-Benutzer
- Generiert Firestore-Profil mit Standard-Einstellungen
- Erstellt E-Mail-Verifizierungslink
- Unterstützt optionale Profilinformationen (Name, etc.)

### Benutzer-Anmeldung
- Verwendet Firebase REST API für sicheren Login
- Validiert Credentials
- Erstellt/aktualisiert Benutzer in Firestore
- Verfolgt Login-Zeiten
- Gibt ID-Token und Refresh-Token zurück

### Token-Verwaltung
- Automatische Token-Erneuerung über Refresh-Token
- Sichere Token-Validierung
- Token-Widerruf bei Logout
- Integriert mit AuthMiddleware

### Passwort-Verwaltung
- Sichere Passwort-Reset-Funktionalität
- Passwort-Änderung für authentifizierte Benutzer
- Automatischer Token-Widerruf nach Passwort-Änderung

## Sicherheitsfeatures

### Validierung
- Umfassende Input-Validierung mit Joi
- E-Mail-Format-Validierung
- Passwort-Längen-Anforderungen
- Sichere Error-Handling

### Rate Limiting
- Alle Auth-Endpunkte sind rate-limited
- Schutz vor Brute-Force-Angriffen
- Unterschiedliche Limits für verschiedene Endpunkt-Typen

### Logging
- Vollständiges Audit-Log für alle Auth-Aktionen
- Sicherheits-relevante Events werden geloggt
- Sichere Log-Outputs (keine Passwörter)

## Environment Konfiguration

Die folgenden Environment-Variablen sind erforderlich:

```env
# Firebase Configuration
PROJECT_ID=your-project-id
PRIVATE_KEY=your-private-key
CLIENT_EMAIL=your-client-email
API_KEY=your-web-api-key

# Security
JWT_SECRET=your-jwt-secret
ENCRYPTION_KEY=your-encryption-key
```

## Firebase REST API Integration

Der AuthController verwendet die Firebase REST API für:
- `signInWithEmailAndPassword` - Sicherer Login
- `refreshIdToken` - Token-Erneuerung

Dies ermöglicht server-seitige Authentifizierung ohne Client-SDK-Abhängigkeiten.

## Integration mit bestehenden Middleware

### AuthMiddleware
- Nahtlose Integration mit bestehender AuthMiddleware
- Unterstützt alle bestehenden Authentifizierungs-Features
- Kompatibel mit Admin/Premium-Rollen

### ValidationMiddleware
- Vollständige Validierung aller Eingaben
- Konsistente Error-Responses
- Internationalisierte Fehlermeldungen

### RateLimitMiddleware
- Schutz vor Missbrauch
- Konfigurierbare Limits
- Auth-spezifische Rate-Limiting-Regeln

## Firestore Integration

### Benutzer-Profil-Struktur
```typescript
{
  uid: string,
  email: string,
  emailVerified: boolean,
  displayName: string,
  firstName: string,
  lastName: string,
  company: string,
  phone: string,
  role: 'user' | 'premium' | 'admin',
  status: 'active' | 'suspended' | 'banned',
  preferences: {
    language: string,
    timezone: string,
    notifications: object
  },
  subscription: {
    type: 'free' | 'premium',
    expiresAt: Date | null
  },
  usage: object,
  statistics: object,
  createdAt: string,
  updatedAt: string,
  lastLogin: string
}
```

### Automatische Profil-Synchronisation
- Bei Login wird das Firestore-Profil automatisch mit Firebase Auth synchronisiert
- Neue Benutzer erhalten automatisch ein vollständiges Profil
- Benutzer-Statistiken werden automatisch verfolgt

## Error Handling

Umfassende Fehlerbehandlung für:
- Ungültige Credentials
- Bestehende E-Mail-Adressen
- Netzwerk-Fehler
- Token-Validierung
- Firebase-Service-Fehler

Alle Fehler werden sicher geloggt und benutzerfreundlich zurückgegeben.

## Deployment Hinweise

### Production Überlegungen
1. **E-Mail-Verifizierung**: Client-seitige Implementierung erforderlich
2. **E-Mail-Service**: Integration mit echtem E-Mail-Provider für Reset-Links
3. **API-Keys**: Sichere Speicherung in Environment-Variablen
4. **Rate-Limiting**: Produktions-gerechte Limits konfigurieren
5. **Monitoring**: Auth-Events für Sicherheits-Monitoring verwenden

### Testing
- Unit Tests für alle Controller-Methoden
- Integration Tests für Auth-Flow
- Security Tests für Rate-Limiting und Validation

Diese Implementierung bietet eine robuste, sichere und skalierbare Authentifizierungs-Lösung, die vollständig in das bestehende VGT.LexPilot-System integriert ist.
