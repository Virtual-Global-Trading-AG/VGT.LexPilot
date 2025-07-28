import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

// Lade Environment-Variablen
dotenvConfig();

// Zod Schema für Environment-Validierung
const envSchema = z.object({
  // Firebase
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_PRIVATE_KEY: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  FIREBASE_API_KEY: z.string().min(1),
  
  // OpenAI
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_EMBEDDINGS_MODEL: z.string().default('text-embedding-3-small'),
  OPENAI_CHAT_MODEL: z.string().default('gpt-4-turbo-preview'),
  
  // Pinecone
  PINECONE_API_KEY: z.string().min(1),
  PINECONE_ENVIRONMENT: z.string().default('gcp-starter'),
  PINECONE_INDEX_NAME: z.string().default('lexilot-legal-docs'),
  
  // HuggingFace
  HUGGINGFACE_API_KEY: z.string().optional(),
  
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  API_VERSION: z.string().default('v1'),
  
  // Security
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),
  
  // Cost Control
  MAX_TOKENS_PER_REQUEST: z.string().transform(Number).default('4000'),
  MAX_DAILY_COST_PER_USER: z.string().transform(Number).default('10.00'),
  BUDGET_WARNING_THRESHOLD: z.string().transform(Number).default('0.8'),
  
  // WebSocket
  WEBSOCKET_CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
  WEBSOCKET_PORT: z.string().transform(Number).default('3001'),
  
  // Document Processing
  MAX_FILE_SIZE_MB: z.string().transform(Number).default('50'),
  ALLOWED_FILE_TYPES: z.string().default('pdf,docx,txt,md'),
  
  // Cache
  CACHE_TTL_EMBEDDINGS: z.string().transform(Number).default('86400'),
  CACHE_TTL_ANALYSIS: z.string().transform(Number).default('3600'),
  
  // Swiss Legal Sources
  ADMIN_CH_API_ENDPOINT: z.string().url().default('https://fedlex.admin.ch/api'),
  CANTONAL_LAWS_ENABLED: z.string().transform(val => val === 'true').default('true'),
  
  // Monitoring
  SENTRY_DSN: z.string().optional(),
  ANALYTICS_ENABLED: z.string().transform(val => val === 'true').default('true'),
  
  // Legal Database APIs (Optional)
  FEDLEX_API_KEY: z.string().optional(),
  GOOGLE_SCHOLAR_API_KEY: z.string().optional()
});

// Validiere Environment-Variablen
const validateEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error('❌ Invalid environment variables:', error);
    throw new Error('Environment validation failed');
  }
};

// Exportiere validierte Konfiguration
export const env = validateEnv();

// Zusätzliche abgeleitete Konfigurationen
export const config = {
  // Firebase Admin SDK Config
  firebase: {
    type: 'service_account',
    projectId: env.FIREBASE_PROJECT_ID,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    apiKey: env.FIREBASE_API_KEY,
  },
  
  // OpenAI Config
  openai: {
    apiKey: env.OPENAI_API_KEY,
    models: {
      analysis: 'gpt-4-turbo-preview',
      generation: 'gpt-3.5-turbo-1106',
      embedding: 'text-embedding-3-small'
    },
    maxTokens: {
      analysis: 4000,
      generation: 2000
    },
    temperature: {
      analysis: 0.1,
      generation: 0.3
    }
  },
  
  // Pinecone Config
  pinecone: {
    apiKey: env.PINECONE_API_KEY,
    environment: env.PINECONE_ENVIRONMENT,
    indexName: env.PINECONE_INDEX_NAME,
    dimensions: 1536, // text-embedding-3-small
    metric: 'cosine'
  },
  
  // HuggingFace Config
  huggingface: {
    apiKey: env.HUGGINGFACE_API_KEY,
    models: {
      multilingual: 'intfloat/multilingual-e5-large',
      legal: 'nlpaueb/legal-bert-base-uncased'
    }
  },
  
  // Rate Limiting
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    message: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.'
  },
  
  // Document Processing
  documents: {
    maxFileSizeMB: env.MAX_FILE_SIZE_MB,
    allowedTypes: env.ALLOWED_FILE_TYPES.split(','),
    uploadPath: 'documents',
    processingTimeout: 300000 // 5 Minuten
  },
  
  // Cost Control
  billing: {
    maxTokensPerRequest: env.MAX_TOKENS_PER_REQUEST,
    maxDailyCostPerUser: env.MAX_DAILY_COST_PER_USER,
    warningThreshold: env.BUDGET_WARNING_THRESHOLD,
    costs: {
      'gpt-4-turbo-preview': {
        input: 0.01,  // per 1K tokens
        output: 0.03  // per 1K tokens
      },
      'gpt-3.5-turbo-1106': {
        input: 0.001, // per 1K tokens
        output: 0.002 // per 1K tokens
      },
      'text-embedding-3-small': {
        input: 0.00002 // per 1K tokens
      }
    }
  },
  
  // WebSocket
  websocket: {
    corsOrigin: env.WEBSOCKET_CORS_ORIGIN,
    port: env.WEBSOCKET_PORT,
    transports: ['websocket', 'polling']
  },
  
  // Cache
  cache: {
    embeddings: {
      ttl: env.CACHE_TTL_EMBEDDINGS,
      maxSize: 1000
    },
    analysis: {
      ttl: env.CACHE_TTL_ANALYSIS,
      maxSize: 500
    }
  },
  
  // Swiss Legal
  swissLegal: {
    adminChEndpoint: env.ADMIN_CH_API_ENDPOINT,
    cantonalLawsEnabled: env.CANTONAL_LAWS_ENABLED,
    supportedLanguages: ['de', 'fr', 'it', 'en'],
    jurisdictions: {
      federal: 'CH',
      cantons: [
        'AG', 'AI', 'AR', 'BE', 'BL', 'BS', 'FR', 'GE', 'GL', 'GR',
        'JU', 'LU', 'NE', 'NW', 'OW', 'SG', 'SH', 'SO', 'SZ', 'TG',
        'TI', 'UR', 'VD', 'VS', 'ZG', 'ZH'
      ]
    }
  },
  
  // Monitoring
  monitoring: {
    sentryDsn: env.SENTRY_DSN,
    analyticsEnabled: env.ANALYTICS_ENABLED,
    errorReporting: true,
    performanceTracking: env.NODE_ENV === 'production'
  }
} as const;

// Type für die Konfiguration
export type Config = typeof config;

// Environment Check für Production
export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
