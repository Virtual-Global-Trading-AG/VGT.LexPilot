import { PineconeStore } from '@langchain/pinecone';
import { Pinecone as PineconeClient } from "@pinecone-database/pinecone";
import { Document } from '@langchain/core/documents';
import { CreateIndexRequestMetricEnum } from '@pinecone-database/pinecone/dist/pinecone-generated-ts-fetch/db_control/models/CreateIndexRequest';
import { EmbeddingService } from '../services/EmbeddingService';
import { Logger } from '../utils/logger';
import { HierarchicalChunk } from '../strategies/LegalDocumentSplitter';

export interface VectorStoreConfig {
  indexName: string;
  namespace: string;
  dimension?: number;
  metric?: 'cosine' | 'euclidean' | 'dotproduct';
  createIfNotExists?: boolean;
  topK?: number;
  scoreThreshold?: number;
}

export interface SearchResult {
  documents: HierarchicalChunk[];
  scores: number[];
  totalResults: number;
}

/**
 * PineCone Vector Store Service für semantische Suche in Rechtsdokumenten
 * Implementiert Best Practices für Azure-basierte Anwendungen
 */
export class PineconeVectorStore {
  private readonly logger = Logger.getInstance();
  private pinecone!: PineconeClient; // Definitive Assignment Assertion
  private embeddingService: EmbeddingService;
  store?: PineconeStore;

  constructor(embeddingService: EmbeddingService) {
    this.embeddingService = embeddingService;
    this.initializePinecone();
  }

