import { Document } from 'langchain/document';
import { Logger } from '../utils/logger';
import { EmbeddingService } from '../services/EmbeddingService';

export interface DocumentFilters {
  type?: string[];
  jurisdiction?: string[];
  language?: string[];
  dateRange?: {
    from: Date;
    to: Date;
  };
  tags?: string[];
  namespace?: string;
}

export interface RetrievalOptions {
  k?: number;
  userId?: string;
  rerank?: boolean;
  threshold?: number;
  diversityFactor?: number;
}

export interface ScoredDocument {
  document: Document;
  score: number;
  source: 'semantic' | 'keyword' | 'hybrid';
}

/**
 * Mock BM25 Retriever für Keyword-basierte Suche
 * In Produktion würde hier ein echter BM25 Index verwendet
 */
class MockBM25Retriever {
  private documents: Document[] = [];

  addDocuments(documents: Document[]): void {
    this.documents.push(...documents);
  }

  async search(query: string, k: number = 10): Promise<Document[]> {
    // Vereinfachte Keyword-Suche
    const queryTerms = query.toLowerCase().split(/\s+/);
    
    const scores = this.documents.map(doc => {
      const content = doc.pageContent.toLowerCase();
      const score = queryTerms.reduce((sum, term) => {
        const matches = (content.match(new RegExp(term, 'g')) || []).length;
        return sum + matches;
      }, 0);
      
      return { doc, score };
    });

    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(item => item.doc);
  }
}

/**
 * Mock CrossEncoder Reranker
 * In Produktion würde hier ein ML-basierter Reranker verwendet
 */
class MockCrossEncoderReranker {
  async rerank(
    query: string,
    documents: Document[],
    options: { model?: string } = {}
  ): Promise<Document[]> {
    // Vereinfachte Relevanz-Bewertung basierend auf Textähnlichkeit
    const queryTerms = new Set(query.toLowerCase().split(/\s+/));
    
    const scored = documents.map(doc => {
      const docTerms = new Set(doc.pageContent.toLowerCase().split(/\s+/));
      const intersection = new Set([...queryTerms].filter(term => docTerms.has(term)));
      const similarity = intersection.size / Math.max(queryTerms.size, docTerms.size);
      
      return { doc, similarity };
    });

    return scored
      .sort((a, b) => b.similarity - a.similarity)
      .map(item => item.doc);
  }
}

/**
 * Mock Vector Store für semantische Suche
 * In Produktion würde hier Pinecone oder ähnlich verwendet
 */
class MockVectorStore {
  private documents: Array<{ doc: Document; embedding: number[] }> = [];
  private embeddingService: EmbeddingService;

  constructor(embeddingService: EmbeddingService) {
    this.embeddingService = embeddingService;
  }

  async addDocuments(documents: Document[]): Promise<void> {
    for (const doc of documents) {
      const embedding = await this.embeddingService.embedDocument(
        doc.pageContent,
        doc.metadata.type
      );
      this.documents.push({ doc, embedding });
    }
  }

  async similaritySearchWithScore(
    query: string,
    k: number = 10,
    filters: DocumentFilters = {}
  ): Promise<Array<[Document, number]>> {
    const queryEmbedding = await this.embeddingService.embedDocument(query);
    
    // Filtere Dokumente
    let filteredDocs = this.documents;
    if (filters.type) {
      filteredDocs = filteredDocs.filter(item => 
        filters.type!.includes(item.doc.metadata.type)
      );
    }
    if (filters.language) {
      filteredDocs = filteredDocs.filter(item => 
        filters.language!.includes(item.doc.metadata.language)
      );
    }

    // Berechne Ähnlichkeiten
    const similarities = filteredDocs.map(item => {
      const similarity = this.cosineSimilarity(queryEmbedding, item.embedding);
      return [item.doc, similarity] as [Document, number];
    });

    return similarities
      .sort(([, a], [, b]) => b - a)
      .slice(0, k);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    const dotProduct = a.reduce((sum, ai, i) => sum + ai * (b[i] || 0), 0);
    const normA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
    const normB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (normA * normB);
  }
}

/**
 * Hybrid Retrieval System kombiniert semantische und Keyword-Suche
 * mit Reciprocal Rank Fusion und optionalem Re-ranking
 */
export class HybridRetriever {
  private readonly logger = Logger.getInstance();
  private readonly vectorStore: MockVectorStore;
  private readonly bm25Retriever: MockBM25Retriever;
  private readonly reranker: MockCrossEncoderReranker;
  private readonly embeddingService: EmbeddingService;

  constructor() {
    this.embeddingService = new EmbeddingService();
    this.vectorStore = new MockVectorStore(this.embeddingService);
    this.bm25Retriever = new MockBM25Retriever();
    this.reranker = new MockCrossEncoderReranker();
  }

  /**
   * Initialisiert den Retriever mit Dokumenten
   */
  async initialize(documents: Document[]): Promise<void> {
    this.logger.info('Initializing hybrid retriever', {
      documentCount: documents.length
    });

    // Füge Dokumente zu beiden Retrievern hinzu
    await Promise.all([
      this.vectorStore.addDocuments(documents),
      this.bm25Retriever.addDocuments(documents)
    ]);

    this.logger.info('Hybrid retriever initialized successfully');
  }

