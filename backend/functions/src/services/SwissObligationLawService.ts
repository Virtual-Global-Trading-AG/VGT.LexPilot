import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Logger } from '../utils/logger';
import { AnalysisService } from './AnalysisService';
import { TextExtractionService } from './TextExtractionService';
import { FirestoreService } from './FirestoreService';
import { LLMFactory } from '../factories/LLMFactory';
import { Analysis, AnalysisResult, AnalysisType, AnalysisStatus, Finding, FindingSeverity, FindingType, Recommendation, RecommendationType, Priority, TextLocation } from '../models';
import { v4 as uuidv4 } from 'uuid';
import { encoding_for_model } from 'tiktoken';

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
  queries: GeneratedQuery[];
  legalContext: any[];
  complianceAnalysis: {
    isCompliant: boolean;
    confidence: number;
    reasoning: string;
    violations: string[];
    recommendations: string[];
  };
  findings: Finding[];
  recommendations: Recommendation[];
}

// Compact data structure interfaces for Firestore 1MB limit optimization
export interface CompactSectionResult {
  sectionId: string;
  sectionContent: string;
  queries: GeneratedQuery[];
  legalContext: any[];
  complianceAnalysis: {
    isCompliant: boolean;
    confidence: number;
    reasoning: string;
    violations: string[];
    recommendations: string[];
  };
  findingIds: string[]; // Only IDs instead of full Finding objects
  recommendationIds: string[]; // Only IDs instead of full Recommendation objects
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
  private llm: ChatOpenAI;

  constructor(
    analysisService: AnalysisService,
    textExtractionService: TextExtractionService,
    firestoreService: FirestoreService
  ) {
    this.analysisService = analysisService;
    this.firestoreService = firestoreService;
    const llmFactory = new LLMFactory();
    this.llm = llmFactory.createAnalysisLLM();
  }

  /**
   * Extract document context to understand the type and domain of the contract
   */
  private async extractDocumentContext(contractText: string): Promise<DocumentContext> {
    const systemPrompt = `Du bist ein Experte für Vertragsanalyse. Analysiere den gegebenen Vertragstext und bestimme:

1. Den Dokumenttyp (z.B. "Software-AGB", "Mietvertrag", "Arbeitsvertrag", "Kaufvertrag", "Dienstleistungsvertrag", etc.)
2. Die Geschäftsdomäne (z.B. "Software/IT", "Immobilien", "Einzelhandel", "Beratung", etc.)
3. Wichtige Schlüsselbegriffe, die den Kontext definieren
4. Eine kurze Kontextbeschreibung

Antworte im JSON-Format:
{
  "documentType": "Typ des Dokuments",
  "businessDomain": "Geschäftsbereich",
  "keyTerms": ["Begriff1", "Begriff2", "Begriff3"],
  "contextDescription": "Kurze Beschreibung des Kontexts"
}`;

    const humanPrompt = `Analysiere diesen Vertragstext und bestimme den Kontext:

"${contractText.slice(0, 2000)}..."

Bestimme Dokumenttyp, Geschäftsdomäne und wichtige Schlüsselbegriffe:`;

    try {
      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(humanPrompt)
      ]);

      const content = response.content as string;

