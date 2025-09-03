import { env } from '@config/environment';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { AnonymizedKeyword, Finding, Recommendation } from '../models';
import { Logger } from '../utils/logger';
import { FirestoreService } from './FirestoreService';
import { TextExtractionService } from './TextExtractionService';

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

export interface ComplianceAnalysis {
  isCompliant: boolean;
  confidence: number;
  reasoning: string;
  violations: string[];
  recommendations: string[];
}

export interface OverallCompliance {
  isCompliant: boolean;
  complianceScore: number;
  summary: string;
}

export interface CountrySpecificConfiguration {
  iso2Code: string;
  country: string;
  legalFramework: string;
  systemPrompt: string;
}

export interface DocumentContext {
  documentType: string;
  businessDomain: string;
  keyTerms: string[];
  contextDescription: string;
  country: string;
  legalFramework: string;
}

export interface SectionAnalysisResult {
  sectionId: string;
  sectionContent: string;
  queries?: GeneratedQuery[];
  legalContext?: any[];
  complianceAnalysis: ComplianceAnalysis;
  findings: Finding[];
}

// Compact data structure interfaces for Firestore 1MB limit optimization
export interface CompactSectionResult {
  sectionId: string;
  sectionContent: string;
  queries?: GeneratedQuery[];
  legalContext?: any[];
  complianceAnalysis: ComplianceAnalysis;
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
  overallCompliance: OverallCompliance;
  createdAt: Date;
  completedAt?: Date;
  lawyerStatus?: 'UNCHECKED' | 'CHECK_PENDING' | 'APPROVED' | 'DECLINE';
  lawyerComment?: string;
}

export class AnalyseLawService {
  private logger = Logger.getInstance();
  private firestoreService: FirestoreService;
  private openAi: OpenAI;

