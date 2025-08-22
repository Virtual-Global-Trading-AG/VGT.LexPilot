import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Logger } from '../utils/logger';
import { AnalysisService } from './AnalysisService';
import { TextExtractionService } from './TextExtractionService';
import { FirestoreService } from './FirestoreService';
import { VectorStoreService } from './VectorStoreService';
import { LLMFactory } from '../factories/LLMFactory';
import { Analysis, AnalysisResult, AnalysisType, AnalysisStatus, Finding, FindingSeverity, FindingType, Recommendation, RecommendationType, Priority, TextLocation, AnonymizedKeyword } from '../models';
import { v4 as uuidv4 } from 'uuid';
import { encoding_for_model } from 'tiktoken';
import OpenAI from 'openai';
import * as fs from 'fs';

export interface ContractSection {
  id: string;
  content: string;
  title?: string;
  startIndex: number;
  endIndex: number;
}

export interface GeneratedQuery {
  query: string;
  context: string;
  relevanceScore?: number;
}

export interface DocumentContext {
  documentType: string;
  businessDomain: string;
  keyTerms: string[];
  contextDescription: string;
}

export interface SectionAnalysisResult {
  sectionId: string;
  sectionContent: string;
  queries?: GeneratedQuery[];
  legalContext?: any[];
  complianceAnalysis: {
    isCompliant: boolean;
    confidence: number;
    reasoning: string;
    violations: string[];
  };
  findings: Finding[];
}

// Compact data structure interfaces for Firestore 1MB limit optimization
export interface CompactSectionResult {
  sectionId: string;
  sectionContent: string;
  queries?: GeneratedQuery[];
  legalContext?: any[];
  complianceAnalysis: {
    isCompliant: boolean;
    confidence: number;
    reasoning: string;
    violations: string[];
  };
  findingIds: string[]; // Only IDs instead of full Finding objects
}

export interface AnalysisDetails {
  items: {
    [key: string]: Finding | Recommendation; // Map of ID to full object
  };
}

export interface SwissObligationAnalysisResult {
  analysisId: string;
  documentId: string;
  userId: string;
  documentContext: DocumentContext;
  sections: SectionAnalysisResult[];
  overallCompliance: {
    isCompliant: boolean;
    complianceScore: number;
    summary: string;
  };
  createdAt: Date;
  completedAt?: Date;
}

export class SwissObligationLawService {
  private logger = Logger.getInstance();
  private analysisService: AnalysisService;
  private firestoreService: FirestoreService;
  private vectorStoreService: VectorStoreService;
  private llm: ChatOpenAI;

  constructor(
    analysisService: AnalysisService,
    firestoreService: FirestoreService
  ) {
    this.analysisService = analysisService;
    this.firestoreService = firestoreService;
    this.vectorStoreService = new VectorStoreService();
    const llmFactory = new LLMFactory();
    this.llm = llmFactory.createAnalysisLLM();
  }

