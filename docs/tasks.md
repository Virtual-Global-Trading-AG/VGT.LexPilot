# LexPilot AI - Detaillierte Implementierungs-TODO-Liste

## 🏗️ Phase 1: Projekt-Setup und Infrastruktur

### 1.1 Backend-Grundstruktur (Node.js + TypeScript + Firebase Functions)
```bash
# Projektstruktur mit Design Patterns
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

**TODO:**
- [x] Firebase Functions mit TypeScript initialisieren
- [x] Express.js in Firebase Functions integrieren
- [x] Dependency Injection Container (Singleton Pattern für Logger)
- [x] Logger Service als Singleton implementieren:
  ```typescript
  class Logger {
    private static instance: Logger;
    private winston: Winston.Logger;
    
    constructor() {
      this.winston = winston.createLogger({...});
    }
    
    static getInstance(): Logger {
      if (!Logger.instance) {
        Logger.instance = new Logger();
      }
      return Logger.instance;
    }
  }
  ```
- [x] Error Handling mit Chain of Responsibility Pattern
- [x] Environment-basierte Konfiguration für Firebase Functions

## ✅ Schritt 1.1 ABGESCHLOSSEN!

Das Backend-Setup ist erfolgreich implementiert mit:
- ✅ Vollständige Projektstruktur mit Design Patterns
- ✅ Firebase Functions mit TypeScript (Node.js 18)
- ✅ Express.js App mit Security Middleware
- ✅ Singleton Logger mit Winston
- ✅ Chain of Responsibility Error Handling
- ✅ Dependency Injection vorbereitet
- ✅ Firestore & Storage Security Rules
- ✅ Environment-Konfiguration mit Zod-Validation
- ✅ Regionales Deployment (europe-west6)
- ✅ Alle Dependencies installiert und Build erfolgreich

### 1.1 Frontend-Grundstruktur (Next.js 14)
Projektstruktur

frontend/src/
├── app/                # App Router
│   ├── (auth)/         # Auth-geschützte Routes
│   ├── (public)/       # Öffentliche Routes
│   └── api/            # API Routes
├── components/
│   ├── ui/             # Shadcn UI Components
│   ├── features/       # Feature-spezifische Components
│   └── layouts/        # Layout Components
├── lib/
│   ├── hooks/          # Custom React Hooks
│   ├── utils/          # Helper Functions
│   └── firebase/       # Firebase Client
└── types/              # TypeScript Types

TODO:

- [x] Next.js (neuste Version) mit App Router initialisieren
- [x] Tailwind CSS 4 konfigurieren
- [x] Theme anpassen (Darkmode hinzufügen)
- [x] TypeScript Strict Mode aktivieren
- [x] Zustand für State Management
- [x] React Query für Server State Management
- [x] WebSocket Client Setup (socket.io-client)

## ✅ Schritt 1.1 ABGESCHLOSSEN!

Das Frontend-Setup ist erfolgreich implementiert mit:
- ✅ Next.js 15.4.4 mit App Router und TypeScript Strict Mode
- ✅ Tailwind CSS 4 mit vollständigem Dark Mode Support
- ✅ Shadcn/ui Komponenten (Button, Theme Toggle)
- ✅ Zustand State Management mit Persistence
- ✅ React Query für Server State mit Devtools
- ✅ Socket.io Client für WebSocket-Verbindungen
- ✅ Vollständige Projektstruktur mit Design Patterns
- ✅ Responsive Main Layout mit Header und Theme Toggle
- ✅ TypeScript Types für alle Entitäten
- ✅ Build erfolgreich ohne Fehler

### 1.2 Design Patterns Implementation
**TODO:**
- [ ] **Repository Pattern** für Data Access:
  ```typescript
  // Base Repository
  abstract class BaseRepository<T> {
    protected db: Firestore;
    protected collection: string;
    
    abstract create(item: T): Promise<string>;
    abstract findById(id: string): Promise<T | null>;
    abstract update(id: string, item: Partial<T>): Promise<void>;
    abstract delete(id: string): Promise<void>;
  }
  
  // Document Repository
  class DocumentRepository extends BaseRepository<Document> {
    constructor() {
      super();
      this.collection = 'documents';
    }
    
    async findByUserId(userId: string): Promise<Document[]> {
      // Implementation
    }
  }
  ```

- [ ] **Factory Pattern** für Chain/Agent Erstellung:
  ```typescript
  // Abstract Factory
  interface ILegalAnalysisFactory {
    createChain(): BaseLegalChain;
    createAgent(): BaseLegalAgent;
    createRetriever(): BaseRetriever;
  }
  
  // Concrete Factory
  class ContractAnalysisFactory implements ILegalAnalysisFactory {
    createChain(): ContractAnalysisChain {
      return new ContractAnalysisChain(this.createLLM(), this.createRetriever());
    }
    
    createAgent(): ContractAnalysisAgent {
      return new ContractAnalysisAgent(this.createTools());
    }
    
    private createLLM(): ChatOpenAI {
      return new ChatOpenAI({
        modelName: "gpt-4-turbo-preview",
        temperature: 0.1,
        maxTokens: 4000
      });
    }
  }
  ```

- [ ] **Strategy Pattern** für verschiedene Analyse-Typen:
  ```typescript
  interface IAnalysisStrategy {
    analyze(document: ProcessedDocument): Promise<AnalysisResult>;
    validateResult(result: AnalysisResult): boolean;
  }
  
  class GDPRComplianceStrategy implements IAnalysisStrategy {
    async analyze(document: ProcessedDocument): Promise<ComplianceResult> {
      // GDPR-spezifische Analyse
    }
  }
  
  class ContractRiskStrategy implements IAnalysisStrategy {
    async analyze(document: ProcessedDocument): Promise<RiskResult> {
      // Risiko-Analyse
    }
  }
  ```

- [ ] **Observer Pattern** für WebSocket Updates:
  ```typescript
  interface IAnalysisObserver {
    update(event: AnalysisEvent): void;
  }
  
  class WebSocketObserver implements IAnalysisObserver {
    constructor(private socket: Socket) {}
    
    update(event: AnalysisEvent): void {
      this.socket.emit('analysisUpdate', event);
    }
  }
  
  class AnalysisSubject {
    private observers: IAnalysisObserver[] = [];
    
    attach(observer: IAnalysisObserver): void {
      this.observers.push(observer);
    }
    
    notify(event: AnalysisEvent): void {
      this.observers.forEach(observer => observer.update(event));
    }
  }
  ```

### 1.3 Firebase Functions Setup
**TODO:**
- [ ] **HTTP Functions** für REST API:
  ```typescript
  // functions/src/index.ts
  export const api = functions
    .region('europe-west6') // Zürich
    .runWith({
      memory: '1GB',
      timeoutSeconds: 540
    })
    .https.onRequest(app);
  ```
- [ ] **Scheduled Functions** für Maintenance:
  ```typescript
  export const dailyCleanup = functions
    .region('europe-west6')
    .pubsub.schedule('every 24 hours')
    .onRun(async (context) => {
      await cleanupOldAnalyses();
      await updateLegalDatabase();
    });
  ```
- [ ] **Firestore Triggers** für Reaktive Updates:
  ```typescript
  export const onDocumentAnalyzed = functions
    .region('europe-west6')
    .firestore.document('documents/{docId}/analyses/{analysisId}')
    .onCreate(async (snap, context) => {
      await updateUserStatistics(context.params.docId);
      await sendNotification(snap.data());
    });
  ```
- [ ] **Storage Triggers** für Dokument-Upload:
  ```typescript
  export const processUploadedDocument = functions
    .region('europe-west6')
    .storage.object()
    .onFinalize(async (object) => {
      if (object.name?.startsWith('documents/')) {
        await triggerDocumentProcessing(object);
      }
    });
  ```

### 1.4 .gitignore Configuration
**TODO:**
- [ ] Erstelle umfassende .gitignore:
```gitignore
# Dependencies
node_modules/
.pnp
.pnp.js

