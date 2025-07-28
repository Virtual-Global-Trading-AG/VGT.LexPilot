# VGT.LexPilot Backend - Strukturübersicht

## 📋 Überblick

Das VGT.LexPilot Backend ist eine moderne, serverlose Anwendung basierend auf Firebase Functions mit TypeScript. Es implementiert eine umfassende Legal-AI-Pipeline mit RAG (Retrieval-Augmented Generation) für die Analyse von Rechtsdokumenten. Die Architektur folgt bewährten Design Patterns und Clean Code Prinzipien.

## 🏗️ Gesamtarchitektur

```
backend/
├── functions/
│   ├── src/                     # Hauptsourcecode
│   │   ├── agents/              # LangChain Agents
│   │   ├── app.ts               # Express App Setup
│   │   ├── chains/              # LangChain Analysis Chains
│   │   ├── config/              # Konfigurationsdateien
│   │   ├── controllers/         # Request Handler (MVC Pattern)
│   │   ├── factories/           # Factory Pattern Implementierungen
│   │   ├── index.ts             # Firebase Functions Entry Point
│   │   ├── middleware/          # Express Middleware
│   │   ├── models/              # TypeScript Interfaces & Types
│   │   ├── observers/           # Observer Pattern für Events
│   │   ├── repositories/        # Data Access Layer (Repository Pattern)
│   │   ├── routes/              # API Route Definitionen
│   │   ├── services/            # Business Logic (Service Layer Pattern)
│   │   ├── strategies/          # Strategy Pattern für Analysen
│   │   ├── utils/               # Helper Functions & Utilities
│   │   ├── vectorstore/         # Vector Database Integration
│   │   └── websocket/           # WebSocket Handler
│   ├── package.json             # Dependencies & Scripts
│   └── tsconfig.json            # TypeScript Konfiguration
├── firebase.json                # Firebase Projekt-Konfiguration
├── firestore.indexes.json       # Firestore Index-Definitionen
├── firestore.rules              # Firestore Security Rules
└── storage.rules                # Storage Security Rules
```

## 📁 Detaillierte Struktur & Funktionalität

### 🚀 **Entry Points**

#### `src/index.ts`
- **Zweck**: Firebase Functions Entry Point
- **Funktionen**: 
  - Cloud Functions Export
  - Regional Deployment (europe-west6)
  - Environment Setup

#### `src/app.ts`
- **Zweck**: Express Application Setup
- **Features**:
  - Security Middleware (Helmet, CORS)
  - Request ID Generation
  - Compression & Performance
  - Error Handling Integration
  - Dependency Injection Setup

### 🎯 **Controllers** (`src/controllers/`)

Implementiert das **MVC Pattern** für saubere Request-Handling.

#### `BaseController.ts`
- **Pattern**: Abstract Base Class
- **Funktionen**:
  - User Authentication Helpers
  - Standardized Response Methods
  - Pagination & Sorting Utilities
  - Field Validation
  - Error Handling Wrapper

#### `AuthController.ts`
- **Zweck**: Benutzer-Authentifizierung
- **Endpoints**:
  - Login/Logout
  - Registration
  - Password Reset
  - Token Refresh
  - Email Verification

#### `UserController.ts`
- **Zweck**: Benutzerverwaltung
- **Features**:
  - Profile Management
  - Settings & Preferences
  - Notification Handling
  - Usage Statistics

#### `DocumentController.ts`
- **Zweck**: Dokumentenverwaltung
- **Funktionen**:
  - File Upload/Download
  - Metadata Management
  - Content Extraction
  - Firebase Storage Integration

#### `AnalysisController.ts`
- **Zweck**: Legal Analysis Orchestration
- **Features**:
  - Analysis Creation & Management
  - Progress Tracking
  - Result Retrieval
  - Export Functionality

#### `AdminController.ts`
- **Zweck**: Admin Panel Funktionalität
- **Capabilities**:
  - System Statistics
  - User Management
  - Health Monitoring
  - Audit Logs

### 🔧 **Services** (`src/services/`)

Implementiert das **Service Layer Pattern** für Business Logic.

#### `AnalysisService.ts`
- **Zweck**: RAG-Pipeline Orchestration
- **Hauptfunktionen**:
  - Document Processing
  - Text Chunking & Embedding
  - Analysis Chain Execution
  - Progress Monitoring
  - Result Storage

#### `StorageService.ts`
- **Zweck**: Firebase Storage Management
- **Features**:
  - Secure File Upload
  - Signed URL Generation
  - User Namespace Management
  - File Type Validation

#### `FirestoreService.ts`
- **Zweck**: Database Operations
- **Funktionen**:
  - CRUD Operations
  - Query Optimization
  - Transaction Handling
  - Data Validation

