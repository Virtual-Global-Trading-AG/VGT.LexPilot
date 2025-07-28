import { ChatOpenAI } from '@langchain/openai';
import { HuggingFaceInferenceEmbeddings } from '@langchain/community/embeddings/hf';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from '../models';
import { Logger } from '../utils/logger';
import { env } from '../config/environment';

/**
 * Abstract Factory Interface for Legal Analysis
 */
export interface ILegalAnalysisFactory {
  createChain(): Promise<BaseLegalChain>;
  createAgent(): Promise<BaseLegalAgent>;
  createRetriever(): Promise<BaseRetriever>;
  createEmbeddings(): Promise<BaseEmbeddings>;
  createLLM(): ChatOpenAI;
}

/**
 * Abstract Base Chain for Legal Analysis
 */
export abstract class BaseLegalChain {
  protected llm: ChatOpenAI;
  protected embeddings: BaseEmbeddings;
  protected logger: Logger;

  constructor(llm: ChatOpenAI, embeddings: BaseEmbeddings) {
    this.llm = llm;
    this.embeddings = embeddings;
    this.logger = Logger.getInstance();
  }

  abstract analyze(document: Document): Promise<any>;
  
  protected abstract validateInput(document: Document): boolean;
  protected abstract formatOutput(result: any): any;
}

/**
 * Abstract Base Agent for Legal Analysis
 */
export abstract class BaseLegalAgent {
  protected tools: any[];
  protected llm: ChatOpenAI;
  protected logger: Logger;

  constructor(llm: ChatOpenAI, tools: any[]) {
    this.llm = llm;
    this.tools = tools;
    this.logger = Logger.getInstance();
  }

  abstract execute(input: string): Promise<any>;
}

/**
 * Abstract Base Retriever
 */
export abstract class BaseRetriever {
  protected vectorStore: any;
  protected logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  abstract search(query: string, k?: number): Promise<Document[]>;
}

/**
 * Abstract Base Embeddings
 */
export abstract class BaseEmbeddings {
  abstract embedQuery(text: string): Promise<number[]>;
  abstract embedDocuments(documents: string[]): Promise<number[][]>;
}

/**
 * LLM Factory for creating different language models
 */
export class LLMFactory {
  private static instance: LLMFactory;
  private logger = Logger.getInstance();

  static getInstance(): LLMFactory {
    if (!LLMFactory.instance) {
      LLMFactory.instance = new LLMFactory();
    }
    return LLMFactory.instance;
  }

  /**
   * Create LLM for critical analysis (high accuracy, low temperature)
   */
  createAnalysisLLM(): ChatOpenAI {
    return new ChatOpenAI({
      openAIApiKey: env.OPENAI_API_KEY,
      modelName: "gpt-4-turbo-preview",
      temperature: 0.1, // Low temperature for factual accuracy
      maxTokens: 4000,
      maxRetries: 3,
      modelKwargs: {
        response_format: { type: "json_object" } // For structured outputs
      }
    });
  }

  /**
   * Create LLM for text generation (moderate creativity)
   */
  createGenerationLLM(): ChatOpenAI {
    return new ChatOpenAI({
      openAIApiKey: env.OPENAI_API_KEY,
      modelName: "gpt-3.5-turbo-1106", // More cost-effective
      temperature: 0.3,
      maxTokens: 2000,
      maxRetries: 2
    });
  }

  /**
   * Create streaming LLM for real-time analysis
   */
  createStreamingLLM(): ChatOpenAI {
    return new ChatOpenAI({
      openAIApiKey: env.OPENAI_API_KEY,
      modelName: "gpt-3.5-turbo",
      temperature: 0.2,
      maxTokens: 1000,
      streaming: true
    });
  }
}

/**
 * Embedding Factory for creating different embedding models
 */
export class EmbeddingFactory {
  private static instance: EmbeddingFactory;
  private logger = Logger.getInstance();

  static getInstance(): EmbeddingFactory {
    if (!EmbeddingFactory.instance) {
      EmbeddingFactory.instance = new EmbeddingFactory();
    }
    return EmbeddingFactory.instance;
  }

  /**
   * Create multilingual embeddings (primary for DACH region)
   */
  createMultilingualEmbeddings(): HuggingFaceInferenceEmbeddings {
    return new HuggingFaceInferenceEmbeddings({
      apiKey: env.HUGGINGFACE_API_KEY,
      model: "intfloat/multilingual-e5-large" // 1024 dims, 94 languages
    });
  }

  /**
   * Create OpenAI embeddings (fallback for English/general texts)
   */
  createOpenAIEmbeddings(): OpenAIEmbeddings {
    return new OpenAIEmbeddings({
      openAIApiKey: env.OPENAI_API_KEY,
      modelName: "text-embedding-3-small", // 1536 dims, cost-effective
      maxRetries: 3
    });
  }