  /**
   * Initialisiert Pinecone Client mit sicherer Authentifizierung
   * Verwendet Environment Variables ohne Hardcoding
   */
  private initializePinecone(): void {
    try {
      const apiKey = process.env.PINECONE_API_KEY;
      if (!apiKey) {
        throw new Error('PINECONE_API_KEY environment variable is required');
      }

      this.pinecone = new PineconeClient({
        apiKey: apiKey,
      });

      this.logger.info('Pinecone pinecone initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Pinecone pinecone', error as Error);
      throw new Error(`Pinecone initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Erstellt oder verbindet sich mit einem Pinecone Store
   * Implementiert Retry-Logik für Transient Failures
   */
  async initializeStore(config: VectorStoreConfig): Promise<void> {
    const maxRetries = 3;
    const baseDelay = 1000;

    // Erstelle Index falls gewünscht und nicht vorhanden
    if (config.createIfNotExists) {
      await this.ensureIndexExists({
        ...config,
        dimension: config.dimension || 1024
      });
    }


    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const pineconeIndex = this.pinecone.Index(config.indexName);

        this.store = await PineconeStore.fromExistingIndex(
          this.embeddingService.getEmbeddingModel(),
          {
            pineconeIndex,
            namespace: config.namespace,
          }
        );

        this.logger.info('Pinecone store initialized', { 
          indexName: config.indexName, 
          namespace: config.namespace 
        });
        return;

      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        const delay = baseDelay * Math.pow(2, attempt - 1);

        this.logger.warn(`Pinecone store initialization attempt ${attempt} failed`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          willRetry: !isLastAttempt,
          nextRetryIn: isLastAttempt ? 0 : delay
        });

        if (isLastAttempt) {
          throw new Error(`Failed to initialize Pinecone store after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Speichert Dokument-Chunks im Vector Store mit Batch-Verarbeitung
   * Optimiert für Performance und Kosteneinsparung
   */
  async addDocuments(
    chunks: HierarchicalChunk[], 
    config: VectorStoreConfig,
    progressCallback?: (progress: number, status: string) => void
  ): Promise<void> {
    if (!this.store) {
      await this.initializeStore(config);
    }

    if (!chunks.length) {
      this.logger.warn('No chunks provided for storage');
      return;
    }

    const batchSize = 20; // Optimale Batch-Größe für Pinecone
    const totalBatches = Math.ceil(chunks.length / batchSize);

    this.logger.info('Starting document storage', {
      totalChunks: chunks.length,
      batchSize,
      totalBatches,
      namespace: config.namespace
    });

    try {
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;

        // Konvertiere HierarchicalChunk zu Document für LangChain
        const documents: Document[] = batch.map(chunk => ({
          pageContent: chunk.pageContent,
          metadata: chunk.metadata
        }));

        await this.store!.addDocuments(documents);

        const progress = Math.round((batchNumber / totalBatches) * 100);
        progressCallback?.(progress, `Stored batch ${batchNumber}/${totalBatches}`);

        this.logger.debug('Batch stored successfully', {
          batchNumber,
          batchSize: batch.length,
          progress: `${progress}%`
        });

        // Rate Limiting: 100ms zwischen Batches
        if (i + batchSize < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      this.logger.info('All documents stored successfully', {
        totalChunks: chunks.length,
        namespace: config.namespace
      });

    } catch (error) {
      this.logger.error('Failed to store documents', error as Error, {
        totalChunks: chunks.length,
        namespace: config.namespace
      });
      throw new Error(`Document storage failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Führt semantische Suche durch mit konfigurierbaren Parametern
   * Implementiert Relevanz-Scoring für bessere Ergebnisse
   */
  async search(
    query: string,
    config: VectorStoreConfig & { 
      topK?: number; 
      scoreThreshold?: number;
      filter?: Record<string, any>;
    }
  ): Promise<SearchResult> {
    if (!this.store) {
      await this.initializeStore(config);
    }

    const topK = config.topK || 10;
    const scoreThreshold = config.scoreThreshold || 0.7;

    try {
      this.logger.debug('Starting semantic search', {
        query: query.substring(0, 100) + '...',
        topK,
        scoreThreshold,
        namespace: config.namespace
      });

      const results = await this.store!.similaritySearchWithScore(
        query,
        topK,
        config.filter
      );

      // Filtere Ergebnisse nach Score-Threshold
      const filteredResults = results.filter(([_, score]) => score >= scoreThreshold);

      const documents: HierarchicalChunk[] = filteredResults.map(([doc, _]) => ({
        pageContent: doc.pageContent,
        metadata: doc.metadata as HierarchicalChunk['metadata']
      }));

      const scores = filteredResults.map(([_, score]) => score);

      this.logger.info('Search completed', {
        totalResults: results.length,
        filteredResults: filteredResults.length,
        averageScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
      });

      return {
        documents,
        scores,
        totalResults: results.length
      };

    } catch (error) {
      this.logger.error('Search failed', error as Error, {
        query: query.substring(0, 100),
        topK,
        namespace: config.namespace
      });
      throw new Error(`Vector search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Löscht Dokumente aus dem Vector Store basierend auf Filter
   * Unterstützt sowohl einzelne als auch Batch-Löschungen
   */
  async deleteDocuments(
    config: VectorStoreConfig,
    filter: Record<string, any>
  ): Promise<void> {
    if (!this.store) {
      await this.initializeStore(config);
    }

    try {
      const pineconeIndex = this.pinecone.Index(config.indexName);
      
      // Lösche basierend auf Metadaten-Filter
      await pineconeIndex.namespace(config.namespace).deleteMany(filter);

      this.logger.info('Documents deleted successfully', {
        namespace: config.namespace,
        filter
      });

    } catch (error) {
      this.logger.error('Failed to delete documents', error as Error, {
        namespace: config.namespace,
        filter
      });
      throw new Error(`Document deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gibt Statistiken über den Vector Store zurück
   * Hilfreich für Monitoring und Debugging
   */
  async getStats(config: VectorStoreConfig): Promise<{
    totalVectors: number;
    dimension: number;
    indexFullness: number;
  }> {
    try {
      const pineconeIndex = this.pinecone.Index(config.indexName);
      const stats = await pineconeIndex.describeIndexStats();

      const namespaceStats = stats.namespaces?.[config.namespace];

      return {
        totalVectors: namespaceStats?.recordCount || 0,
        dimension: stats.dimension || 0,
        indexFullness: stats.indexFullness || 0
      };

    } catch (error) {
      this.logger.error('Failed to get stats', error as Error, {
        indexName: config.indexName,
        namespace: config.namespace
      });
      throw new Error(`Stats retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Health Check für den Vector Store
   * Prüft Verbindung und Index-Verfügbarkeit
   */
  async healthCheck(indexName: string): Promise<boolean> {
    try {
      const pineconeIndex = this.pinecone.Index(indexName);
      const stats = await pineconeIndex.describeIndexStats();
      return stats !== null;

    } catch (error) {
      this.logger.error('Health check failed', error as Error, { indexName });
      return false;
    }
  }

  /**
   * Erstellt einen Pinecone Index, falls er nicht existiert
   */
  private async ensureIndexExists(config: VectorStoreConfig & {
    dimension: number;
    metric?: CreateIndexRequestMetricEnum;
    spec?: any;
  }): Promise<void> {
    try {
      // Prüfe ob Index bereits existiert
      const existingIndexes = await this.pinecone.listIndexes();
      const indexExists = existingIndexes.indexes?.some(index => index.name === config.indexName);

      if (!indexExists) {
        this.logger.info(`Creating new index: ${config.indexName}`);

        await this.pinecone.createIndex({
          name: config.indexName,
          dimension: config.dimension, // z.B. 1536 für OpenAI Ada-002
          metric: config.metric || 'cosine',
          spec: config.spec || {
            serverless: {
              cloud: 'aws',
              region: 'us-east-1'
            }
          }
        });

        // Warte bis Index bereit ist
        await this.waitForIndexReady(config.indexName);

        this.logger.info(`Index ${config.indexName} created successfully`);
      } else {
        this.logger.info(`Index ${config.indexName} already exists`);
      }
    } catch (error) {
      this.logger.error('Failed to ensure index exists', error as Error);
      throw new Error(`Index creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Wartet bis der Index bereit für Operationen ist
   */
  private async waitForIndexReady(indexName: string, maxWaitTime = 60000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const indexDescription = await this.pinecone.describeIndex(indexName);
        if (indexDescription.status?.ready) {
          return;
        }

        this.logger.debug(`Waiting for index ${indexName} to be ready...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        this.logger.warn(`Error checking index status: ${error instanceof Error ? error.message : 'Unknown'}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    throw new Error(`Index ${indexName} not ready within ${maxWaitTime}ms`);
  }
}