  constructor(
    firestoreService: FirestoreService
  ) {
    this.firestoreService = firestoreService;
    // Initialize OpenAI client and uploadedFile variable in broader scope
    this.openAi = new OpenAI({
      apiKey: env.OPENAI_API_KEY
    });
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
  public async analyzeContract(
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

    this.logger.info('Starting contract analysis', {
      analysisId,
      documentId,
      userId,
      fileName,
      documentSize: documentFileBuffer.length,
      hasAnonymizedKeywords: !!(anonymizedKeywords && anonymizedKeywords.length > 0)
    });

    let uploadedFile: any = null;

    try {
      // Step 1: Prepare document for analysis
      const base64String = await this.prepareDocumentForAnalysis(documentFileBuffer, analysisId);
      progressCallback?.(5, 'Document prepared for analysis');

      // Step 2: Get country-specific analysis configuration
      const countryResponse = await this.getCountrySpecificConfiguration(fileName, base64String, analysisId);
      progressCallback?.(20, `Analyzing contract (region: ${countryResponse.iso2Code}) with OpenAI...`);

      // Step 3: Perform OpenAI analysis
      const rawAnalysisData = await this.performOpenAIAnalysis(
        countryResponse,
        fileName,
        base64String,
        vectorStoreId,
        analysisId
      );
      progressCallback?.(70, 'Processing OpenAI response...');

      // Step 4: Process and validate response
      const sanitizedData = await this.processOpenAIResponse(rawAnalysisData, analysisId);
      progressCallback?.(75, 'Response processed and validated');

      // Step 5: Apply de-anonymization if needed
      const finalData = await this.applyDeAnonymization(sanitizedData, anonymizedKeywords, analysisId);
      progressCallback?.(80, 'Creating analysis result...');

      // Step 6: Transform to final result structure
      const result = await this.transformToAnalysisResult(
        finalData,
        countryResponse,
        analysisId,
        documentId,
        userId,
        createDate
      );
      progressCallback?.(85, 'Analysis result created');

      // Step 7: Save results to Firestore
      await this.saveAnalysisResult(result);
      progressCallback?.(90, 'Analysis results saved');

      // Step 8: Cleanup
      await this.cleanupUploadedFile(uploadedFile);
      progressCallback?.(100, 'Contract analysis completed successfully');

      this.logger.info('Contract analysis completed successfully', {
        analysisId,
        documentId,
        userId,
        sectionCount: result.sections.length,
        overallCompliant: result.overallCompliance.isCompliant,
        processingTimeMs: new Date().getTime() - createDate.getTime()
      });

      return result;

    } catch (error) {
      await this.handleAnalysisError(error as Error, uploadedFile, analysisId, userId, documentFileBuffer.length);
      throw error;
    }
  }

  /**
   * Prepares the document for analysis by converting to base64 and logging
   */
  private async prepareDocumentForAnalysis(documentFileBuffer: Buffer, analysisId: string): Promise<string> {
    try {
      this.logger.info('Converting document to base64', {
        analysisId,
        originalSize: documentFileBuffer.length
      });

      const base64String = documentFileBuffer.toString('base64');

      this.logger.info('Document converted to base64 successfully', {
        analysisId,
        base64Size: base64String.length
      });

      return base64String;
    } catch (error) {
      this.logger.error('Failed to convert document to base64', error as Error, {
        analysisId,
        bufferSize: documentFileBuffer.length
      });
      throw new Error(`Document preparation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Gets country-specific configuration for analysis
   */
  private async getCountrySpecificConfiguration(
    fileName: string, 
    base64String: string, 
    analysisId: string
  ): Promise<CountrySpecificConfiguration> {
    try {
      this.logger.info('Determining country-specific configuration', {
        analysisId,
        fileName
      });

      const countryResponse = await this.countrySpecificPrompt(fileName, base64String);

      this.logger.info('Country-specific configuration determined', {
        analysisId,
        iso2Code: countryResponse.iso2Code,
        country: countryResponse.country,
        legalFramework: countryResponse.legalFramework,
        hasSystemPrompt: !!countryResponse.systemPrompt
      });

      return countryResponse;
    } catch (error) {
      this.logger.error('Failed to get country-specific configuration', error as Error, {
        analysisId,
        fileName
      });
      throw new Error(`Country configuration failed: ${(error as Error).message}`);
    }
  }

  /**
   * Performs the OpenAI analysis with proper error handling
   */
  private async performOpenAIAnalysis(
    countryResponse: CountrySpecificConfiguration,
    fileName: string,
    base64String: string,
    vectorStoreId: string,
    analysisId: string
  ): Promise<string> {
    try {
      this.logger.info('Starting OpenAI analysis', {
        analysisId,
        country: countryResponse.iso2Code,
        model: env.OPENAI_CHAT_MODEL,
        vectorStoreId
      });

      const response = await this.openAi.responses.create({
        model: env.OPENAI_CHAT_MODEL,
        service_tier: 'priority',
        input: [
          {
            role: 'system',
            content: countryResponse.systemPrompt
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `Analysiere den Vertrag, wobei du zuerst den Vertragstext und dann deine Vektordatenbank berücksichtigst.  
Konvertierungsfehler (z. B. falsche Zeichen, Umbrüche) korrigierst du stillschweigend nur zur Lesbarkeit, sie dürfen nicht in die Analyse einfliessen.  
Ignoriere Platzhalter (ANONYM_x).

Analysiere:  
- Dokumenttyp, Geschäftsbereich, Schlüsselbegriffe  
- Relevante Klauseln und Vertragstyp  
- Compliance mit Gesetz (nur relevante Artikel prüfen)  
- Ungültige/missbräuchliche Klauseln  
- Transparenz und Verständlichkeit  
- Strukturierung in logische Abschnitte mit Einzelbewertung  

**WICHTIG für recommendations pro section:**
- Wenn violations vorhanden sind (violations.length > 0): Füge konkrete Empfehlungen hinzu
- Wenn keine violations vorhanden sind: recommendations = []

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
      "sectionContent": string, // original text des abschnitts (Konvertierungsfehler korrigiert)
      "complianceAnalysis": {
        "isCompliant": boolean,
        "confidence": number,
        "reasoning": string,
        "violations": string[],
        "recommendations": string[] // Optional, nur wenn isCompliant=false
      }
    }
  ],
  "overallCompliance": {
    "isCompliant": boolean, // true wenn alle sections isCompliant=true
    "complianceScore": number, // 0 bis 1
    "summary": string
  }
}`,
              },
              {
                type: 'input_file',
                filename: fileName,
                file_data: `data:application/pdf;base64,${base64String}`,
              },
            ],
          },
        ],
        tools: [
          {
            type: 'file_search',
            vector_store_ids: [vectorStoreId ?? ''],
            filters: {
              key: 'region',
              type: 'eq',
              value: countryResponse.iso2Code.toUpperCase()
            }
          },
        ],
        text: {
          format: {
            type: 'json_object'
          }
        }
      });

      const responseContent = response.output_text;

      if (!responseContent) {
        throw new Error('No response content received from OpenAI');
      }

      this.logger.info('OpenAI analysis completed', {
        analysisId,
        responseLength: responseContent.length,
        responsePreview: responseContent.substring(0, 200) + '...'
      });

      return responseContent;
    } catch (error) {
      this.logger.error('OpenAI analysis failed', error as Error, {
        analysisId,
        country: countryResponse.iso2Code,
        model: env.OPENAI_CHAT_MODEL
      });
      throw new Error(`OpenAI analysis failed: ${(error as Error).message}`);
    }
  }

  /**
   * Processes and validates the OpenAI response
   */
  private async processOpenAIResponse(responseContent: string, analysisId: string): Promise<any> {
    try {
      this.logger.info('Processing OpenAI response', {
        analysisId,
        responseLength: responseContent.length
      });

      // Extract JSON from response
      let jsonString = responseContent.trim();
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonString = jsonMatch[0];
      }

      // Parse and sanitize the JSON
      const analysisData = JSON.parse(jsonString);
      const sanitizedData = this.sanitizeAnalysisData(analysisData);

      // Validate required structure
      if (!sanitizedData.documentContext || !sanitizedData.sections || !sanitizedData.overallCompliance) {
        throw new Error('Invalid OpenAI response structure - missing required fields');
      }

      this.logger.info('OpenAI response processed successfully', {
        analysisId,
        sectionsCount: sanitizedData.sections?.length || 0,
        overallCompliant: sanitizedData.overallCompliance?.isCompliant
      });

      return sanitizedData;
    } catch (error) {
      this.logger.error('Failed to process OpenAI response', error as Error, {
        analysisId,
        responseContent: responseContent.substring(0, 1000),
        responseLength: responseContent.length
      });
      throw new Error(`Response processing failed: ${(error as Error).message}`);
    }
  }

  /**
   * Applies de-anonymization to the analysis data if anonymized keywords are provided
   */
  private async applyDeAnonymization(
    sanitizedData: any,
    anonymizedKeywords?: AnonymizedKeyword[],
    analysisId?: string
  ): Promise<any> {
    if (!anonymizedKeywords || anonymizedKeywords.length === 0) {
      this.logger.debug('No anonymized keywords provided, skipping de-anonymization', { analysisId });
      return sanitizedData;
    }

    try {
      this.logger.info('Starting de-anonymization process', {
        analysisId,
        keywordsCount: anonymizedKeywords.length
      });

      const textExtractionService = new TextExtractionService();

      // De-anonymize document context
      if (sanitizedData.documentContext) {
        if (sanitizedData.documentContext.contextDescription) {
          sanitizedData.documentContext.contextDescription = textExtractionService.reverseAnonymization(
            sanitizedData.documentContext.contextDescription,
            anonymizedKeywords
          );
        }
        if (Array.isArray(sanitizedData.documentContext.keyTerms)) {
          sanitizedData.documentContext.keyTerms = sanitizedData.documentContext.keyTerms.map((term: string) =>
            textExtractionService.reverseAnonymization(term, anonymizedKeywords)
          );
        }
      }

      // De-anonymize sections
      if (Array.isArray(sanitizedData.sections)) {
        sanitizedData.sections.forEach((section: any) => {
          if (section.sectionContent) {
            section.sectionContent = textExtractionService.reverseAnonymization(
              section.sectionContent,
              anonymizedKeywords
            );
          }
          if (section.complianceAnalysis) {
            if (section.complianceAnalysis.reasoning) {
              section.complianceAnalysis.reasoning = textExtractionService.reverseAnonymization(
                section.complianceAnalysis.reasoning,
                anonymizedKeywords
              );
            }
            if (Array.isArray(section.complianceAnalysis.violations)) {
              section.complianceAnalysis.violations = section.complianceAnalysis.violations.map((violation: string) =>
                textExtractionService.reverseAnonymization(violation, anonymizedKeywords)
              );
            }
            if (Array.isArray(section.complianceAnalysis.recommendations)) {
              section.complianceAnalysis.recommendations = section.complianceAnalysis.recommendations.map((recommendation: string) =>
                textExtractionService.reverseAnonymization(recommendation, anonymizedKeywords)
              );
            }
          }
        });
      }

      // De-anonymize overall compliance summary
      if (sanitizedData.overallCompliance && sanitizedData.overallCompliance.summary) {
        sanitizedData.overallCompliance.summary = textExtractionService.reverseAnonymization(
          sanitizedData.overallCompliance.summary,
          anonymizedKeywords
        );
      }

      this.logger.info('De-anonymization completed successfully', {
        analysisId,
        keywordsCount: anonymizedKeywords.length
      });

      return sanitizedData;
    } catch (error) {
      this.logger.error('De-anonymization failed', error as Error, {
        analysisId,
        keywordsCount: anonymizedKeywords?.length || 0
      });
      throw new Error(`De-anonymization failed: ${(error as Error).message}`);
    }
  }

  /**
   * Transforms the processed data to the final analysis result structure
   */
  private async transformToAnalysisResult(
    finalData: any,
    countrySpecificConfig: CountrySpecificConfiguration,
    analysisId: string,
    documentId: string,
    userId: string,
    createDate: Date
  ): Promise<SwissObligationAnalysisResult> {
    try {
      this.logger.info('Transforming data to analysis result', {
        analysisId,
        sectionsCount: finalData.sections?.length || 0
      });

      // Transform sections
      const sectionResults: SectionAnalysisResult[] = finalData.sections.map((section: any) => ({
        sectionId: section.sectionId || uuidv4(),
        sectionContent: section.sectionContent || '',
        complianceAnalysis: {
          isCompliant: section.complianceAnalysis?.isCompliant || false,
          confidence: section.complianceAnalysis?.confidence || 0,
          reasoning: section.complianceAnalysis?.reasoning || '',
          violations: section.complianceAnalysis?.violations || [],
          recommendations: section.complianceAnalysis?.recommendations || []
        },
        findings: [] // Empty for now, could be enhanced later
      }));

      // Create the final result
      const result: SwissObligationAnalysisResult = {
        analysisId,
        documentId,
        userId,
        documentContext: {
          documentType: finalData.documentContext?.documentType || 'Unbekannter Vertragstyp',
          businessDomain: finalData.documentContext?.businessDomain || 'Unbekannte Domäne',
          keyTerms: finalData.documentContext?.keyTerms || [],
          contextDescription: finalData.documentContext?.contextDescription || 'Kontextanalyse nicht verfügbar',
          country: countrySpecificConfig.country,
          legalFramework: countrySpecificConfig.legalFramework
        },
        sections: sectionResults,
        overallCompliance: {
          isCompliant: finalData.overallCompliance?.isCompliant || false,
          complianceScore: finalData.overallCompliance?.complianceScore || 0,
          summary: finalData.overallCompliance?.summary || 'Keine Zusammenfassung verfügbar'
        },
        createdAt: createDate,
        completedAt: new Date()
      };

      this.logger.info('Analysis result transformation completed', {
        analysisId,
        sectionCount: sectionResults.length,
        overallCompliant: result.overallCompliance.isCompliant
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to transform analysis result', error as Error, {
        analysisId,
        documentId,
        userId
      });
      throw new Error(`Result transformation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Cleans up uploaded files from OpenAI
   */
  private async cleanupUploadedFile(uploadedFile: any): Promise<void> {
    if (!uploadedFile) {
      return;
    }

    try {
      await this.openAi.files.delete(uploadedFile.id);
      this.logger.debug('Successfully cleaned up uploaded file from OpenAI', { 
        fileId: uploadedFile.id 
      });
    } catch (error) {
      this.logger.error('Failed to cleanup uploaded file from OpenAI', error as Error, {
        fileId: uploadedFile.id
      });
    }
  }

  /**
   * Handles analysis errors with proper logging and cleanup
   */
  private async handleAnalysisError(
    error: Error,
    uploadedFile: any,
    analysisId: string,
    userId: string,
    documentSize: number
  ): Promise<void> {
    // Cleanup uploaded file
    await this.cleanupUploadedFile(uploadedFile);

    // Log the error with context
    this.logger.error('Contract analysis failed', error, {
      analysisId,
      userId,
      documentSize,
      errorMessage: error.message,
      errorStack: error.stack
    });
  }

  private sanitizeAnalysisData(data: any): any {
    return {
      ...data,
      overallCompliance: {
        ...data.overallCompliance,
        isCompliant: Boolean(data.overallCompliance?.isCompliant),
        complianceScore: Math.min(1, Math.max(0, parseFloat(data.overallCompliance?.complianceScore) || 0))
      },
      sections: (data.sections || []).map((section: any) => ({
        ...section,
        complianceAnalysis: {
          ...section.complianceAnalysis,
          isCompliant: Boolean(section.complianceAnalysis?.isCompliant),
          confidence: Math.min(1, Math.max(0, parseFloat(section.complianceAnalysis?.confidence) || 0)),
          violations: Array.isArray(section.complianceAnalysis?.violations)
            ? section.complianceAnalysis.violations
            : []
        }
      }))
    };
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
        completedAt: result.completedAt?.toISOString(),
        lawyerStatus: 'UNCHECKED' as const
      };

      // Prepare batch operations
      const batchOperations = [
        {
          path: `contractAnalyses/${result.analysisId}`,
          data: mainDocData
        },
        {
          path: `contractAnalyses/${result.analysisId}/details/items`,
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
      const detailsPath = `contractAnalyses/${analysisId}/details/items`;
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
          completedAt: mainResult.completedAt ? new Date(mainResult.completedAt) : undefined,
          lawyerStatus: mainResult.lawyerStatus || 'UNCHECKED'
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
        completedAt: mainResult.completedAt ? new Date(mainResult.completedAt) : undefined,
        lawyerStatus: mainResult.lawyerStatus || 'UNCHECKED'
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
  public async listUserAnalyses(userId: string, limit?: number): Promise<SwissObligationAnalysisResult[]> {
    try {
      this.logger.info('Listing user Swiss obligation analyses', { userId, limit });

      const db = this.firestoreService['db'] || require('firebase-admin').firestore();
      const analysesRef = db.collection('contractAnalyses');

      let query = analysesRef
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc');

      if (limit) {
        query = query.limit(limit);
      }

      const querySnapshot = await query.get();

      const analyses: SwissObligationAnalysisResult[] = [];

      // Process each analysis and reconstruct full structure
      for (const doc of querySnapshot.docs) {
        const data = doc.data();

        // Load details from sub-collection for this analysis
        const detailsPath = `contractAnalyses/${data.analysisId}/details/items`;
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
          completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
          lawyerStatus: data.lawyerStatus || 'UNCHECKED',
          lawyerComment: data.lawyerComment
        });
      }

      this.logger.info('Retrieved user Swiss obligation analyses', {
        userId,
        count: analyses.length
      });

      return analyses;
    } catch (error) {
      this.logger.error('Error listing user Swiss obligation analyses', error as Error, {
        userId
      });
      return [];
    }
  }

  /**
   * List shared analysis results for lawyers
   */
  public async listSharedAnalyses(userId: string, limit: number = 10): Promise<SwissObligationAnalysisResult[]> {
    try {
      this.logger.info('Listing shared Swiss obligation analyses for lawyer', { userId, limit });

      const db = this.firestoreService['db'] || require('firebase-admin').firestore();
      const analysesRef = db.collection('contractAnalyses');

      const querySnapshot = await analysesRef
      .where('sharedUserId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

      const analyses: SwissObligationAnalysisResult[] = [];

      // Process each analysis and reconstruct full structure
      for (const doc of querySnapshot.docs) {
        const data = doc.data();

        this.logger.info('Retrieved shared Swiss obligation analysis', { data });

        // Load details from sub-collection for this analysis
        const detailsPath = `contractAnalyses/${data.analysisId}/details/items`;
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
          completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
          lawyerStatus: data.lawyerStatus || 'UNCHECKED',
          lawyerComment: data.lawyerComment
        });
      }

      this.logger.info('Retrieved shared Swiss obligation analyses', {
        sharedUserId: userId,
        count: analyses.length
      });

      return analyses;
    } catch (error) {
      this.logger.error('Error listing shared Swiss obligation analyses', error as Error, {
        userId
      });
      return [];
    }
  }