#### `EmbeddingService.ts`
- **Zweck**: Vector Embedding Generation
- **Features**:
  - Text-to-Vector Conversion
  - Multiple Model Support
  - Batch Processing
  - Caching Mechanism

### 🛠️ **Middleware** (`src/middleware/`)

#### `authMiddleware.ts`
- **Zweck**: Firebase Authentication
- **Features**:
  - JWT Token Verification
  - User Role Validation
  - Admin/Premium Checks
  - Request Enrichment

#### `rateLimitMiddleware.ts`
- **Zweck**: DDoS Protection
- **Limiter Types**:
  - API Rate Limiting
  - Analysis Rate Limiting
  - Premium User Limits
  - Admin Panel Limits

#### `validationMiddleware.ts`
- **Zweck**: Request Validation
- **Features**:
  - Joi Schema Validation
  - 15+ Validation Schemas
  - Error Standardization
  - Type Safety

#### `errorHandler.ts`
- **Pattern**: Chain of Responsibility
- **Funktionen**:
  - Structured Error Responses
  - Logging Integration
  - Security Error Filtering

### 🔗 **Chains** (`src/chains/`)

Implementiert **LangChain** für AI-Analysen.

#### `BaseChain.ts`
- **Pattern**: Abstract Base Class
- **Features**:
  - Common Chain Logic
  - Progress Tracking
  - Error Handling
  - Result Formatting

#### `ContractAnalysisChain.ts`
- **Zweck**: Vertragsanalyse
- **Methodik**: IRAC (Issue → Rule → Application → Conclusion)
- **Features**:
  - Schweizer Rechts-spezifische Prompts
  - Risk Assessment
  - Structured JSON Output
  - Multi-language Support

#### `GDPRComplianceChain.ts`
- **Zweck**: DSGVO Compliance Checking
- **4-Stufen Analyse**:
  - Datenminimierung (DSGVO Art. 5)
  - Rechtsgrundlagen-Prüfung
  - Einwilligungsmechanismen
  - Betroffenenrechte
- **Output**: Risk-Level Bewertung + Handlungsempfehlungen

### 🏭 **Factories** (`src/factories/`)

Implementiert das **Factory Pattern**.

#### `LLMFactory.ts`
- **Zweck**: AI Model Instantiation
- **Unterstützte Models**:
  - OpenAI GPT-4/3.5
  - Anthropic Claude
  - Local Models
- **Features**:
  - Model Configuration
  - Cost Optimization
  - Fallback Strategies

#### `ChainFactory.ts`
- **Zweck**: Analysis Chain Creation
- **Features**:
  - Dynamic Chain Selection
  - Configuration Management
  - Chain Composition

### 📊 **Repositories** (`src/repositories/`)

Implementiert das **Repository Pattern** für Data Access.

#### `BaseRepository.ts`
- **Pattern**: Abstract Base Class
- **Features**:
  - CRUD Operations
  - Query Building
  - Error Handling
  - Type Safety

#### `DocumentRepository.ts`
- **Zweck**: Document Data Access
- **Operations**:
  - Document CRUD
  - Metadata Queries
  - User-based Filtering
  - Search Functionality

#### `AnalysisRepository.ts`
- **Zweck**: Analysis Data Management
- **Features**:
  - Analysis Tracking
  - Result Storage
  - Progress Updates
  - History Management

#### `UserRepository.ts`
- **Zweck**: User Data Operations
- **Functions**:
  - Profile Management
  - Settings Storage
  - Usage Tracking
  - Role Management

### 🎲 **Strategies** (`src/strategies/`)

Implementiert das **Strategy Pattern**.

#### `LegalDocumentSplitter.ts`
- **Zweck**: Intelligent Document Chunking
- **Strategien**:
  - Hierarchical Splitting
  - Legal Structure Recognition
  - Context Preservation
  - Chunk Optimization

### 👁️ **Observers** (`src/observers/`)

Implementiert das **Observer Pattern**.

#### `AnalysisProgressObserver.ts`
- **Zweck**: Real-time Progress Updates
- **Features**:
  - WebSocket Notifications
  - Email Alerts
  - Database Updates
  - Error Notifications

### 🔗 **Routes** (`src/routes/`)

RESTful API Route Definitionen.

#### Route-Gruppen:
- **`/auth`** - Authentication (8 Endpoints)
- **`/users`** - User Management (10 Endpoints)
- **`/documents`** - Document Operations (7 Endpoints)
- **`/analysis`** - Analysis Management (8 Endpoints)
- **`/admin`** - Admin Panel (13 Endpoints)
- **`/premium`** - Premium Features (5 Endpoints)

### 🛠️ **Utils** (`src/utils/`)

