import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { Logger } from '../utils/logger';
import { env } from '../config/environment';

export enum LLMType {
  ANALYSIS = 'analysis',
  GENERATION = 'generation',
  RESEARCH = 'research',
  VALIDATION = 'validation',
  SUMMARIZATION = 'summarization'
}

export interface LLMConfig {
  temperature: number;
  maxTokens?: number;
  modelName: string;
  streaming?: boolean;
  timeout?: number;
  maxRetries?: number;
  responseFormat?: 'text' | 'json_object';
}

/**
 * Factory für die Erstellung verschiedener LLM-Instanzen
 * Optimiert für verschiedene Anwendungsfälle in der Rechtsanalyse
 */
export class LLMFactory {
  private readonly logger = Logger.getInstance();
  private readonly modelCache = new Map<string, ChatOpenAI>();

  constructor() {
    this.logger.info('LLMFactory initialized');
  }


  /**
   * Erstellt ein LLM für juristische Analysen
   * Optimiert für Präzision und strukturierte Ausgaben
   */
  createAnalysisLLM(): ChatOpenAI {
    const cacheKey = 'analysis';

    if (this.modelCache.has(cacheKey)) {
      return this.modelCache.get(cacheKey)!;
    }

    const config: LLMConfig = {
      temperature: 0.1, // Niedrige Temperatur für konsistente, präzise Antworten
      maxTokens: 4000,
      modelName: env.OPENAI_CHAT_MODEL,
      responseFormat: 'json_object', // Strukturierte Ausgaben für Analysen
      timeout: 60000, // 60 Sekunden für komplexe Analysen
      maxRetries: 3
    };

    const llm = this.createLLMOpenAI(config);
    this.modelCache.set(cacheKey, llm);

    this.logger.info('Created Analysis LLM', {
      model: config.modelName,
      temperature: config.temperature,
      maxTokens: config.maxTokens
    });

    return llm;
  }

  /**
   * Erstellt ein LLM für Textgenerierung (Verträge, Dokumente)
   * Optimiert für Kreativität und Sprachqualität
   */
  createGenerationLLM(): ChatOpenAI {
    const cacheKey = 'generation';
    
    if (this.modelCache.has(cacheKey)) {
      return this.modelCache.get(cacheKey)!;
    }

    const config: LLMConfig = {
      temperature: 0.3, // Moderate Temperatur für natürliche Sprache
      maxTokens: 2000,
      modelName: env.OPENAI_CHAT_MODEL,
      streaming: true, // Streaming für bessere UX bei längeren Texten
      timeout: 45000,
      maxRetries: 2
    };

    const llm = this.createLLMOpenAI(config);
    this.modelCache.set(cacheKey, llm);
    
    this.logger.info('Created Generation LLM', {
      model: config.modelName,
      temperature: config.temperature,
      streaming: config.streaming
    });

    return llm;
  }

  /**
   * Erstellt ein LLM für Rechtsrecherche
   * Optimiert für umfassende und detaillierte Recherchen
   */
  createResearchLLM(): ChatOpenAI {
    const cacheKey = 'research';
    
    if (this.modelCache.has(cacheKey)) {
      return this.modelCache.get(cacheKey)!;
    }

    const config: LLMConfig = {
      temperature: 0.2, // Leicht erhöhte Temperatur für kreative Suchstrategien
      maxTokens: 6000, // Größere Token-Limits für umfassende Recherchen
      modelName: env.OPENAI_CHAT_MODEL,
      timeout: 90000, // Längere Timeouts für komplexe Recherchen
      maxRetries: 3
    };

    const llm = this.createLLMOpenAI(config);
    this.modelCache.set(cacheKey, llm);
    
    this.logger.info('Created Research LLM', {
      model: config.modelName,
      maxTokens: config.maxTokens
    });

    return llm;
  }

  /**
   * Erstellt ein LLM für Validierung und Qualitätskontrolle
   * Optimiert für kritische Bewertungen und Konsistenzprüfungen
   */
  createValidationLLM(): ChatOpenAI {
    const cacheKey = 'validation';
    
    if (this.modelCache.has(cacheKey)) {
      return this.modelCache.get(cacheKey)!;
    }

    const config: LLMConfig = {
      temperature: 0.0, // Null-Temperatur für maximale Konsistenz
      maxTokens: 3000,
      modelName: env.OPENAI_CHAT_MODEL,
      responseFormat: 'json_object',
      timeout: 45000,
      maxRetries: 3
    };

    const llm = this.createLLMOpenAI(config);
    this.modelCache.set(cacheKey, llm);
    
    this.logger.info('Created Validation LLM', {
      model: config.modelName,
      temperature: config.temperature
    });

    return llm;
  }

