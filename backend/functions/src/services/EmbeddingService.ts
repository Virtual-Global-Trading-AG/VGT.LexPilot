import { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from 'langchain/document';
import { Logger } from '../utils/logger';
import { env } from '../config/environment';

export enum DocumentType {
  CONTRACT = 'contract',
  REGULATION = 'regulation',
  CASE_LAW = 'case_law',
  LEGAL_OPINION = 'legal_opinion',
  GENERAL = 'general'
}

export interface EmbeddingMetadata {
  documentType: DocumentType;
  language: string;
  jurisdiction: string;
  legalArea?: string;
  confidence?: number;
}

/**
 * Service für die Erstellung von Embeddings für juristische Dokumente
 * Implementiert verschiedene Embedding-Strategien je nach Dokumenttyp
 */
export class EmbeddingService {
  private readonly logger = Logger.getInstance();
  private readonly models: Map<string, OpenAIEmbeddings>;
  private readonly batchQueue: Array<{
    text: string;
    metadata?: EmbeddingMetadata;
    resolve: (embedding: number[]) => void;
    reject: (error: Error) => void;
  }> = [];
  
  private batchTimeout: NodeJS.Timeout | null = null;
  private readonly batchSize = 100; // OpenAI max batch size
  private readonly batchDelay = 100; // ms

  constructor() {
    this.models = new Map();
    this.initializeModels();
  }

  private initializeModels(): void {
    // Standard OpenAI Embedding Model
    this.models.set('openai', new OpenAIEmbeddings({
      openAIApiKey: env.OPENAI_API_KEY,
      modelName: env.OPENAI_EMBEDDINGS_MODEL || 'text-embedding-3-small',
      dimensions: 1024, // Standard dimension for text-embedding-3-small
      //maxRetries: 3,
      //timeout: 30000
    }));

    // Kleineres, günstigeres Model für einfache Texte
    this.models.set('openai-small', new OpenAIEmbeddings({
      openAIApiKey: env.OPENAI_API_KEY,
      modelName: 'text-embedding-3-small',
      dimensions: 512, // Reduzierte Dimensionen für bessere Performance
      maxRetries: 3,
      timeout: 30000
    }));

    // Größeres Model für komplexe juristische Texte
    this.models.set('openai-large', new OpenAIEmbeddings({
      openAIApiKey: env.OPENAI_API_KEY,
      modelName: 'text-embedding-3-large',
      dimensions: 3072, // Volle Dimensionen für beste Qualität
      maxRetries: 3,
      timeout: 30000
    }));
  }

  /**
   * Erstellt Embedding für ein einzelnes Dokument
   */
  async embedDocument(
    text: string, 
    type: DocumentType = DocumentType.GENERAL,
    metadata?: EmbeddingMetadata
  ): Promise<number[]> {
    try {
      // Model basierend auf Dokumenttyp und Größe auswählen
      const model = this.selectModel(text, type, metadata);
      
      this.logger.info('Creating embedding', {
        textLength: text.length,
        documentType: type,
        model: model,
        language: metadata?.language || 'unknown'
      });

      // Batching für bessere Performance
      return await this.getEmbeddingBatched(text, metadata);
      
    } catch (error) {
      this.logger.error('Error creating embedding', error instanceof Error ? error : new Error(String(error)), {
        documentType: type,
        textLength: text.length
      });
      throw new Error(`Failed to create embedding: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Erstellt Embeddings für mehrere Dokumente parallel
   */
  async embedDocuments(
    documents: Array<{ text: string; type: DocumentType; metadata?: EmbeddingMetadata }>
  ): Promise<number[][]> {
    const embeddings = await Promise.all(
      documents.map(doc => this.embedDocument(doc.text, doc.type, doc.metadata))
    );
    
    this.logger.info('Created batch embeddings', {
      count: documents.length,
      totalTokens: documents.reduce((sum, doc) => sum + this.estimateTokens(doc.text), 0)
    });

    return embeddings;
  }

  /**
   * Wählt das optimale Embedding-Model basierend auf Dokumenttyp und Komplexität
   */
  private selectModel(
    text: string, 
    type: DocumentType, 
    metadata?: EmbeddingMetadata
  ): string {
    const tokenCount = this.estimateTokens(text);
    const isComplexLegal = type === DocumentType.REGULATION || 
                          type === DocumentType.CASE_LAW ||
                          metadata?.legalArea === 'complex';

    // Für komplexe juristische Texte verwende das größere Model
    if (isComplexLegal && tokenCount > 1000) {
      return 'openai-large';
    }
    
    // Für kurze oder einfache Texte verwende das kleinere Model
    if (tokenCount < 500 && type === DocumentType.GENERAL) {
      return 'openai-small';
    }

    // Standard Model für die meisten Fälle
    return 'openai';
  }

  /**
   * Batched Embedding Generation für bessere Performance und Kosteneffizienz
   */
  private async getEmbeddingBatched(
    text: string, 
    metadata?: EmbeddingMetadata
  ): Promise<number[]> {
    return new Promise((resolve, reject) => {
      this.batchQueue.push({ text, metadata, resolve, reject });
      
      if (this.batchQueue.length >= this.batchSize) {
        this.processBatch();
      } else if (!this.batchTimeout) {
        this.batchTimeout = setTimeout(() => this.processBatch(), this.batchDelay);
      }
    });
  }

  /**
   * Verarbeitet einen Batch von Embedding-Anfragen
   */
  private async processBatch(): Promise<void> {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    const batch = this.batchQueue.splice(0, this.batchSize);
    if (batch.length === 0) return;

    try {
      // Gruppiere nach Model-Typ für optimale Batch-Verarbeitung
      const modelGroups = new Map<string, typeof batch>();
      
      for (const item of batch) {
        const modelType = this.selectModel(
          item.text, 
          item.metadata?.documentType || DocumentType.GENERAL, 
          item.metadata
        );
        
        if (!modelGroups.has(modelType)) {
          modelGroups.set(modelType, []);
        }
        modelGroups.get(modelType)!.push(item);
      }

      // Verarbeite jede Model-Gruppe separat
      for (const [modelType, items] of modelGroups) {
        const model = this.models.get(modelType)!;
        const texts = items.map(item => item.text);
        
        const embeddings = await model.embedDocuments(texts);
        
        items.forEach((item, index) => {
          const embedding = embeddings[index];
          if (embedding) {
            item.resolve(embedding);
          } else {
            item.reject(new Error(`No embedding received for index ${index}`));
          }
        });
      }

      this.logger.info('Processed embedding batch', {
        batchSize: batch.length,
        models: Array.from(modelGroups.keys()),
        totalTokens: batch.reduce((sum, item) => sum + this.estimateTokens(item.text), 0)
      });

    } catch (error) {
      this.logger.error('Error processing embedding batch', error instanceof Error ? error : new Error(String(error)), {
        batchSize: batch.length
      });
      
      batch.forEach(item => item.reject(error as Error));
    }
  }

  /**
   * Schätzt die Anzahl Tokens für einen Text (approximativ)
   */
  private estimateTokens(text: string): number {
    // Grobe Schätzung: ~4 Zeichen pro Token für Deutsch/Englisch
    return Math.ceil(text.length / 4);
  }

  /**
   * Ermittelt die optimale Chunk-Größe basierend auf Dokumenttyp
   */
  getOptimalChunkSize(type: DocumentType): number {
    switch (type) {
      case DocumentType.CONTRACT:
        return 2000; // Längere Chunks für Vertragsklauseln
      case DocumentType.REGULATION:
        return 4000; // Große Chunks für Gesetzesartikel
      case DocumentType.CASE_LAW:
        return 3000; // Mittlere Chunks für Urteile
      case DocumentType.LEGAL_OPINION:
        return 1500; // Kleinere Chunks für Gutachten
      default:
        return 1000; // Standard Chunk-Größe
    }
  }

  /**
   * Gibt das OpenAI Embedding Model zurück für Vector Store Integration
   */
  getEmbeddingModel(): OpenAIEmbeddings {
    const model = this.models.get('openai');
    if (!model) {
      throw new Error('OpenAI embedding model not initialized');
    }
    return model;
  }

  /**
   * Cleanup Methode zum Beenden des Services
   */
  async shutdown(): Promise<void> {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }
    
    // Verarbeite verbleibende Items in der Queue
    if (this.batchQueue.length > 0) {
      await this.processBatch();
    }
    
    this.logger.info('EmbeddingService shutdown completed');
  }
}