#### `logger.ts`
- **Pattern**: Singleton
- **Features**:
  - Winston Integration
  - Multiple Transport Support
  - Structured Logging
  - User Context Tracking
  - Error Aggregation

### 🗂️ **Models** (`src/models/`)

TypeScript Interface & Type Definitionen für:
- User Models
- Document Models
- Analysis Models
- Request/Response Types
- Configuration Types

### ⚙️ **Config** (`src/config/`)

#### `environment.ts`
- **Zweck**: Environment Variable Management
- **Features**:
  - Zod Schema Validation
  - Type-safe Configuration
  - Default Values
  - Error Handling

#### `container.ts`
- **Pattern**: Dependency Injection
- **Features**:
  - Service Registration
  - Singleton Management
  - Interface Binding

### 🌐 **WebSocket** (`src/websocket/`)

Real-time Communication für:
- Analysis Progress Updates
- Live Notifications
- Chat Support
- System Status

### 🔍 **Vector Store** (`src/vectorstore/`)

Vector Database Integration für:
- Document Embeddings
- Semantic Search
- Similar Document Finding
- Content Recommendation

## 🔐 Security Features

### **Authentifizierung**
- Firebase Auth Integration
- JWT Token Validation
- Role-based Access Control (RBAC)
- Multi-factor Authentication Support

### **Autorisierung**
- Resource-level Permissions
- User/Premium/Admin Roles
- Rate Limiting per User Type
- API Key Management

### **Data Protection**
- Input Sanitization
- SQL Injection Prevention
- XSS Protection
- CSRF Protection
- Data Encryption at Rest

## 📈 **Performance Optimizations**

### **Caching**
- Redis Integration
- Response Caching
- Embedding Caching
- Query Result Caching

### **Database**
- Firestore Index Optimization
- Query Performance Monitoring
- Connection Pooling
- Batch Operations

### **Storage**
- CDN Integration
- File Compression
- Lazy Loading
- Streaming Downloads

## 🔍 **Monitoring & Observability**

### **Logging**
- Structured JSON Logging
- Error Aggregation
- Performance Metrics
- User Activity Tracking

### **Metrics**
- Response Time Monitoring
- Error Rate Tracking
- Resource Usage Metrics
- Business KPIs

### **Health Checks**
- Database Connectivity
- External Service Status
- Memory Usage
- CPU Performance

## 🚀 **Deployment**

### **Firebase Functions**
- Regional Deployment (europe-west6)
- Automatic Scaling
- Cold Start Optimization
- Memory Configuration

### **Environment Management**
- Development/Staging/Production
- Environment Variable Management
- Secret Management
- Configuration Validation

## 📊 **API Endpoints Übersicht**

| Route Group | Endpoints | Authentifizierung | Rate Limit |
|-------------|-----------|-------------------|------------|
| `/auth` | 8 | Teilweise | Standard |
| `/users` | 10 | Erforderlich | Standard |
| `/documents` | 7 | Erforderlich | Standard |
| `/analysis` | 8 | Erforderlich | Dynamisch |
| `/admin` | 13 | Admin | Erhöht |
| `/premium` | 5 | Premium | Erhöht |

**Gesamt: 51+ API Endpoints**

## 🔧 **Design Patterns Verwendung**

| Pattern | Implementierung | Zweck |
|---------|----------------|-------|
| **Singleton** | Logger, Config | Globale Instanzen |
| **Factory** | LLM, Chain Creation | Objekterstellung |
| **Repository** | Data Access | Datenkapselung |
| **Strategy** | Document Processing | Algorithmus-Variation |
| **Observer** | Progress Updates | Event Notification |
| **Chain of Responsibility** | Error Handling | Request Processing |
| **Dependency Injection** | Service Container | Loose Coupling |
| **MVC** | Controller Structure | Separation of Concerns |

## 🎯 **Nächste Schritte**

1. **Testing Implementation**
   - Unit Tests für alle Services
   - Integration Tests für API
   - End-to-End Tests

2. **Performance Optimierung**
   - Database Query Optimization
   - Caching Implementation
   - Bundle Size Reduction

3. **Feature Enhancement**
   - Multi-language Support
   - Advanced Analytics
   - Batch Processing

4. **Monitoring Enhancement**
   - APM Integration
   - Custom Dashboards
   - Alert Systems

## 📝 **Fazit**

Das VGT.LexPilot Backend stellt eine robuste, skalierbare und sichere Plattform für Legal-AI-Services dar. Die modulare Architektur mit bewährten Design Patterns ermöglicht einfache Wartung, Testing und Erweiterung. Die Integration von Firebase Services bietet eine serverlose, kosteneffiziente Lösung mit automatischer Skalierung.