  /**
   * Delete all analyses for a specific document
   */
  public async deleteAnalysesByDocumentId(documentId: string, userId: string): Promise<void> {
    try {
      this.logger.info('Deleting Swiss obligation analyses by document ID', { documentId, userId });

      // Query Firestore for analyses with the given documentId
      const db = this.firestoreService['db'] || require('firebase-admin').firestore();
      const analysesRef = db.collection('contractAnalyses');

      const querySnapshot = await analysesRef
      .where('documentId', '==', documentId)
      .where('userId', '==', userId)
      .get();

      // Delete each analysis and its details
      const batch = db.batch();
      let deletedCount = 0;

      for (const doc of querySnapshot.docs) {
        const data = doc.data();

        // Delete main analysis document
        batch.delete(doc.ref);

        // Delete details sub-collection document
        const detailsRef = db.doc(`contractAnalyses/${data.analysisId}/details/items`);
        batch.delete(detailsRef);

        deletedCount++;
      }

      // Execute batch deletion
      if (deletedCount > 0) {
        await batch.commit();
        this.logger.info('Successfully deleted Swiss obligation analyses', {
          documentId,
          userId,
          deletedCount
        });
      } else {
        this.logger.info('No analyses found to delete', { documentId, userId });
      }

    } catch (error) {
      this.logger.error('Error deleting Swiss obligation analyses by document ID', error as Error, {
        documentId,
        userId
      });
      throw error;
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
      const analysesRef = db.collection('contractAnalyses');

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
        const detailsPath = `contractAnalyses/${data.analysisId}/details/items`;
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
          completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
          lawyerStatus: data.lawyerStatus || 'UNCHECKED',
          lawyerComment: data.lawyerComment
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

  /**
   * Update analysis status
   */
  public async updateAnalysis(
    analysisId: string,
    sharedUserId: string,
    lawyerStatus?: 'UNCHECKED' | 'CHECK_PENDING' | 'APPROVED' | 'DECLINE'
  ): Promise<void> {
    try {
      this.logger.info('Updating analysis status', { analysisId, lawyerStatus });

      const db = this.firestoreService['db'] || require('firebase-admin').firestore();
      const analysisRef = db.collection('contractAnalyses').doc(analysisId);

      const updateData: any = {
        lawyerStatus,
        sharedUserId: sharedUserId,
        updatedAt: new Date().toISOString()
      };

      await analysisRef.update(updateData);

      this.logger.info('Analysis status updated successfully', { analysisId, lawyerStatus });
    } catch (error) {
      this.logger.error('Error updating analysis status', error as Error, {
        analysisId,
        lawyerStatus
      });
      throw error;
    }
  }

  /**
   * Submit lawyer analysis result (approve or decline)
   */
  public async submitLawyerAnalysisResult(
    analysisId: string,
    decision: 'APPROVED' | 'DECLINE',
    comment?: string
  ): Promise<void> {
    try {
      this.logger.info('Submitting lawyer analysis result', { analysisId, decision, hasComment: !!comment });

      const admin = require('firebase-admin');
      const db = admin.firestore();

      const analysisRef = db.collection('contractAnalyses').doc(analysisId);

      const updateData: any = {
        lawyerStatus: decision,
        sharedUserId: null,
        updatedAt: new Date().toISOString()
      };

      // Add comment only if decision is DECLINE and comment is provided
      if (decision === 'DECLINE' && comment) {
        updateData.lawyerComment = comment;
      }

      await analysisRef.update(updateData);

      this.logger.info('Lawyer analysis result submitted successfully', {
        analysisId,
        decision,
        hasComment: !!comment
      });
    } catch (error) {
      this.logger.error('Error submitting lawyer analysis result', error as Error, {
        analysisId,
        decision,
        hasComment: !!comment
      });
      throw error;
    }
  }

  private async countrySpecificPrompt(fileName: string, base64String: string): Promise<CountrySpecificConfiguration>{
    // Prompt für Modell
    const prompt = `Analysiere den folgenden Vertragstext und liefere ein JSON-Objekt:
      {
        "iso2Code": string,
        "country": string 
        "legalFramework": string,
        "systemPrompt": string
      }

      - iso2Code: ISO-2 Code des anwendbaren Rechts (CH, DE, AT, FR, GB, etc.). Wenn nicht ermittelbar, "NA".
      - country: Land ausgeschrieben welches dem ISO-2 Code entspricht
      - legalFramework: Relevanter Rechtsrahmen --> nur Hauptgesetz
      - "systemPrompt": Formuliere nach folgendem Muster einen Satz, in dem du das Land und den dort relevanten Rechtsrahmen einsetzt:
      Beispiel:
      "Du bist ein Schweizer Rechtsassistent, spezialisiert auf das Obligationenrecht (OR). Deine Aufgabe ist es, Verträge zu analysieren und deren Übereinstimmung mit dem OR zu bewerten."

      Passe Land und Rechtsrahmen dynamisch an:
        - Deutschland → Bürgerliches Gesetzbuch (BGB)
        - Österreich → Allgemeines Bürgerliches Gesetzbuch (ABGB)
        - Wenn Land unbekannt: "Du bist ein Rechtsassistent ohne spezifische Länderbindung. Deine Aufgabe ist es, Verträge zu analysieren."`;

    const response = await this.openAi.responses.create({
      model: env.OPENAI_CHAT_MODEL,
      service_tier: 'priority',
      input: [
        {
          role: 'system',
          content: 'Du bist ein Vertragsanalyst.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: prompt
            },
            {
              type: 'input_file',
              filename: fileName,
              file_data: `data:application/pdf;base64,${base64String}`,
            },
          ]
        }
      ],
      text: {
        format: {
          type: 'json_object'
        }
      }
    });

    const responseContent = response.output_text;

    if (!responseContent) {
      throw new Error('No response from OpenAI');
    }

    try {
      // Log the raw response for debugging
      this.logger.info('Raw OpenAI response received', {
        responseLength: responseContent.length,
        responsePreview: responseContent.substring(0, 200) + '...'
      });

      let jsonString = responseContent.trim();

      // Try to extract JSON if there's additional text
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonString = jsonMatch[0];
      }

      // Parse the JSON
      return JSON.parse(jsonString);

    } catch (parseError) {
      this.logger.error('Failed to parse OpenAI response as JSON', parseError as Error, {
        responseContent: responseContent.substring(0, 1000), // Log first 1000 chars for debugging
        responseLength: responseContent.length,
        errorMessage: (parseError as Error).message
      });
      throw new Error(`Invalid response format from OpenAI: ${(parseError as Error).message}`);
    }
  }
}