  /**
   * Create legal-specialized embeddings
   */
  createLegalEmbeddings(): HuggingFaceInferenceEmbeddings {
    return new HuggingFaceInferenceEmbeddings({
      apiKey: env.HUGGINGFACE_API_KEY,
      model: "nlpaueb/legal-bert-base-uncased" // 768 dims, legal domain
    });
  }

  /**
   * Select best embedding model based on document type and language
   */
  selectEmbeddingModel(documentType: string, language: string): BaseEmbeddings {
    // For legal documents in German/French/Italian
    if (['contract', 'legal_opinion', 'regulation'].includes(documentType) && 
        ['de', 'fr', 'it'].includes(language)) {
      this.logger.info('Selected multilingual embeddings for legal document', {
        documentType,
        language,
        model: 'multilingual-e5-large'
      });
      return this.createMultilingualEmbeddings() as any;
    }

    // For English legal documents
    if (['contract', 'legal_opinion'].includes(documentType) && language === 'en') {
      this.logger.info('Selected legal embeddings for English legal document', {
        documentType,
        language,
        model: 'legal-bert-base-uncased'
      });
      return this.createLegalEmbeddings() as any;
    }

    // Default: OpenAI embeddings
    this.logger.info('Selected OpenAI embeddings as default', {
      documentType,
      language,
      model: 'text-embedding-3-small'
    });
    return this.createOpenAIEmbeddings() as any;
  }
}

/**
 * Concrete Factory for Contract Analysis
 */
export class ContractAnalysisFactory implements ILegalAnalysisFactory {
  private llmFactory = LLMFactory.getInstance();
  private embeddingFactory = EmbeddingFactory.getInstance();
  private logger = Logger.getInstance();

  async createChain(): Promise<BaseLegalChain> {
    const llm = this.createLLM();
    const embeddings = await this.createEmbeddings();
    
    // Import ContractAnalysisChain when implemented
    // return new ContractAnalysisChain(llm, embeddings);
    throw new Error('ContractAnalysisChain not yet implemented');
  }

  async createAgent(): Promise<BaseLegalAgent> {
    const llm = this.createLLM();
    const tools = await this.createTools();
    
    // Import ContractAnalysisAgent when implemented
    // return new ContractAnalysisAgent(llm, tools);
    throw new Error('ContractAnalysisAgent not yet implemented');
  }

  async createRetriever(): Promise<BaseRetriever> {
    // Import ContractRetriever when implemented
    // return new ContractRetriever();
    throw new Error('ContractRetriever not yet implemented');
  }

  async createEmbeddings(): Promise<BaseEmbeddings> {
    return this.embeddingFactory.createMultilingualEmbeddings() as any;
  }

  createLLM(): ChatOpenAI {
    return this.llmFactory.createAnalysisLLM();
  }

  private async createTools(): Promise<any[]> {
    // Return contract-specific tools
    return [];
  }
}

/**
 * Concrete Factory for GDPR Compliance Analysis
 */
export class GDPRComplianceFactory implements ILegalAnalysisFactory {
  private llmFactory = LLMFactory.getInstance();
  private embeddingFactory = EmbeddingFactory.getInstance();
  private logger = Logger.getInstance();

  async createChain(): Promise<BaseLegalChain> {
    const llm = this.createLLM();
    const embeddings = await this.createEmbeddings();
    
    // Import GDPRComplianceChain when implemented
    // return new GDPRComplianceChain(llm, embeddings);
    throw new Error('GDPRComplianceChain not yet implemented');
  }

  async createAgent(): Promise<BaseLegalAgent> {
    const llm = this.createLLM();
    const tools = await this.createTools();
    
    // Import GDPRComplianceAgent when implemented
    // return new GDPRComplianceAgent(llm, tools);
    throw new Error('GDPRComplianceAgent not yet implemented');
  }

  async createRetriever(): Promise<BaseRetriever> {
    // Import GDPRRetriever when implemented
    // return new GDPRRetriever();
    throw new Error('GDPRRetriever not yet implemented');
  }

  async createEmbeddings(): Promise<BaseEmbeddings> {
    return this.embeddingFactory.createMultilingualEmbeddings() as any;
  }

  createLLM(): ChatOpenAI {
    return this.llmFactory.createAnalysisLLM();
  }

  private async createTools(): Promise<any[]> {
    // Return GDPR-specific tools
    return [];
  }
}

/**
 * Factory selector based on analysis type
 */
export class AnalysisFactorySelector {
  static getFactory(analysisType: string): ILegalAnalysisFactory {
    switch (analysisType.toLowerCase()) {
      case 'contract_analysis':
      case 'contract_risk':
        return new ContractAnalysisFactory();
      
      case 'gdpr_compliance':
      case 'data_protection':
        return new GDPRComplianceFactory();
      
      default:
        // Default to contract analysis
        return new ContractAnalysisFactory();
    }
  }
}