  /**
   * Hauptmethode für hybride Dokumentensuche
   */
  async retrieve(
    query: string,
    filters: DocumentFilters = {},
    options: RetrievalOptions = {}
  ): Promise<Document[]> {
    const startTime = Date.now();
    const k = options.k || 20;

    try {
      this.logger.info('Starting hybrid retrieval', {
        query: query.substring(0, 100),
        k,
        filters,
        options
      });

      // 1. Semantic Search mit Vector Store
      const semanticResults = await this.vectorStore.similaritySearchWithScore(
        query,
        k,
        {
          ...filters,
          namespace: options.userId ? `tenant_${options.userId}` : undefined
        }
      );

      // 2. Keyword Search mit BM25
      const keywordResults = await this.bm25Retriever.search(query, k);

      // 3. Reciprocal Rank Fusion
      const fusedResults = this.reciprocalRankFusion(
        semanticResults,
        keywordResults,
        { alpha: 0.6 } // Gewichtung zugunsten Semantic Search
      );

      // 4. Optional: Re-ranking mit Cross-Encoder
      let finalResults = fusedResults;
      if (options.rerank) {
        this.logger.info('Applying re-ranking');
        finalResults = await this.reranker.rerank(
          query,
          fusedResults,
          { model: "ms-marco-MiniLM-L-12-v2" }
        );
      }

      // 5. Apply threshold filter if specified
      if (options.threshold) {
        // In einer echten Implementierung würden hier Scores verfügbar sein
        // Für die Mock-Implementierung überspringen wir das Threshold-Filtering
      }

      // 6. Apply diversity if specified
      if (options.diversityFactor && options.diversityFactor > 0) {
        finalResults = this.applyDiversityFiltering(finalResults, options.diversityFactor);
      }

      const processingTime = Date.now() - startTime;
      this.logger.info('Hybrid retrieval completed', {
        semanticResultsCount: semanticResults.length,
        keywordResultsCount: keywordResults.length,
        finalResultsCount: finalResults.length,
        processingTimeMs: processingTime
      });

      return finalResults.slice(0, k);

    } catch (error) {
      this.logger.error('Hybrid retrieval failed', error instanceof Error ? error : new Error(String(error)), {
        query: query.substring(0, 100),
        processingTimeMs: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Reciprocal Rank Fusion für die Kombination von Semantic und Keyword Results
   */
  private reciprocalRankFusion(
    semanticResults: Array<[Document, number]>,
    keywordResults: Document[],
    options: { alpha: number }
  ): Document[] {
    const k = 60; // Konstante für RRF
    const scoreMap = new Map<string, { doc: Document; score: number }>();

    // Semantic Scores (mit tatsächlichen Similarity Scores)
    semanticResults.forEach(([doc, similarity], rank) => {
      const id = doc.metadata.id || `doc_${rank}`;
      const rrfScore = options.alpha * (1 / (k + rank + 1));
      scoreMap.set(id, { doc, score: rrfScore });
    });

    // Keyword Scores
    keywordResults.forEach((doc, rank) => {
      const id = doc.metadata.id || `doc_${rank}`;
      const currentEntry = scoreMap.get(id);
      const rrfScore = (1 - options.alpha) * (1 / (k + rank + 1));
      
      if (currentEntry) {
        // Dokument bereits von semantic search gefunden
        currentEntry.score += rrfScore;
      } else {
        // Neues Dokument nur von keyword search
        scoreMap.set(id, { doc, score: rrfScore });
      }
    });

    // Sortiere nach kombiniertem Score
    return Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score)
      .map(entry => entry.doc);
  }

  /**
   * Anwendung von Diversity Filtering um ähnliche Dokumente zu reduzieren
   */
  private applyDiversityFiltering(documents: Document[], diversityFactor: number): Document[] {
    if (diversityFactor <= 0 || documents.length <= 1) {
      return documents;
    }

    const firstDoc = documents[0];
    if (!firstDoc) {
      return documents;
    }

    const selected: Document[] = [firstDoc]; // Erstes Dokument immer nehmen
    
    for (let i = 1; i < documents.length; i++) {
      const candidate = documents[i];
      if (!candidate) continue;
      
      // Prüfe Ähnlichkeit zu bereits ausgewählten Dokumenten
      const similarities = selected.map(selectedDoc => 
        this.calculateTextSimilarity(candidate.pageContent, selectedDoc.pageContent)
      );
      
      const maxSimilarity = Math.max(...similarities);
      
      // Füge Dokument hinzu wenn es suffizient unterschiedlich ist
      if (maxSimilarity < (1 - diversityFactor)) {
        selected.push(candidate);
      }
    }

    this.logger.info('Diversity filtering applied', {
      originalCount: documents.length,
      filteredCount: selected.length,
      diversityFactor
    });

    return selected;
  }

  /**
   * Einfache Textähnlichkeitsberechnung für Diversity Filtering
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size; // Jaccard Similarity
  }

  /**
   * Abrufen von Retrieval-Statistiken
   */
  getStats(): {
    documentsIndexed: number;
    lastQueryTime?: number;
  } {
    return {
      documentsIndexed: this.bm25Retriever['documents']?.length || 0,
      lastQueryTime: undefined // In Produktion würde hier die letzte Query-Zeit getrackt
    };
  }

  /**
   * Cleanup Methode
   */
  async shutdown(): Promise<void> {
    await this.embeddingService.shutdown();
    this.logger.info('Hybrid retriever shutdown completed');
  }
}