      try {
        const context = JSON.parse(content);
        return {
          documentType: context.documentType || 'Unbekannter Vertragstyp',
          businessDomain: context.businessDomain || 'Unbekannte Domäne',
          keyTerms: Array.isArray(context.keyTerms) ? context.keyTerms : [],
          contextDescription: context.contextDescription || 'Keine Kontextbeschreibung verfügbar'
        };
      } catch (parseError) {
        this.logger.warn('Failed to parse document context JSON, using fallback', { content });
        return {
          documentType: 'Allgemeiner Vertrag',
          businessDomain: 'Allgemein',
          keyTerms: [],
          contextDescription: 'Automatische Kontextanalyse fehlgeschlagen'
        };
      }
    } catch (error) {
      this.logger.error('Error extracting document context', error as Error);
      return {
        documentType: 'Unbekannter Vertragstyp',
        businessDomain: 'Unbekannte Domäne',
        keyTerms: [],
        contextDescription: 'Kontextanalyse nicht verfügbar'
      };
    }
  }

  /**
   * Main method to analyze a contract against Swiss obligation law
   */
  public async analyzeContractAgainstSwissLaw(
    contractText: string,
    documentId: string,
    userId: string,
    progressCallback?: (progress: number, message: string) => void
  ): Promise<SwissObligationAnalysisResult> {
    const analysisId = uuidv4();

    try {
      this.logger.info('Starting Swiss obligation law analysis', {
        analysisId,
        documentId,
        userId,
        textLength: contractText.length
      });

      // Step 0: Extract document context
      progressCallback?.(5, 'Analyzing document context...');
      const documentContext = await this.extractDocumentContext(contractText);

      this.logger.info('Document context extracted', {
        analysisId,
        documentContext
      });

      // Step 1: Split contract into sections
      progressCallback?.(10, 'Splitting contract into sections...');
      const sections = await this.splitContractIntoSections(contractText, documentContext);

      this.logger.info('Contract split into sections', {
        analysisId,
        sectionCount: sections.length
      });

      // Step 2: Analyze each section in parallel
      const totalSections = sections.length;
      progressCallback?.(20, `Analyzing ${totalSections} sections in parallel...`);

      // Filter out undefined sections and create promises for parallel processing
      const validSections = sections.filter(section => section !== undefined);

      const sectionPromises = validSections.map(async (section, index) => {
        try {
          return await this.analyzeSectionAgainstSwissLaw(section, analysisId, documentContext, index, sections.length);
        } catch (error) {
          this.logger.error('Error analyzing section in parallel', error as Error, {
            sectionId: section.id,
            sectionIndex: index
          });
          // Return a fallback result instead of failing the entire analysis
          return {
            sectionId: section.id,
            sectionContent: section.content,
            queries: [],
            legalContext: [],
            complianceAnalysis: this.generateFallbackComplianceAnalysis(section),
            findings: [],
            recommendations: []
          } as SectionAnalysisResult;
        }
      });

      // Execute all section analyses in parallel
      const sectionResults = await Promise.all(sectionPromises);

      progressCallback?.(90, `Completed analysis of ${sectionResults.length} sections`);

      this.logger.info('Parallel section analysis completed', {
        analysisId,
        totalSections: validSections.length,
        completedSections: sectionResults.length
      });

      // Step 3: Generate overall compliance assessment
      progressCallback?.(95, 'Generating overall compliance assessment...');
      const overallCompliance = await this.generateOverallComplianceAssessment(sectionResults);

      // Step 4: Create final result
      const result: SwissObligationAnalysisResult = {
        analysisId,
        documentId,
        userId,
        documentContext,
        sections: sectionResults,
        overallCompliance,
        createdAt: new Date(),
        completedAt: new Date()
      };

      // Step 5: Save results to Firestore
      await this.saveAnalysisResult(result);

      progressCallback?.(100, 'Analysis completed successfully');

      this.logger.info('Swiss obligation law analysis completed', {
        analysisId,
        documentId,
        userId,
        sectionCount: sectionResults.length,
        overallCompliant: overallCompliance.isCompliant
      });

      return result;

    } catch (error) {
      this.logger.error('Error in Swiss obligation law analysis', error as Error, {
        analysisId,
        documentId,
        userId
      });
      throw error;
    }
  }

  /**
   * Split contract text into meaningful sections using OpenAI
   * Uses tiktoken to ensure token limits and considers document context for intelligent splitting
   */
  private async splitContractIntoSections(contractText: string, documentContext?: DocumentContext): Promise<ContractSection[]> {
    try {
      // Clean and normalize text
      const cleanedText = contractText.trim();

      const modelName = process.env.OPENAI_MODEL || 'gpt-4';

      // Initialize tiktoken encoder for the configured model
      const encoder = encoding_for_model(modelName as any);

      // Count tokens in the original text
      const totalTokens = encoder.encode(cleanedText).length;
      const maxTokensForRequest = 4000; // Leave room for prompt and response

      this.logger.info('Token analysis for contract splitting', {
        totalTokens,
        maxTokensForRequest,
        textLength: cleanedText.length
      });

      // If text is too large, split it into manageable chunks first
      let textChunks: string[] = [];
      if (totalTokens > maxTokensForRequest) {
        textChunks = await this.splitTextByTokenLimit(cleanedText, encoder, maxTokensForRequest);
      } else {
        textChunks = [cleanedText];
      }

      // Process each chunk with OpenAI
      const allSections: ContractSection[] = [];
      let globalStartIndex = 0;

      for (let chunkIndex = 0; chunkIndex < textChunks.length; chunkIndex++) {
        const chunk = textChunks[chunkIndex];
        if (!chunk) continue;

        this.logger.info(`Processing chunk ${chunkIndex + 1} of ${textChunks.length}`);

        const chunkSections = await this.splitChunkWithAI(chunk, documentContext, globalStartIndex);
        allSections.push(...chunkSections);

        // Update global start index for next chunk
        globalStartIndex += chunk.length;
      }

      // Clean up the encoder
      encoder.free();

      // Fallback: if no meaningful sections found, create reasonable chunks
      if (allSections.length === 0) {
        return this.createFallbackSections(cleanedText);
      }

      this.logger.info('Contract split into sections using OpenAI', {
        totalSections: allSections.length,
        averageLength: Math.round(allSections.reduce((sum, s) => sum + s.content.length, 0) / allSections.length)
      });

      return allSections;

    } catch (error) {
      this.logger.error('Error in OpenAI-based contract splitting', error as Error);
      // Fallback to simple chunking if OpenAI fails
      return this.createFallbackSections(contractText.trim());
    }
  }

  /**
   * Split text into chunks that fit within token limits
   */
  private async splitTextByTokenLimit(text: string, encoder: any, maxTokens: number): Promise<string[]> {
    const chunks: string[] = [];
    const sentences = text.split(/[.!?]+\s+/).filter(s => s.trim().length > 10);

    let currentChunk = '';

    for (const sentence of sentences) {
      const potentialChunk = currentChunk + (currentChunk ? ' ' : '') + sentence;
      const tokenCount = encoder.encode(potentialChunk).length;

      if (tokenCount > maxTokens && currentChunk) {
        // Current chunk is full, start a new one
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk = potentialChunk;
      }
    }

    // Add the last chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }


  /**
   * Split a text chunk using OpenAI for intelligent sectioning
   */
  private async splitChunkWithAI(chunk: string, documentContext?: DocumentContext, startIndex: number = 0): Promise<ContractSection[]> {
    const contextInfo = documentContext ?
      `Dokumenttyp: ${documentContext.documentType}
Geschäftsbereich: ${documentContext.businessDomain}
Schlüsselbegriffe: ${documentContext.keyTerms.join(', ')}
Kontext: ${documentContext.contextDescription}` :
      'Kein spezifischer Dokumentkontext verfügbar';

    const systemPrompt = `Du bist ein Experte für Vertragsanalyse und Dokumentenstrukturierung. Deine Aufgabe ist es, einen Vertragstext in sinnvolle, thematisch zusammenhängende Abschnitte zu unterteilen.

KONTEXT DES DOKUMENTS:
${contextInfo}

ANWEISUNGEN:
1. Analysiere den gegebenen Vertragstext und identifiziere natürliche thematische Abschnitte
2. Jeder Abschnitt sollte einen zusammenhängenden Themenbereich behandeln (z.B. Vertragsgegenstand, Laufzeit, Vergütung, Haftung, etc.)
3. Abschnitte sollten zwischen 200-2000 Zeichen lang sein (optimal: 500-1500 Zeichen)
4. Berücksichtige den Dokumentkontext bei der Strukturierung
5. Erstelle aussagekräftige Titel für jeden Abschnitt

WICHTIG - IGNORIERE FOLGENDE INHALTE:
- Formale Elemente ohne rechtlichen Substanzinhalt (Titel, Überschriften, Unterschriftenfelder)
- Administrative Angaben ohne vertragliche Relevanz (Datum, Ort, Seitennummer)
- Strukturelle Dokumentelemente (Inhaltsverzeichnisse, Deckblätter, reine Formatierung)
- Nicht-substanzielle Anhänge und Referenzen ohne rechtlichen Bezug

ANTWORTFORMAT (JSON):
{
  "sections": [
    {
      "title": "Aussagekräftiger Titel des Abschnitts",
      "content": "Der vollständige Text des Abschnitts",
      "startIndex": 0,
      "endIndex": 123
    }
  ]
}

WICHTIG: 
- Gib den Text vollständig und unverändert wieder
- Keine Auslassungen oder Zusammenfassungen
- Berechne startIndex und endIndex basierend auf der Position im ursprünglichen Text
- Gib NUR rechtlich relevante Abschnitte zurück
- Antworte nur mit dem JSON-Format, keine zusätzlichen Erklärungen`;

    const humanPrompt = `Bitte unterteile den folgenden Vertragstext in sinnvolle Abschnitte und ignoriere dabei Titel, Unterschriften, Datumsangaben und andere nicht-rechtliche Inhalte:

"${chunk}"

Berücksichtige dabei den oben genannten Dokumentkontext und erstelle eine strukturierte Aufteilung in thematisch zusammenhängende, rechtlich relevante Abschnitte.`;

    // Rest der Methode bleibt unverändert...
    try {
      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(humanPrompt)
      ]);

      const content = response.content as string;

      try {
        const result = JSON.parse(content);
        const sections: ContractSection[] = [];

        if (result.sections && Array.isArray(result.sections)) {
          for (const section of result.sections) {
            if (section.content && section.content.trim().length > 50) {
              sections.push({
                id: uuidv4(),
                content: section.content.trim(),
                title: section.title || this.extractSectionTitle(section.content),
                startIndex: startIndex + (section.startIndex || 0),
                endIndex: startIndex + (section.endIndex || section.content.length)
              });
            }
          }
        }

        return sections;

      } catch (parseError) {
        this.logger.warn('Failed to parse OpenAI response for contract splitting', { parseError, content });
        return this.createFallbackSectionsFromChunk(chunk, startIndex);
      }

    } catch (error) {
      this.logger.error('Error calling OpenAI for contract splitting', error as Error);
      return this.createFallbackSectionsFromChunk(chunk, startIndex);
    }
  }

  /**
   * Create fallback sections when all else fails
   */
  private createFallbackSections(text: string): ContractSection[] {
    return this.createFallbackSectionsFromChunk(text, 0);
  }

  /**
   * Create fallback sections from a text chunk
   */
  private createFallbackSectionsFromChunk(text: string, startIndex: number): ContractSection[] {
    const sections: ContractSection[] = [];
    const chunkSize = 1000;

    for (let i = 0; i < text.length; i += chunkSize) {
      const content = text.slice(i, i + chunkSize);
      sections.push({
        id: uuidv4(),
        content,
        startIndex: startIndex + i,
        endIndex: startIndex + i + content.length,
        title: `Abschnitt ${sections.length + 1}`
      });
    }

    return sections;
  }

  /**
   * Extract a title from section content
   */
  private extractSectionTitle(content: string): string {
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    if (lines.length > 0 && lines[0]) {
      const firstLine = lines[0].trim();
      if (firstLine.length < 100) {
        return firstLine;
      }
    }
    return content.slice(0, 50) + '...';
  }

  /**
   * Analyze a single section against Swiss obligation law
   */
  private async analyzeSectionAgainstSwissLaw(
    section: ContractSection, analysisId: string, documentContext: DocumentContext, sectionIndex: number, sectionsLength: number
  ): Promise<SectionAnalysisResult> {
    try {
      // Step 1: Generate 3 queries for this section using ChatGPT
      const queries = await this.generateQueriesForSection(section, documentContext);

      this.logger.info('Generated queries for section', {queries})

      // Step 2: Query Pinecone database for each query
      const legalContext: any[] = [];
      for (const query of queries) {
        try {
          const searchResults = await this.analysisService.searchLegalContext(
            query.query,
            'Obligationenrecht',
            'CH',
            5,
            process.env.PINECONE_OR_INDEX,
            0.5
          );

          this.logger.debug('Search results for query', {query, searchResults})

          if (Array.isArray(searchResults)) {
            legalContext.push(...searchResults);
          } else if (searchResults) {
            legalContext.push(searchResults);
          }
        } catch (error) {
          this.logger.warn('Failed to search legal context', { query: query.query, error });
        }
      }

      // Step 3: Analyze compliance using ChatGPT with legal context
      const complianceAnalysis = await this.analyzeComplianceWithContext(
        section,
        queries,
        legalContext,
        documentContext,
        sectionIndex,
        sectionsLength
      );

      // Step 4: Generate findings and recommendations
      const findings = this.generateFindings(section, complianceAnalysis);
      const recommendations = this.generateRecommendations(section, complianceAnalysis);

      return {
        sectionId: section.id,
        sectionContent: section.content,
        queries,
        legalContext,
        complianceAnalysis,
        findings,
        recommendations
      };

    } catch (error) {
      this.logger.error('Error analyzing section against Swiss law', error as Error, {
        sectionId: section.id
      });
      throw error;
    }
  }

  /**
   * Generate 3 queries for a contract section using ChatGPT
   */
  private async generateQueriesForSection(section: ContractSection, documentContext: DocumentContext): Promise<GeneratedQuery[]> {
    const systemPrompt = `Du bist ein Experte für Schweizer Obligationenrecht. Du hast Zugang zu einer Vektordatenbank mit dem kompletten Schweizer Obligationenrecht.

Deine Aufgabe ist es, für einen gegebenen Vertragsabschnitt 3 präzise Suchanfragen zu generieren, um relevante Artikel und Bestimmungen aus dem Obligationenrecht zu finden.

WICHTIG: Berücksichtige dabei den spezifischen Kontext des Dokuments:
- Dokumenttyp: ${documentContext.documentType}
- Geschäftsbereich: ${documentContext.businessDomain}
- Schlüsselbegriffe: ${documentContext.keyTerms.join(', ')}
- Kontext: ${documentContext.contextDescription}

Die Suchanfragen sollen:
1. Spezifisch auf den Vertragsinhalt UND den Dokumentkontext bezogen sein
2. Relevante rechtliche Konzepte für den spezifischen Geschäftsbereich enthalten
3. Verschiedene Aspekte des Abschnitts im Kontext des Dokumenttyps abdecken
4. Die Schlüsselbegriffe und den Geschäftsbereich in die Suche einbeziehen

Antworte im JSON-Format mit einem Array von 3 Objekten, jedes mit "query" und "context" Feldern.`;

    const humanPrompt = `Dokumentkontext:
- Typ: ${documentContext.documentType}
- Geschäftsbereich: ${documentContext.businessDomain}
- Beschreibung: ${documentContext.contextDescription}

Vertragsabschnitt:
"${section.content}"

Generiere 3 kontextspezifische Suchanfragen für die Obligationenrecht-Datenbank:`;

    try {
      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(humanPrompt)
      ]);

      const content = response.content as string;

      // Try to parse JSON response
      try {
        const queries = JSON.parse(content);
        if (Array.isArray(queries) && queries.length === 3) {
          return queries.map(q => ({
            query: q.query,
            context: q.context
          }));
        }
      } catch (parseError) {
        this.logger.warn('Failed to parse JSON response, using fallback', { content });
      }

      // Fallback: generate basic queries
      return this.generateFallbackQueries(section, documentContext);

    } catch (error) {
      this.logger.error('Error generating queries for section', error as Error, {
        sectionId: section.id
      });
      return this.generateFallbackQueries(section, documentContext);
    }
  }

  /**
   * Generate fallback queries if ChatGPT fails
   */
  private generateFallbackQueries(section: ContractSection, documentContext: DocumentContext): GeneratedQuery[] {
    const contextTerms = documentContext.keyTerms.length > 0 ? documentContext.keyTerms.join(' ') : documentContext.businessDomain;

    return [
      {
        query: `${documentContext.documentType} Vertragsgültigkeit Obligationenrecht ${contextTerms} ${section.content.slice(0, 100)}`,
        context: `Prüfung der rechtlichen Gültigkeit des Vertragsabschnitts im Kontext von ${documentContext.documentType}`
      },
      {
        query: `${documentContext.businessDomain} Vertragspflichten Rechte Obligationen ${contextTerms} ${section.content.slice(0, 100)}`,
        context: `Analyse der Rechte und Pflichten der Vertragsparteien im ${documentContext.businessDomain} Bereich`
      },
      {
        query: `${documentContext.documentType} ${documentContext.businessDomain} Vertragsbestimmungen Schweizer Recht ${section.content.slice(0, 100)}`,
        context: `Überprüfung der Vereinbarkeit mit Schweizer Obligationenrecht für ${documentContext.documentType}`
      }
    ];
  }

  /**
   * Analyze compliance with legal context - section-by-section approach
   */
  private async analyzeComplianceWithContext(
    section: ContractSection,
    queries: GeneratedQuery[],
    legalContext: any[],
    documentContext: DocumentContext,
    currentSectionIndex?: number,
    totalSections?: number
  ): Promise<SectionAnalysisResult['complianceAnalysis']> {
    const sectionInfo = currentSectionIndex !== undefined && totalSections !== undefined
      ? `(Abschnitt ${currentSectionIndex + 1} von ${totalSections})`
      : '';

    const systemPrompt = `Du bist ein Experte für Schweizer Obligationenrecht. Du analysierst einzelne Vertragsabschnitte auf OR-Verstösse.

WICHTIGER KONTEXT:
- Dies ist EIN Abschnitt eines grösseren Vertrags ${sectionInfo}
- Weitere Vertragsabschnitte werden separat analysiert
- Andere relevante Regelungen können in anderen Abschnitten stehen

ANALYSE-FOKUS:
- Analysiere NUR diesen spezifischen Abschnitt
- Melde NUR Verstösse die DIREKT in diesem Text erkennbar sind
- Ignoriere fehlende Regelungen (könnten in anderen Abschnitten stehen)
- Gib NUR Empfehlungen zur Verbesserung DIESES Texts

DOKUMENTKONTEXT:
- Dokumenttyp: ${documentContext.documentType}
- Geschäftsbereich: ${documentContext.businessDomain}

Antworte im JSON-Format:
{
  "isCompliant": boolean,
  "confidence": number (0-1),
  "reasoning": "Begründung bezogen nur auf diesen Abschnitt",
  "violations": ["Direkte OR-Verstösse in diesem Text"],
  "recommendations": ["Konkrete Verbesserungen nur für diesen Text"]
}`;

    const contextText = legalContext
    .flatMap(ctx => ctx.documents)
    .map(doc => `${doc.metadata?.title || 'Rechtsnorm'}: ${doc.pageContent}`)
    .join('\n\n');

    const humanPrompt = `EINZELNER VERTRAGSABSCHNITT ZUR ANALYSE ${sectionInfo}:
"${section.content}"

RELEVANTE OR-ARTIKEL:
${contextText}

ANALYSE-AUFTRAG:
Da dies nur ein Abschnitt des Gesamtvertrags ist:

✅ MELDE ALS VERSTOSS:
- Text verstösst direkt gegen OR (z.B. "unbegrenzte Haftung")
- Rechtswidrige Formulierungen in diesem Abschnitt
- Sittenwidrige Klauseln
- AGB-Verstösse in diesem Text

❌ MELDE NICHT ALS VERSTOSS:
- Fehlende Definitionen (könnten in anderen Abschnitten stehen)
- Nicht erwähnte Regelungen (könnten separat geregelt sein)
- Unvollständige Informationen (Vertrag ist grösser)

BEISPIELE:
✅ "Die Klausel 'unbegrenzte Schadenersatzpflicht' verstösst gegen OR Art. 100"
❌ "Keine Datenschutzklausel vorhanden" (könnte in anderem Abschnitt stehen)

Fokussiere auf TEXTQUALITÄT dieses Abschnitts, nicht auf Vollständigkeit des Vertrags.`;

    try {
      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(humanPrompt)
      ]);

      const content = response.content as string;

      try {
        const analysis = JSON.parse(content);

        return {
          isCompliant: analysis.isCompliant || false,
          confidence: analysis.confidence || 0.5,
          reasoning: analysis.reasoning || 'Keine detaillierte Analyse verfügbar',
          violations: analysis.violations || [],
          recommendations: analysis.violations
        };
      } catch (parseError) {
        this.logger.warn('Failed to parse compliance analysis JSON', { content });
        return this.generateFallbackComplianceAnalysis(section);
      }

    } catch (error) {
      this.logger.error('Error analyzing compliance', error as Error, {
        sectionId: section.id
      });
      return this.generateFallbackComplianceAnalysis(section);
    }
  }

  /**
   * Generate fallback compliance analysis
   */
  private generateFallbackComplianceAnalysis(section: ContractSection): SectionAnalysisResult['complianceAnalysis'] {
    return {
      isCompliant: true,
      confidence: 0.3,
      reasoning: 'Automatische Analyse nicht verfügbar. Manuelle Prüfung erforderlich.',
      violations: [],
      recommendations: ['Manuelle rechtliche Prüfung durch Experten empfohlen']
    };
  }

  /**
   * Generate findings from compliance analysis
   */
  private generateFindings(section: ContractSection, analysis: SectionAnalysisResult['complianceAnalysis']): Finding[] {
    const findings: Finding[] = [];

    if (!analysis.isCompliant) {
      for (const violation of analysis.violations) {
        findings.push({
          id: uuidv4(),
          type: FindingType.LEGAL_VIOLATION,
          severity: FindingSeverity.HIGH,
          title: 'Verstoss gegen Obligationenrecht',
          description: violation,
          location: {
            startIndex: section.startIndex,
            endIndex: section.endIndex,
            section: section.title || 'Unknown section'
          },
          evidence: [section.content.slice(0, 200)],
          legalBasis: ['Schweizer Obligationenrecht']
        });
      }
    }

    return findings;
  }

  /**
   * Generate recommendations from compliance analysis
   */
  private generateRecommendations(section: ContractSection, analysis: SectionAnalysisResult['complianceAnalysis']): Recommendation[] {
    const recommendations: Recommendation[] = [];

    for (const recommendation of analysis.recommendations) {
      recommendations.push({
        id: uuidv4(),
        type: RecommendationType.COMPLIANCE_UPDATE,
        priority: analysis.isCompliant ? Priority.LOW : Priority.HIGH,
        title: 'Empfehlung zur Rechtssicherheit',
        description: recommendation,
        suggestedAction: recommendation,
        estimatedEffort: 'Mittel'
      });
    }

    return recommendations;
  }

  /**
   * Generate overall compliance assessment
   */
  private async generateOverallComplianceAssessment(
    sectionResults: SectionAnalysisResult[]
  ): Promise<SwissObligationAnalysisResult['overallCompliance']> {
    const totalSections = sectionResults.length;
    const compliantSections = sectionResults.filter(s => s.complianceAnalysis.isCompliant).length;
    const complianceScore = totalSections > 0 ? compliantSections / totalSections : 0;

    const isCompliant = compliantSections === sectionResults.length;

    const violationCount = sectionResults.reduce((count, section) =>
      count + section.complianceAnalysis.violations.length, 0
    );

    let summary = '';
    if (isCompliant) {
      summary = `Der Vertrag ist weitgehend mit dem Schweizer Obligationenrecht vereinbar. ${compliantSections} von ${totalSections} Abschnitten sind rechtmässig.`;
    } else {
      summary = `Der Vertrag weist Verstösse gegen das Schweizer Obligationenrecht auf. Nur ${compliantSections} von ${totalSections} Abschnitten sind vollständig rechtmässig. Insgesamt wurden ${violationCount} potenzielle Verstösse identifiziert.`;
    }

    return {
      isCompliant,
      complianceScore,
      summary
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
        const recommendationIds = section.recommendations.map(r => r.id);

        // Create compact section
        const compactSection: CompactSectionResult = {
          sectionId: section.sectionId,
          sectionContent: section.sectionContent,
          queries: section.queries,
          legalContext: section.legalContext,
          complianceAnalysis: section.complianceAnalysis,
          findingIds,
          recommendationIds
        };

        compactSections.push(compactSection);

        // Add full objects to details map
        section.findings.forEach(finding => {
          allDetails.items[finding.id] = finding;
        });
        section.recommendations.forEach(recommendation => {
          allDetails.items[recommendation.id] = recommendation;
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
          queries: compactSection.queries,
          legalContext: compactSection.legalContext,
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

        // Reconstruct recommendations from IDs
        const recommendations: Recommendation[] = compactSection.recommendationIds.map(id => {
          const recommendation = details.items[id] as Recommendation;
          if (!recommendation) {
            this.logger.warn('Recommendation not found in details', { analysisId, recommendationId: id });
            return null;
          }
          return recommendation;
        }).filter(Boolean) as Recommendation[];

        return {
          sectionId: compactSection.sectionId,
          sectionContent: compactSection.sectionContent,
          queries: compactSection.queries,
          legalContext: compactSection.legalContext,
          complianceAnalysis: compactSection.complianceAnalysis,
          findings,
          recommendations
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

            // Reconstruct recommendations from IDs
            const recommendations: Recommendation[] = (compactSection.recommendationIds || []).map(id => {
              const recommendation = details.items[id] as Recommendation;
              if (!recommendation) {
                this.logger.warn('Recommendation not found in details', { analysisId: data.analysisId, recommendationId: id });
                return null;
              }
              return recommendation;
            }).filter(Boolean) as Recommendation[];

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
              findings,
              recommendations
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