# Testing
coverage/
.nyc_output/

# Next.js
.next/
out/
build/
dist/

# Production
*.local

# Misc
.DS_Store
*.pem
.vscode/
.idea/

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*

# Environment files
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
.env.*.local

# Firebase
.firebase/
.firebaserc
firebase-debug.log
firestore-debug.log
ui-debug.log
database-debug.log
pubsub-debug.log

# Functions
functions/lib/
functions/node_modules/
functions/.env

# Logs
logs/
*.log

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# TypeScript
*.tsbuildinfo
.tsc-output/

# IDEs
.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json
*.swp
*.swo

# Testing
cypress/videos/
cypress/screenshots/
playwright-report/
test-results/

# Temporary files
tmp/
temp/
*.tmp
*.temp

# API Keys and Secrets
*.key
*.pem
serviceAccountKey.json
credentials.json

# Cache
.cache/
.parcel-cache/
.turbo/

# Monitoring
.sentryclirc

# Package manager
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/sdks
!.yarn/versions
```

## 🔧 Phase 2: Core RAG System Implementation mit LangChain

### 2.1 LangChain Embeddings & LLM Setup
**TODO:**
- [ ] **Embedding Models Konfiguration**:
  ```typescript
  // Multi-Language Embeddings für DACH Region
  class EmbeddingService {
    private models = {
      openai: new OpenAIEmbeddings({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: process.env.OPENAI_API_EMBEDDINGS_MODELL
      }),
    };
    
    async embedDocument(text: string, type: DocumentType): Promise<number[]> {
      // Wähle Model basierend auf Dokumenttyp und Sprache
      const model = this.selectModel(text, type);
      return await model.embedQuery(text);
    }
  }
  ```

- [ ] **LLM Models Setup**:
  ```typescript
  // LLM Factory mit verschiedenen Modellen
  class LLMFactory {
    createAnalysisLLM(): ChatOpenAI {
      return new ChatOpenAI({
        modelName: process.env.OPENAI_API_MODELL,
        temperature: 0.1,
        maxTokens: 4000,
        modelKwargs: {
          response_format: { type: "json_object" }
        }
      });
    }
    
    createGenerationLLM(): ChatOpenAI {
      return new ChatOpenAI({
        modelName: process.env.OPENAI_API_MODELL // Günstiger für Generation
        temperature: 0.3,
        maxTokens: 2000
      });
    }
  }
  ```

### 2.2 Text Splitting Strategies
**TODO:**
- [ ] **Hierarchical Legal Document Splitter**:
  ```typescript
  class LegalDocumentSplitter {
    private splitters = {
      // Level 1: Hauptkapitel/Artikel
      chapter: new RecursiveCharacterTextSplitter({
        chunkSize: 4000,
        chunkOverlap: 400,
        separators: [
          "\n## ", // Markdown Headers
          "\nArtikel ", "\nArt. ", // Deutsch
          "\nArticle ", // English
          "\nChapitre ", // Französisch
          "\nArticolo ", // Italienisch
        ],
        keepSeparator: true
      }),
      
      // Level 2: Sections/Absätze
      section: new RecursiveCharacterTextSplitter({
        chunkSize: 2000,
        chunkOverlap: 200,
        separators: [
          "\n### ",
          "\n§ ", "\nAbs. ", "\nAbsatz ",
          "\nParagraph ", "\nSection ",
          "\n\n", // Doppelte Zeilenumbrüche
        ]
      }),
      
      // Level 3: Klauseln/Sätze
      clause: new TokenTextSplitter({
        encodingName: "cl100k_base", // GPT-4 encoding
        chunkSize: 512,
        chunkOverlap: 50,
        disallowedSpecial: []
      }),
      
      // Speziell für Tabellen
      table: new MarkdownTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 0 // Keine Überlappung bei Tabellen
      })
    };
    
    async splitDocument(document: Document): Promise<HierarchicalChunks> {
      // 1. Identifiziere Dokumentstruktur
      const structure = await this.identifyStructure(document);
      
      // 2. Wende passende Splitter an
      const chunks = await this.applyHierarchicalSplitting(document, structure);
      
      // 3. Füge Metadaten hinzu
      return this.enrichWithMetadata(chunks, document);
    }
    
    private enrichWithMetadata(chunks: Document[], parent: Document): Document[] {
      return chunks.map((chunk, index) => ({
        ...chunk,
        metadata: {
          ...chunk.metadata,
          documentId: parent.metadata.id,
          chunkIndex: index,
          chunkLevel: this.determineLevel(chunk),
          language: this.detectLanguage(chunk.pageContent),
          legalReferences: this.extractLegalReferences(chunk.pageContent),
          contractClauses: this.identifyClauses(chunk.pageContent)
        }
      }));
    }
  }
  ```

### 2.3 Advanced Chain Implementations
**TODO:**
- [ ] **Contract Analysis Chain mit IRAC Methodology**:
  ```typescript
  class ContractAnalysisChain extends BaseLegalChain {
    private chains: {
      issue: LLMChain;
      rule: LLMChain;
      application: LLMChain;
      conclusion: LLMChain;
    };
    
    constructor() {
      super();
      this.setupChains();
    }
    
    private setupChains() {
      // Issue Identification Chain
      this.chains.issue = new LLMChain({
        llm: this.llmFactory.createAnalysisLLM(),
        prompt: PromptTemplate.fromTemplate(`
          Als Schweizer Rechtsexperte, identifiziere die rechtlichen Hauptfragen in diesem Vertrag:
          
          Vertrag: {contract}
          Vertragstyp: {contractType}
          Jurisdiktion: {jurisdiction}
          
          Identifiziere:
          1. Hauptrechtsfragen
          2. Potenzielle Risikobereiche
          3. Compliance-relevante Themen
          4. Unklare oder fehlende Klauseln
          
          Format: JSON mit strukturierter Ausgabe
        `),
        outputParser: new StructuredOutputParser.fromZodSchema(
          z.object({
            mainIssues: z.array(z.object({
              issue: z.string(),
              severity: z.enum(['high', 'medium', 'low']),
              legalArea: z.string()
            })),
            missingClauses: z.array(z.string()),
            ambiguities: z.array(z.string())
          })
        )
      });
      
      // Rule Application Chain
      this.chains.rule = new LLMChain({
        llm: this.llmFactory.createAnalysisLLM(),
        prompt: PromptTemplate.fromTemplate(`
          Wende relevante Schweizer Gesetze auf die identifizierten Rechtsfragen an:
          
          Rechtsfragen: {issues}
          Anwendbare Gesetze:
          - OR (Obligationenrecht)
          - DSG (Datenschutzgesetz)
          - ArG (Arbeitsgesetz)
          - Relevante Branchen-spezifische Regelungen
          
          Für jede Rechtsfrage:
          1. Zitiere spezifische Gesetzesartikel
          2. Erkläre die rechtliche Grundlage
          3. Identifiziere Präzedenzfälle falls relevant
          
          Format: Strukturierte JSON Ausgabe
        `)
      });
    }
    
    async analyze(document: Document): Promise<ContractAnalysisResult> {
      // Parallel Processing mit Fortschritts-Updates
      const analysisSubject = new AnalysisSubject();
      
      // Issue Identification
      analysisSubject.notify({ step: 'issue_identification', progress: 20 });
      const issues = await this.chains.issue.call({
        contract: document.pageContent,
        contractType: document.metadata.type,
        jurisdiction: 'CH'
      });
      
      // Rule Application
      analysisSubject.notify({ step: 'rule_application', progress: 40 });
      const rules = await this.chains.rule.call({ issues });
      
      // Application to Facts
      analysisSubject.notify({ step: 'fact_application', progress: 60 });
      const application = await this.chains.application.call({ issues, rules });
      
      // Conclusion & Recommendations
      analysisSubject.notify({ step: 'conclusion', progress: 80 });
      const conclusion = await this.chains.conclusion.call({ 
        issues, rules, application 
      });
      
      // Validation
      analysisSubject.notify({ step: 'validation', progress: 95 });
      await this.validateOutput({ issues, rules, application, conclusion });
      
      return this.formatResult({ issues, rules, application, conclusion });
    }
  }
  ```

- [ ] **GDPR Compliance Chain mit Multi-Stage Validation**:
  ```typescript
  class GDPRComplianceChain {
    private complianceChecks = [
      new DataMinimizationCheck(),
      new LawfulBasisCheck(),
      new ConsentMechanismCheck(),
      new DataSubjectRightsCheck(),
      new SecurityMeasuresCheck(),
      new CrossBorderTransferCheck(),
      new RetentionPolicyCheck(),
      new BreachNotificationCheck()
    ];
    
    async checkCompliance(document: Document): Promise<ComplianceReport> {
      const vectorStore = await this.getVectorStore();
      
      // Retrieval-Augmented Compliance Check
      const relevantRegulations = await vectorStore.similaritySearch(
        document.pageContent,
        10,
        {
          type: "regulation",
          jurisdiction: ["CH", "EU"],
          topic: "data_protection"
        }
      );
      
      // Multi-Chain Compliance Analysis
      const checkResults = await Promise.all(
        this.complianceChecks.map(check => 
          check.execute(document, relevantRegulations)
        )
      );
      
      // Aggregate Results mit Gewichtung
      return this.aggregateComplianceResults(checkResults);
    }
  }
  ```

### 2.4 Multi-Agent System Implementation
**TODO:**
- [ ] **Hierarchical Agent System mit LangGraph**:
  ```typescript
  import { StateGraph, StateGraphArgs } from "@langchain/langgraph";
  
  // Agent State Definition
  interface LegalAnalysisState {
    document: Document;
    analysisType: AnalysisType;
    intermediateResults: Map<string, any>;
    finalResult: AnalysisResult | null;
    errors: Error[];
    confidence: number;
  }
  
  class LegalAnalysisGraph {
    private graph: StateGraph<LegalAnalysisState>;
    
    constructor() {
      this.setupGraph();
    }
    
    private setupGraph() {
      const graphConfig: StateGraphArgs<LegalAnalysisState> = {
        channels: {
          document: null,
          analysisType: null,
          intermediateResults: null,
          finalResult: null,
          errors: null,
          confidence: null
        }
      };
      
      this.graph = new StateGraph(graphConfig);
      
      // Add Nodes (Agents)
      this.graph.addNode("router", this.routerAgent.bind(this));
      this.graph.addNode("extractor", this.extractorAgent.bind(this));
      this.graph.addNode("researcher", this.researcherAgent.bind(this));
      this.graph.addNode("analyzer", this.analyzerAgent.bind(this));
      this.graph.addNode("validator", this.validatorAgent.bind(this));
      this.graph.addNode("synthesizer", this.synthesizerAgent.bind(this));
      
      // Add Edges (Workflow)
      this.graph.addEdge("router", "extractor");
      this.graph.addConditionalEdges(
        "extractor",
        (state) => state.analysisType === "deep" ? "researcher" : "analyzer"
      );
      this.graph.addEdge("researcher", "analyzer");
      this.graph.addEdge("analyzer", "validator");
      this.graph.addConditionalEdges(
        "validator",
        (state) => state.confidence > 0.8 ? "synthesizer" : "researcher"
      );
      
      this.graph.setEntryPoint("router");
      this.graph.setFinishPoint("synthesizer");
    }
    
    // Router Agent - Entscheidet über Analyse-Pfad
    private async routerAgent(state: LegalAnalysisState): Promise<Partial<LegalAnalysisState>> {
      const router = new LLMChain({
        llm: new ChatOpenAI({ modelName: "gpt-3.5-turbo" }),
        prompt: PromptTemplate.fromTemplate(`
          Analysiere das Dokument und bestimme den optimalen Analyse-Pfad:
          
          Dokument-Typ: {docType}
          Dokument-Länge: {docLength}
          Sprache: {language}
          
          Wähle:
          1. "quick" - Für Standard-Dokumente
          2. "deep" - Für komplexe oder kritische Dokumente
          3. "specialized" - Für spezielle Rechtsgebiete
        `)
      });
      
      const decision = await router.call({
        docType: state.document.metadata.type,
        docLength: state.document.pageContent.length,
        language: state.document.metadata.language
      });
      
      return { analysisType: decision.analysisType };
    }
    
    // Research Agent - Sucht relevante Rechtsgrundlagen
    private async researcherAgent(state: LegalAnalysisState): Promise<Partial<LegalAnalysisState>> {
      const tools = [
        new VectorStoreRetriever({
          vectorStore: this.legalVectorStore,
          searchType: "mmr", // Maximal Marginal Relevance
          k: 20
        }),
        new GoogleScholarTool(), // Für akademische Quellen
        new LegalDatabaseTool(), // Für Gesetze und Urteile
      ];
      
      const researcher = await createReactAgent({
        llm: new ChatOpenAI({ modelName: "gpt-4-turbo-preview" }),
        tools,
        prompt: `Du bist ein Rechtsrecherche-Experte für Schweizer Recht.
                 Finde alle relevanten Rechtsgrundlagen, Präzedenzfälle und Kommentare.`
      });
      
      const research = await researcher.invoke({
        input: `Recherchiere Rechtsgrundlagen für: ${state.document.pageContent.substring(0, 1000)}...`
      });
      
      state.intermediateResults.set("legalResearch", research);
      return { intermediateResults: state.intermediateResults };
    }
  }
  ```

- [ ] **Specialized Agents Implementation**:
  ```typescript
  // Extractor Agent - Strukturierte Datenextraktion
  class ExtractorAgent {
    private extractionChains = new Map<string, LLMChain>();
    
    constructor() {
      this.setupExtractionChains();
    }
    
    private setupExtractionChains() {
      // Vertrags-Parteien Extraktor
      this.extractionChains.set('parties', new LLMChain({
        llm: new ChatOpenAI({ 
          modelName: "gpt-3.5-turbo-1106",
          temperature: 0 
        }),
        prompt: PromptTemplate.fromTemplate(`
          Extrahiere alle Vertragsparteien aus dem Dokument:
          
          {document}
          
          Ausgabe als JSON:
          {{
            "parties": [
              {{
                "name": "Vollständiger Name",
                "type": "natural_person|legal_entity",
                "role": "employer|employee|vendor|customer",
                "address": "Adresse falls vorhanden",
                "identifiers": {{
                  "uid": "CHE-123.456.789",
                  "id": "andere IDs"
                }}
              }}
            ]
          }}
        `),
        outputParser: new StructuredOutputParser.fromZodSchema(
          z.object({
            parties: z.array(z.object({
              name: z.string(),
              type: z.enum(['natural_person', 'legal_entity']),
              role: z.string(),
              address: z.string().optional(),
              identifiers: z.record(z.string()).optional()
            }))
          })
        )
      }));
      
      // Datums-Extraktor
      this.extractionChains.set('dates', new LLMChain({
        llm: new ChatOpenAI({ modelName: "gpt-3.5-turbo" }),
        prompt: PromptTemplate.fromTemplate(`
          Extrahiere alle rechtlich relevanten Daten:
          
          {document}
          
          Identifiziere:
          - Vertragsbeginn
          - Vertragsende
          - Kündigungsfristen
          - Wichtige Stichtage
          - Verjährungsfristen
          
          Format: JSON mit ISO-8601 Daten
        `)
      }));
    }
  }
  ```

### 2.5 Retrieval Optimization
**TODO:**
- [ ] **Hybrid Retrieval System**:
  ```typescript
  class HybridRetriever {
    private vectorStore: PineconeStore;
    private bm25Retriever: BM25Retriever;
    private reranker: CrossEncoderReranker;
    
    async retrieve(
      query: string, 
      filters: DocumentFilters,
      options: RetrievalOptions = {}
    ): Promise<Document[]> {
      // 1. Semantic Search mit Pinecone
      const semanticResults = await this.vectorStore.similaritySearchWithScore(
        query,
        options.k || 20,
        {
          ...filters,
          namespace: `tenant_${options.userId}`
        }
      );
      
      // 2. Keyword Search mit BM25
      const keywordResults = await this.bm25Retriever.search(
        query,
        options.k || 20
      );
      
      // 3. Reciprocal Rank Fusion
      const fusedResults = this.reciprocalRankFusion(
        semanticResults,
        keywordResults,
        { alpha: 0.6 } // Gewichtung zugunsten Semantic Search
      );
      
      // 4. Re-ranking mit Cross-Encoder
      if (options.rerank) {
        return await this.reranker.rerank(
          query,
          fusedResults,
          { model: "ms-marco-MiniLM-L-12-v2" }
        );
      }
      
      return fusedResults;
    }
    
    private reciprocalRankFusion(
      semanticResults: [Document, number][],
      keywordResults: Document[],
      options: { alpha: number }
    ): Document[] {
      const k = 60; // Konstante für RRF
      const scoreMap = new Map<string, number>();
      
      // Semantic Scores
      semanticResults.forEach(([doc, score], rank) => {
        const id = doc.metadata.id;
        const rrfScore = options.alpha * (1 / (k + rank + 1));
        scoreMap.set(id, rrfScore);
      });
      
      // Keyword Scores
      keywordResults.forEach((doc, rank) => {
        const id = doc.metadata.id;
        const currentScore = scoreMap.get(id) || 0;
        const rrfScore = (1 - options.alpha) * (1 / (k + rank + 1));
        scoreMap.set(id, currentScore + rrfScore);
      });
      
      // Sortiere nach kombiniertem Score
      return Array.from(scoreMap.entries())
        .sort(([, a], [, b]) => b - a)
        .map(([id]) => this.getDocumentById(id));
    }
  }
  ```

## 🚀 Phase 3: Firebase Functions Deployment

### 3.1 Firebase Functions Struktur
**TODO:**
- [ ] **Function Kategorien organisieren**:
  ```typescript
  // functions/src/index.ts
  import * as admin from 'firebase-admin';
  admin.initializeApp();
  
  // HTTP Functions
  export { api } from './http/api';
  export { webhooks } from './http/webhooks';
  
  // Scheduled Functions  
  export { dailyMaintenance } from './scheduled/maintenance';
  export { legalUpdates } from './scheduled/legalUpdates';
  
  // Firestore Triggers
  export { onDocumentCreated } from './triggers/document';
  export { onAnalysisCompleted } from './triggers/analysis';
  
  // Storage Triggers
  export { processUpload } from './triggers/storage';
  
  // Callable Functions
  export { analyzeDocument } from './callable/analyzeDocument';
  export { generateContract } from './callable/generateContract';
  ```

- [ ] **Memory und Timeout Optimierung**:
  ```typescript
  // Für rechenintensive Operationen
  export const analyzeDocument = functions
    .region('europe-west6')
    .runWith({
      memory: '2GB',
      timeoutSeconds: 540, // 9 Minuten
      maxInstances: 10,
      minInstances: 0
    })
    .https.onCall(async (data, context) => {
      // Authentifizierung prüfen
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }
      
      // Rate Limiting per User
      await rateLimiter.checkLimit(context.auth.uid);
      
      // Document Analysis
      return await documentAnalysisService.analyze(data, context.auth.uid);
    });
  ```

### 3.2 Kosten-Optimierung für Firebase Functions
**TODO:**
- [ ] **Cold Start Minimierung**:
  ```typescript
  // Globale Variablen für Wiederverwendung
  let pineconeClient: PineconeClient | null = null;
  let openaiClient: OpenAI | null = null;
  
  function getPineconeClient(): PineconeClient {
    if (!pineconeClient) {
      pineconeClient = new PineconeClient();
      pineconeClient.init({
        apiKey: process.env.PINECONE_API_KEY!,
        environment: 'gcp-starter'
      });
    }
    return pineconeClient;
  }
  
  // Lazy Loading für schwere Dependencies
  const getLangChain = async () => {
    const { ChatOpenAI } = await import('langchain/chat_models/openai');
    return { ChatOpenAI };
  };
  ```

- [ ] **Batching für Embeddings**:
  ```typescript
  class EmbeddingBatcher {
    private queue: Array<{
      text: string;
      resolve: (embedding: number[]) => void;
      reject: (error: Error) => void;
    }> = [];
    
    private batchTimeout: NodeJS.Timeout | null = null;
    private readonly batchSize = 100; // OpenAI max batch size
    private readonly batchDelay = 100; // ms
    
    async getEmbedding(text: string): Promise<number[]> {
      return new Promise((resolve, reject) => {
        this.queue.push({ text, resolve, reject });
        
        if (this.queue.length >= this.batchSize) {
          this.processBatch();
        } else if (!this.batchTimeout) {
          this.batchTimeout = setTimeout(() => this.processBatch(), this.batchDelay);
        }
      });
    }
    
    private async processBatch() {
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
        this.batchTimeout = null;
      }
      
      const batch = this.queue.splice(0, this.batchSize);
      if (batch.length === 0) return;
      
      try {
        const embeddings = await openai.embeddings.create({
          model: process.env.OPENAI_API_EMBEDDINGS_MODELL,
          input: batch.map(item => item.text)
        });
        
        batch.forEach((item, index) => {
          item.resolve(embeddings.data[index].embedding);
        });
      } catch (error) {
        batch.forEach(item => item.reject(error as Error));
      }
    }
  }
  ```

## 📊 Phase 4: Monitoring & Analytics

### 4.1 Custom Analytics mit Firebase
**TODO:**
- [ ] **Usage Tracking Service**:
  ```typescript
  class AnalyticsService {
    async trackUsage(userId: string, action: UsageAction, metadata: any) {
      // Firebase Analytics für aggregierte Metriken
      await analytics.logEvent(action, {
        user_id: userId,
        ...metadata
      });
      
      // Firestore für detaillierte Auswertungen
      await firestore.collection('usage').add({
        userId,
        action,
        metadata,
        timestamp: FieldValue.serverTimestamp(),
        cost: this.calculateCost(action, metadata)
      });
      
      // Update User Quotas
      await this.updateUserQuota(userId, action);
    }
    
    private calculateCost(action: UsageAction, metadata: any): number {
      const costs = {
        embedding: 0.0001 * (metadata.tokens / 1000),
        gpt4Analysis: 0.03 * (metadata.inputTokens / 1000) + 0.06 * (metadata.outputTokens / 1000),
        gpt35Generation: 0.001 * (metadata.inputTokens / 1000) + 0.002 * (metadata.outputTokens / 1000),
        storage: 0.02 * (metadata.sizeInMB / 1000), // per GB
        vectorStorage: 0.00001 * metadata.vectorCount
      };
      
      return costs[action] || 0;
    }
  }
  ```

- [ ] **Dashboard Metriken Aggregation**:
  ```typescript
  export const updateDashboardMetrics = functions
    .region('europe-west6')
    .pubsub.schedule('every 5 minutes')
    .onRun(async (context) => {
      const metrics = await aggregateMetrics();
      
      // Cache in Firestore für schnellen Zugriff
      await firestore
        .collection('dashboards')
        .doc('global')
        .set({
          activeContracts: metrics.activeContracts,
          highRiskItems: metrics.highRiskItems,
          upcomingDeadlines: metrics.upcomingDeadlines,
          monthlyVolume: metrics.monthlyVolume,
          lastUpdated: FieldValue.serverTimestamp()
        });
    });
  ```

Diese erweiterte TODO-Liste bietet dir nun:

1. **Firebase Functions** als Hosting-Lösung mit detaillierter Konfiguration
2. **Design Patterns** durchgängig integriert in die Architektur
3. **Umfassende .gitignore** Konfiguration
4. **Detaillierte LangChain Implementation** mit:
   - Spezifischen Embedding-Modellen (Multilingual E5, Legal-BERT)
   - LLM-Auswahl (GPT-4.1)
   - Hierarchische TextSplitter für Rechtstexte
   - Multi-Agent System mit LangGraph
   - Hybrid Retrieval mit BM25 und Semantic Search

Die Implementierung nutzt Firebase Functions optimal für:
- Kosten-Minimierung durch Cold Start Optimierung
- Skalierbarkeit durch automatisches Scaling
- Integration mit Firebase Services (Auth, Firestore, Storage)
- Regionale Deployment in Europa (Zürich)


🔥 Firebase Functions als Backend-Hosting

Regionales Deployment in europe-west6 (Zürich)
Optimierte Memory/Timeout Konfigurationen
Cold Start Minimierung durch globale Variablen
Kosten-effiziente Batch-Verarbeitung

🏗️ Design Patterns durchgängig integriert

Repository Pattern für Data Access Layer
Factory Pattern für Chain/Agent-Erstellung
Strategy Pattern für verschiedene Analyse-Typen
Observer Pattern für WebSocket Updates
Singleton Pattern für Logger und Services

🤖 Detaillierte LangChain/RAG Implementation
Embedding-Modelle:

OpenAI process.env.OPENAI_API_EMBEDDINGS_MODELL - Kosten-effizient als Fallback

LLM-Strategie:

GPT-4.1 Turbo - Für kritische Analysen (Temperatur 0.1)

Text-Splitting:

Hierarchisch mit 3 Ebenen (Kapitel → Sections → Klauseln)
Sprach-spezifische Separatoren für DE/FR/IT/EN
Token-basiert für präzise GPT-4 Kompatibilität

💡 Praktische Implementierungs-Tipps
Starte mit diesem MVP-Ansatz:

Woche 1: Firebase Setup + Basic Express API
Woche 2: Pinecone Integration + Document Upload
Woche 3: Erste LangChain DSGVO-Check Chain
Woche 4: WebSocket für Real-time Updates

Kosten-Kontrolle von Anfang an:
typescript// Implementiere Token-Tracking
class TokenTracker {
  async trackTokens(userId: string, tokens: number, model: string) {
    const cost = this.calculateCost(tokens, model);
    await this.updateUserUsage(userId, cost);
    
    // Warnung bei 80% Budget-Auslastung
    if (await this.isNearingLimit(userId)) {
      await this.sendBudgetWarning(userId);
    }
  }
}
Schweiz-spezifische Features:

Implementiere mehrsprachige Prompts (DE/FR/IT) von Beginn an
Nutze Schweizer Rechtsquellen für Retrieval (admin.ch, etc.)
Beachte kantonale Unterschiede bei der Analyse

Performance-Optimierung:

Cache alle Embeddings in Firestore (24h TTL)
Nutze Streaming für lange Analysen
Implementiere Progressive Enhancement im Frontend