  /**
   * Erstellt ein LLM für Zusammenfassungen
   * Optimiert für prägnante und strukturierte Zusammenfassungen
   */
  createSummarizationLLM(): ChatOpenAI {
    const cacheKey = 'summarization';
    
    if (this.modelCache.has(cacheKey)) {
      return this.modelCache.get(cacheKey)!;
    }

    const config: LLMConfig = {
      temperature: 0.15, // Niedrige Temperatur für fokussierte Zusammenfassungen
      maxTokens: 1500, // Begrenzte Token für prägnante Ausgaben
      modelName: env.OPENAI_CHAT_MODEL,
      streaming: true,
      timeout: 30000,
      maxRetries: 2
    };

    const llm = this.createLLMOpenAI(config);
    this.modelCache.set(cacheKey, llm);
    
    this.logger.info('Created Summarization LLM', {
      model: config.modelName,
      maxTokens: config.maxTokens
    });

    return llm;
  }

  /**
   * Erstellt ein Custom LLM mit spezifischen Parametern
   */
  createCustomLLM(config: Partial<LLMConfig>, cacheKey?: string): ChatOpenAI {
    const fullConfig: LLMConfig = {
      temperature: 0.1,
      maxTokens: 2000,
      modelName: env.OPENAI_CHAT_MODEL,
      timeout: 45000,
      maxRetries: 2,
      ...config
    };

    if (cacheKey && this.modelCache.has(cacheKey)) {
      return this.modelCache.get(cacheKey)!;
    }

    const llm = this.createLLMOpenAI(fullConfig);
    
    if (cacheKey) {
      this.modelCache.set(cacheKey, llm);
    }

    this.logger.info('Created Custom LLM', {
      model: fullConfig.modelName,
      temperature: fullConfig.temperature,
      maxTokens: fullConfig.maxTokens,
      cacheKey: cacheKey || 'none'
    });

    return llm;
  }

  /**
   * Interne Methode zur LLM-Erstellung
   */
  private createLLMOpenAI(config: LLMConfig): ChatOpenAI {
    const modelKwargs: any = {};
    
    // Response Format konfigurieren
    if (config.responseFormat === 'json_object') {
      modelKwargs.response_format = { type: "json_object" };
    }

    return new ChatOpenAI({
      openAIApiKey: env.OPENAI_API_KEY,
      model: config.modelName,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      streaming: config.streaming || false,
      timeout: config.timeout || 45000,
      maxRetries: config.maxRetries || 2,
      modelKwargs,
      callbacks: [
        {
          handleLLMStart: async (llm, prompts) => {
            this.logger.info('LLM Request started', {
              model: config.modelName,
              promptCount: prompts.length,
              temperature: config.temperature
            });
          },
          handleLLMEnd: async (output) => {
            this.logger.info('LLM Request completed', {
              model: config.modelName,
              outputLength: output.generations[0]?.[0]?.text?.length || 0
            });
          },
          handleLLMError: async (error) => {
            this.logger.error('LLM Request failed', error, {
              model: config.modelName
            });
          }
        }
      ],
      service_tier: 'priority'
    });
  }

  /**
   * Leert den Model-Cache (nützlich für Tests oder Memory-Management)
   */
  clearCache(): void {
    this.modelCache.clear();
    this.logger.info('LLM Cache cleared');
  }

  /**
   * Gibt Cache-Statistiken zurück
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.modelCache.size,
      keys: Array.from(this.modelCache.keys())
    };
  }

  /**
   * Geschätzte Token-Kosten für einen Request
   */
  estimateTokenCost(
    inputTokens: number, 
    outputTokens: number, 
    modelName: string = env.OPENAI_CHAT_MODEL
  ): number {
    // Preise per 1K Tokens (Stand 2024)
    const prices: Record<string, { input: number; output: number }> = {
      'gpt-4-turbo-preview': { input: 0.01, output: 0.03 },
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-3.5-turbo': { input: 0.001, output: 0.002 },
      'gpt-3.5-turbo-16k': { input: 0.003, output: 0.004 }
    };

    const modelPrices = prices[modelName] || prices['gpt-4-turbo-preview'];
    
    if (!modelPrices) {
      this.logger.warn('Unknown model for cost estimation', { modelName });
      return 0;
    }
    
    return (inputTokens / 1000) * modelPrices.input + 
           (outputTokens / 1000) * modelPrices.output;
  }
}