  /**
   * Analyzes a given contract against Swiss Obligation Law (OR) and provides a comprehensive compliance analysis.
   *
   * This analysis includes evaluating the document's sections for compliance with specific Swiss Obligation Law articles,
   * identifying any invalid or abusive clauses, assessing transparency and understandability, and summarizing the results
   * structured in JSON format.
   *
   * @param {string} input - The input query or text related to the contract being analyzed.
   * @param {string} userId - The ID of the user initiating the analysis process.
   * @param {string} vectorStoreId - The identifier for the vector store to be used for querying relevant legal information.
   * @param {string} documentId - The unique identifier of the document being analyzed.
   * @param {Buffer} documentFileBuffer - A buffer containing the contract document file content for analysis.
   * @param {function(progress: number, message: string): void} [progressCallback] - An optional callback function to report the progress of the analysis.
   * @return {Promise<SwissObligationAnalysisResult>} A promise that resolves with the compliance analysis results,
   * including structured insights on document context, compliance scores, and violations.
   */
  public async analyzeContractWithObligationLaw(
    input: string,
    userId: string,
    vectorStoreId: string,
    documentId: string,
    fileName: string,
    documentFileBuffer: Buffer,
    progressCallback?: (progress: number, message: string) => void,
    anonymizedKeywords?: AnonymizedKeyword[]
  ): Promise<SwissObligationAnalysisResult> {
    const analysisId = uuidv4();
    const createDate = new Date();

    // Initialize OpenAI client and uploadedFile variable in broader scope
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    let uploadedFile: any = null;

    try {
      this.logger.info('Starting vector database query', {
        input,
        userId,
        vectorStoreId,
        fileName,
        documentFileBufferSize: documentFileBuffer.length
      });

      progressCallback?.(5, 'Search against vector database started');

      const base64String = documentFileBuffer.toString('base64');

      this.logger.info('file as base64', {
        size: base64String.length
      });

      const response = await openai.responses.create({
        model: "gpt-5-mini-2025-08-07",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Du bist Experte für Schweizer Obligationenrecht.  
Analysiere den Vertrag nach OR (Art. 1–551), wobei du zuerst den Vertragstext und dann deine Vektordatenbank (OR) berücksichtigst.  
Konvertierungsfehler (z. B. falsche Zeichen, Umbrüche) korrigierst du stillschweigend nur zur Lesbarkeit, sie dürfen nicht in die Analyse einfließen.  
Ignoriere Platzhalter (ANONYM_x).  

Analysiere:  
- Dokumenttyp, Geschäftsbereich, Schlüsselbegriffe  
- Relevante Klauseln und Vertragstyp  
- Compliance mit OR (nur relevante Artikel prüfen)  
- Ungültige/missbräuchliche Klauseln  
- Transparenz und Verständlichkeit  
- Strukturierung in logische Abschnitte mit Einzelbewertung  

Antwort **ausschließlich** als gültiges JSON-Objekt:  

{
  "documentContext": {
    "documentType": string,
    "businessDomain": string,
    "keyTerms": string[],
    "contextDescription": string
  },
  "sections": [
    {
      "sectionId": string,
      "sectionContent": string,
      "complianceAnalysis": {
        "isCompliant": boolean,
        "confidence": number,
        "reasoning": string,
        "violations": string[],
        "recommendations": string[]
      }
    }
  ],
  "overallCompliance": {
    "isCompliant": boolean,
    "complianceScore": number,
    "summary": string,
    "recommendations": string[]
  }
}`,
              },
              {
                type: "input_file",
                filename: fileName,
                file_data: `data:application/pdf;base64,${base64String}`,
              },
            ],
          },
        ],
        tools: [
          {
            type: "file_search",
            vector_store_ids: [vectorStoreId ?? '']
          },
        ],
        text: {
          format: {
            type: 'json_object'
          }
        }
      });

      progressCallback?.(70, 'Processing OpenAI response...');

      const responseContent = response.output_text;

      if (!responseContent) {
        throw new Error('No response from OpenAI');
      }

      // Parse the JSON response
      let analysisData;
      try {
        // Log the raw response for debugging
        this.logger.info('Raw OpenAI response received', {
          analysisId,
          responseLength: responseContent.length,
          responsePreview: responseContent.substring(0, 200) + '...'
        });

        // Since we're using response_format: json_object, the response should be pure JSON
        // But let's still try to extract JSON in case there's any wrapper text
        let jsonString = responseContent.trim();

        // Try to extract JSON if there's additional text
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonString = jsonMatch[0];
        }

        // Parse the JSON
        analysisData = JSON.parse(jsonString);

        // Validate the structure
        if (!analysisData.documentContext || !analysisData.sections || !analysisData.overallCompliance) {
          throw new Error('Missing required fields in OpenAI response');
        }

        // Validate data types
        if (typeof analysisData.overallCompliance.isCompliant !== 'boolean') {
          this.logger.warn('Converting isCompliant to boolean', {
            originalValue: analysisData.overallCompliance.isCompliant,
            type: typeof analysisData.overallCompliance.isCompliant
          });
          analysisData.overallCompliance.isCompliant = analysisData.overallCompliance.isCompliant === true || analysisData.overallCompliance.isCompliant === 'true';
        }

        if (typeof analysisData.overallCompliance.complianceScore !== 'number') {
          this.logger.warn('Converting complianceScore to number', {
            originalValue: analysisData.overallCompliance.complianceScore,
            type: typeof analysisData.overallCompliance.complianceScore
          });
          analysisData.overallCompliance.complianceScore = parseFloat(analysisData.overallCompliance.complianceScore) || 0;
        }

        // Validate sections
        if (Array.isArray(analysisData.sections)) {
          analysisData.sections.forEach((section: any, index: number) => {
            if (section.complianceAnalysis) {
              if (typeof section.complianceAnalysis.isCompliant !== 'boolean') {
                this.logger.warn(`Converting section ${index} isCompliant to boolean`, {
                  originalValue: section.complianceAnalysis.isCompliant,
                  type: typeof section.complianceAnalysis.isCompliant
                });
                section.complianceAnalysis.isCompliant = section.complianceAnalysis.isCompliant === true || section.complianceAnalysis.isCompliant === 'true';
              }

              if (typeof section.complianceAnalysis.confidence !== 'number') {
                this.logger.warn(`Converting section ${index} confidence to number`, {
                  originalValue: section.complianceAnalysis.confidence,
                  type: typeof section.complianceAnalysis.confidence
                });
                section.complianceAnalysis.confidence = parseFloat(section.complianceAnalysis.confidence) || 0;
              }

              if (!Array.isArray(section.complianceAnalysis.violations)) {
                this.logger.warn(`Converting section ${index} violations to array`, {
                  originalValue: section.complianceAnalysis.violations,
                  type: typeof section.complianceAnalysis.violations
                });
                section.complianceAnalysis.violations = [];
              }
            }
          });
        }

        this.logger.info('Successfully parsed and validated OpenAI JSON response', {
          analysisId,
          sectionsCount: analysisData.sections?.length || 0,
          overallCompliant: analysisData.overallCompliance?.isCompliant
        });

        // Apply de-anonymization if anonymized keywords were provided
        if (anonymizedKeywords && anonymizedKeywords.length > 0) {
          this.logger.info('Starting de-anonymization of analysis results', {
            analysisId,
            keywordsCount: anonymizedKeywords.length
          });

          const textExtractionService = new TextExtractionService();

          // De-anonymize document context
          if (analysisData.documentContext) {
            if (analysisData.documentContext.contextDescription) {
              analysisData.documentContext.contextDescription = textExtractionService.reverseAnonymization(
                analysisData.documentContext.contextDescription,
                anonymizedKeywords
              );
            }
            if (Array.isArray(analysisData.documentContext.keyTerms)) {
              analysisData.documentContext.keyTerms = analysisData.documentContext.keyTerms.map((term: string) =>
                textExtractionService.reverseAnonymization(term, anonymizedKeywords)
              );
            }
          }

          // De-anonymize sections
          if (Array.isArray(analysisData.sections)) {
            analysisData.sections.forEach((section: any, index: number) => {
              if (section.sectionContent) {
                section.sectionContent = textExtractionService.reverseAnonymization(
                  section.sectionContent,
                  anonymizedKeywords
                );
              }
              if (section.complianceAnalysis && section.complianceAnalysis.reasoning) {
                section.complianceAnalysis.reasoning = textExtractionService.reverseAnonymization(
                  section.complianceAnalysis.reasoning,
                  anonymizedKeywords
                );
              }
              if (section.complianceAnalysis && Array.isArray(section.complianceAnalysis.violations)) {
                section.complianceAnalysis.violations = section.complianceAnalysis.violations.map((violation: string) =>
                  textExtractionService.reverseAnonymization(violation, anonymizedKeywords)
                );
              }
            });
          }

          // De-anonymize overall compliance summary
          if (analysisData.overallCompliance && analysisData.overallCompliance.summary) {
            analysisData.overallCompliance.summary = textExtractionService.reverseAnonymization(
              analysisData.overallCompliance.summary,
              anonymizedKeywords
            );
          }

          this.logger.info('De-anonymization completed', {
            analysisId,
            keywordsCount: anonymizedKeywords.length
          });
        }

      } catch (parseError) {
        this.logger.error('Failed to parse OpenAI response as JSON', parseError as Error, {
          analysisId,
          responseContent: responseContent.substring(0, 1000), // Log first 1000 chars for debugging
          responseLength: responseContent.length,
          errorMessage: (parseError as Error).message
        });
        throw new Error(`Invalid response format from OpenAI: ${(parseError as Error).message}`);
      }

      progressCallback?.(80, 'Creating analysis result...');

      // Transform the response to match our expected structure
      const sectionResults: SectionAnalysisResult[] = analysisData.sections.map((section: any) => ({
        sectionId: section.sectionId || uuidv4(),
        sectionContent: section.sectionContent || '',
        complianceAnalysis: {
          isCompliant: section.complianceAnalysis?.isCompliant || false,
          confidence: section.complianceAnalysis?.confidence || 0,
          reasoning: section.complianceAnalysis?.reasoning || '',
          violations: section.complianceAnalysis?.violations || []
        },
        findings: [] // Empty for now, could be enhanced later
      }));

      // Create the final result
      const result: SwissObligationAnalysisResult = {
        analysisId,
        documentId,
        userId,
        documentContext: {
          documentType: analysisData.documentContext?.documentType || 'Unbekannter Vertragstyp',
          businessDomain: analysisData.documentContext?.businessDomain || 'Unbekannte Domäne',
          keyTerms: analysisData.documentContext?.keyTerms || [],
          contextDescription: analysisData.documentContext?.contextDescription || 'Kontextanalyse nicht verfügbar'
        },
        sections: sectionResults,
        overallCompliance: {
          isCompliant: analysisData.overallCompliance?.isCompliant || false,
          complianceScore: analysisData.overallCompliance?.complianceScore || 0,
          summary: analysisData.overallCompliance?.summary || 'Keine Zusammenfassung verfügbar'
        },
        createdAt: createDate,
        completedAt: new Date()
      };

      // Save results to Firestore
      progressCallback?.(90, 'Saving analysis results...');
      await this.saveAnalysisResult(result);

      progressCallback?.(100, 'Direct PDF analysis completed successfully');

      this.logger.info('Direct PDF analysis against Swiss obligation law completed', {
        analysisId,
        documentId,
        userId,
        sectionCount: sectionResults.length,
        overallCompliant: result.overallCompliance.isCompliant
      });

      // Clean up uploaded file from OpenAI
      if (uploadedFile) {
        try {
          await openai.files.delete(uploadedFile.id);
          this.logger.debug('Cleaned up uploaded file from OpenAI', { fileId: uploadedFile.id });
        } catch (cleanupError) {
          this.logger.warn('Failed to cleanup uploaded file from OpenAI', cleanupError as Error);
        }
      }

      return result;

    } catch (error) {
      // Clean up uploaded file from OpenAI in case of error
      if (uploadedFile) {
        try {
          await openai.files.delete(uploadedFile.id);
          this.logger.debug('Cleaned up uploaded file from OpenAI after error', { fileId: uploadedFile.id });
        } catch (cleanupError) {
          this.logger.warn('Failed to cleanup uploaded file from OpenAI after error', cleanupError as Error);
        }
      }

      this.logger.error('Error in vector analysis against Swiss obligation law', error as Error, {
        analysisId,
        documentFileBufferSize: documentFileBuffer.length,
        userId
      });
      throw error;
    }
  }

  /**
   * Save analysis result to Firestore with compact structure to avoid 1MB limit
   */
  private async saveAnalysisResult(result: SwissObligationAnalysisResult): Promise<void> {
    try {
      // Create compact sections and collect all details
      const compactSections: CompactSectionResult[] = [];
      const allDetails: AnalysisDetails = { items: {} };

      result.sections.forEach(section => {
        // Extract finding and recommendation IDs
        const findingIds = section.findings.map(f => f.id);

        // Create compact section
        const compactSection: CompactSectionResult = {
          sectionId: section.sectionId,
          sectionContent: section.sectionContent,
          // queries: section.queries,
          //legalContext: section.legalContext,
          complianceAnalysis: section.complianceAnalysis,
          findingIds
        };

        compactSections.push(compactSection);

        // Add full objects to details map
        section.findings.forEach(finding => {
          allDetails.items[finding.id] = finding;
        });
      });

      // Prepare main document with compact sections
      const mainDocData = {
        analysisId: result.analysisId,
        documentId: result.documentId,
        userId: result.userId,
        documentContext: result.documentContext,
        sections: compactSections,
        overallCompliance: result.overallCompliance,
        createdAt: result.createdAt.toISOString(),
        completedAt: result.completedAt?.toISOString()
      };

      // Prepare batch operations
      const batchOperations = [
        {
          path: `swissObligationAnalyses/${result.analysisId}`,
          data: mainDocData
        },
        {
          path: `swissObligationAnalyses/${result.analysisId}/details/items`,
          data: allDetails
        }
      ];

      // Execute batch operation for atomic save
      await this.firestoreService.saveBatch(batchOperations);

      this.logger.info('Swiss obligation analysis result saved with compact structure', {
        analysisId: result.analysisId,
        documentId: result.documentId,
        userId: result.userId,
        sectionsCount: compactSections.length,
        detailsCount: Object.keys(allDetails.items).length
      });
    } catch (error) {
      this.logger.error('Error saving Swiss obligation analysis result', error as Error, {
        analysisId: result.analysisId
      });
      throw error;
    }
  }

  /**
   * Get analysis result by ID and reconstruct full structure from compact data
   */
  public async getAnalysisResult(analysisId: string, userId: string): Promise<SwissObligationAnalysisResult | null> {
    try {
      // Load main document with compact sections
      const mainResult = await this.firestoreService.getDocument(analysisId, userId);

      if (!mainResult || mainResult.userId !== userId) {
        return null;
      }

      // Load details from sub-collection
      const detailsPath = `swissObligationAnalyses/${analysisId}/details/items`;
      const details = await this.firestoreService.getSubcollectionDocument(detailsPath) as AnalysisDetails | null;

      if (!details) {
        this.logger.warn('Details not found for analysis, returning compact structure', { analysisId });
        // Fallback: return with empty findings and recommendations if details are missing
        const fallbackSections: SectionAnalysisResult[] = (mainResult.sections as CompactSectionResult[]).map(compactSection => ({
          sectionId: compactSection.sectionId,
          sectionContent: compactSection.sectionContent,
          //queries: compactSection.queries,
          //legalContext: compactSection.legalContext,
          complianceAnalysis: compactSection.complianceAnalysis,
          findings: [],
          recommendations: []
        }));

        return {
          ...mainResult,
          sections: fallbackSections,
          createdAt: new Date(mainResult.createdAt),
          completedAt: mainResult.completedAt ? new Date(mainResult.completedAt) : undefined
        } as SwissObligationAnalysisResult;
      }

      // Reconstruct full sections by combining compact data with details
      const fullSections: SectionAnalysisResult[] = (mainResult.sections as CompactSectionResult[]).map(compactSection => {
        // Reconstruct findings from IDs
        const findings: Finding[] = compactSection.findingIds.map(id => {
          const finding = details.items[id] as Finding;
          if (!finding) {
            this.logger.warn('Finding not found in details', { analysisId, findingId: id });
            return null;
          }
          return finding;
        }).filter(Boolean) as Finding[];

        return {
          sectionId: compactSection.sectionId,
          sectionContent: compactSection.sectionContent,
          queries: compactSection.queries,
          legalContext: compactSection.legalContext,
          complianceAnalysis: compactSection.complianceAnalysis,
          findings
        };
      });

      return {
        ...mainResult,
        sections: fullSections,
        createdAt: new Date(mainResult.createdAt),
        completedAt: mainResult.completedAt ? new Date(mainResult.completedAt) : undefined
      } as SwissObligationAnalysisResult;
    } catch (error) {
      this.logger.error('Error getting Swiss obligation analysis result', error as Error, {
        analysisId,
        userId
      });
      return null;
    }
  }

  /**
   * List user's analysis results
   */
  public async listUserAnalyses(userId: string, limit: number = 10): Promise<SwissObligationAnalysisResult[]> {
    try {
      // For now, return empty array - this would need to be implemented
      // with proper Firestore collection queries when the collection structure is defined
      this.logger.info('Listing user Swiss obligation analyses', { userId, limit });
      return [];
    } catch (error) {
      this.logger.error('Error listing user Swiss obligation analyses', error as Error, {
        userId
      });
      return [];
    }
  }

  /**
   * Get analysis results by document ID
   */
  public async getAnalysesByDocumentId(documentId: string, userId: string): Promise<SwissObligationAnalysisResult[]> {
    try {
      this.logger.info('Getting Swiss obligation analyses by document ID', { documentId, userId });

      // Query Firestore for analyses with the given documentId
      const db = this.firestoreService['db'] || require('firebase-admin').firestore();
      const analysesRef = db.collection('swissObligationAnalyses');

      const querySnapshot = await analysesRef
      .where('documentId', '==', documentId)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

      const analyses: SwissObligationAnalysisResult[] = [];

      // Process each analysis and reconstruct full structure
      for (const doc of querySnapshot.docs) {
        const data = doc.data();

        // Load details from sub-collection for this analysis
        const detailsPath = `swissObligationAnalyses/${data.analysisId}/details/items`;
        const details = await this.firestoreService.getSubcollectionDocument(detailsPath) as AnalysisDetails | null;

        let fullSections: SectionAnalysisResult[];

        if (!details) {
          this.logger.warn('Details not found for analysis, using fallback structure', { analysisId: data.analysisId });
          // Fallback: return with empty findings and recommendations if details are missing
          fullSections = (data.sections as CompactSectionResult[]).map(compactSection => ({
            sectionId: compactSection.sectionId,
            sectionContent: compactSection.sectionContent,
            queries: compactSection.queries || [],
            legalContext: compactSection.legalContext || [],
            complianceAnalysis: compactSection.complianceAnalysis || {
              isCompliant: false,
              confidence: 0,
              reasoning: '',
              violations: [],
              recommendations: []
            },
            findings: [],
            recommendations: []
          }));
        } else {
          // Reconstruct full sections by combining compact data with details
          fullSections = (data.sections as CompactSectionResult[]).map(compactSection => {
            // Reconstruct findings from IDs
            const findings: Finding[] = (compactSection.findingIds || []).map(id => {
              const finding = details.items[id] as Finding;
              if (!finding) {
                this.logger.warn('Finding not found in details', { analysisId: data.analysisId, findingId: id });
                return null;
              }
              return finding;
            }).filter(Boolean) as Finding[];

            return {
              sectionId: compactSection.sectionId,
              sectionContent: compactSection.sectionContent,
              queries: compactSection.queries || [],
              legalContext: compactSection.legalContext || [],
              complianceAnalysis: compactSection.complianceAnalysis || {
                isCompliant: false,
                confidence: 0,
                reasoning: '',
                violations: [],
                recommendations: []
              },
              findings
            };
          });
        }

        analyses.push({
          analysisId: data.analysisId,
          documentId: data.documentId,
          userId: data.userId,
          documentContext: data.documentContext,
          sections: fullSections,
          overallCompliance: data.overallCompliance,
          createdAt: new Date(data.createdAt),
          completedAt: data.completedAt ? new Date(data.completedAt) : undefined
        });
      }

      this.logger.info('Retrieved Swiss obligation analyses by document ID', {
        documentId,
        userId,
        count: analyses.length
      });

      return analyses;
    } catch (error) {
      this.logger.error('Error getting Swiss obligation analyses by document ID', error as Error, {
        documentId,
        userId
      });
      return [];
    }
  }
}
