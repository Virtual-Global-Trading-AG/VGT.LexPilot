import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Logger } from '../utils/logger';
import { AnalysisService } from './AnalysisService';
import { TextExtractionService } from './TextExtractionService';
import { FirestoreService } from './FirestoreService';
import { LLMFactory } from '../factories/LLMFactory';
import { Analysis, AnalysisResult, Finding, FindingSeverity, FindingType, Recommendation, RecommendationType, Priority } from '../models';
import { v4 as uuidv4 } from 'uuid';

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
  private textExtractionService: TextExtractionService;
  private firestoreService: FirestoreService;
  private llm: ChatOpenAI;

  constructor(
    analysisService: AnalysisService,
    textExtractionService: TextExtractionService,
    firestoreService: FirestoreService
  ) {
    this.analysisService = analysisService;
    this.textExtractionService = textExtractionService;
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
      const sections = await this.splitContractIntoSections(contractText);

      this.logger.info('Contract split into sections', {
        analysisId,
        sectionCount: sections.length
      });

      // Step 2: Analyze each section
      const sectionResults: SectionAnalysisResult[] = [];
      const totalSections = sections.length;

      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        if (!section) {
          continue; // Skip if section is undefined
        }

        const sectionProgress = 20 + (i / totalSections) * 70; // 20-90% for section analysis

        progressCallback?.(sectionProgress, `Analyzing section ${i + 1} of ${totalSections}...`);

        const sectionResult = await this.analyzeSectionAgainstSwissLaw(section, analysisId, documentContext);
        sectionResults.push(sectionResult);
      }

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
   * Split contract text into meaningful sections
   * Uses natural text structure and semantic boundaries instead of formal legal patterns
   */
  private async splitContractIntoSections(contractText: string): Promise<ContractSection[]> {
    // Clean and normalize text
    const cleanedText = contractText.trim();
    const sections: ContractSection[] = [];

    // Strategy 1: Split by natural paragraph breaks (double line breaks or more)
    const paragraphSections = this.splitByParagraphs(cleanedText);

    // Strategy 2: If paragraphs are too large, split by semantic boundaries
    const refinedSections = this.refineBySemanticBoundaries(paragraphSections);

    // Strategy 3: If still no good sections, use intelligent chunking
    const finalSections = refinedSections.length > 0 ? refinedSections : this.intelligentChunking(cleanedText);

    // Create ContractSection objects
    let currentIndex = 0;
    for (let i = 0; i < finalSections.length; i++) {
      const sectionText = finalSections[i];
      if (!sectionText) continue; // Skip if undefined

      const content = sectionText.trim();

      if (content.length > 100) { // Only include substantial sections
        const startIndex = currentIndex;
        const endIndex = currentIndex + content.length;

        sections.push({
          id: uuidv4(),
          content,
          startIndex,
          endIndex,
          title: this.extractSectionTitle(content)
        });

        currentIndex = endIndex;
      }
    }

    // Fallback: if no meaningful sections found, create reasonable chunks
    if (sections.length === 0) {
      return this.createFallbackSections(cleanedText);
    }

    this.logger.info('Contract split into sections', {
      totalSections: sections.length,
      averageLength: Math.round(sections.reduce((sum, s) => sum + s.content.length, 0) / sections.length)
    });

    return sections;
  }

  /**
   * Split text by natural paragraph breaks
   */
  private splitByParagraphs(text: string): string[] {
    // Split by double line breaks or more, which typically indicate paragraph boundaries
    const paragraphs = text.split(/\n\s*\n+/).filter(p => p.trim().length > 0);

    // If we get very few paragraphs, try single line breaks with additional criteria
    if (paragraphs.length < 3) {
      return text.split(/\n+/).filter(p => p.trim().length > 50);
    }

    return paragraphs;
  }

  /**
   * Refine sections by identifying semantic boundaries
   */
  private refineBySemanticBoundaries(paragraphs: string[]): string[] {
    const refinedSections: string[] = [];
    let currentSection = '';

    for (const paragraph of paragraphs) {
      const trimmedParagraph = paragraph.trim();

      // Check if this paragraph starts a new semantic section
      if (this.isNewSemanticSection(trimmedParagraph, currentSection)) {
        if (currentSection.trim().length > 0) {
          refinedSections.push(currentSection.trim());
        }
        currentSection = trimmedParagraph;
      } else {
        // Add to current section
        currentSection += (currentSection ? '\n\n' : '') + trimmedParagraph;
      }

      // If current section is getting too long, force a break
      if (currentSection.length > 2000) {
        refinedSections.push(currentSection.trim());
        currentSection = '';
      }
    }

    // Add the last section
    if (currentSection.trim().length > 0) {
      refinedSections.push(currentSection.trim());
    }

    return refinedSections;
  }

  /**
   * Check if a paragraph starts a new semantic section
   */
  private isNewSemanticSection(paragraph: string, currentSection: string): boolean {
    // Contract-specific patterns that indicate new sections
    const newSectionPatterns = [
      // Headings (short lines that are likely titles)
      /^.{1,80}$/,
      // Lines that start with common contract section indicators
      /^(Vertragsgegenstand|Laufzeit|Kündigung|Vergütung|Haftung|Datenschutz|Geheimhaltung|Schlussbestimmungen)/i,
      // Lines with specific formatting (all caps, centered, etc.)
      /^[A-ZÄÖÜ\s]{5,50}$/,
      // Numbered or lettered sections (but more flexible than legal articles)
      /^[0-9]+[\.\)]\s+/,
      /^[a-z][\.\)]\s+/i,
      // Lines that start with "Der/Die/Das" (common contract language)
      /^(Der|Die|Das|Diese[rs]?|Beide|Alle)\s+/,
    ];

    // Don't create new section if current section is too short
    if (currentSection.length < 200) {
      return false;
    }

    // Check if paragraph matches any new section pattern
    const lines = paragraph.split('\n');
    const firstLine = lines[0]?.trim() || '';

    // Short first line might be a heading
    if (firstLine.length < 80 && firstLine.length > 5) {
      return true;
    }

    // Check against patterns
    return newSectionPatterns.some(pattern => pattern.test(firstLine));
  }

  /**
   * Intelligent chunking when other methods don't work well
   */
  private intelligentChunking(text: string): string[] {
    const chunks: string[] = [];
    const sentences = this.splitIntoSentences(text);

    let currentChunk = '';
    const targetChunkSize = 800; // Target size for each chunk
    const maxChunkSize = 1500; // Maximum size before forcing a break

    for (const sentence of sentences) {
      const potentialChunk = currentChunk + (currentChunk ? ' ' : '') + sentence;

      if (potentialChunk.length > maxChunkSize) {
        // Force break
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence;
      } else if (potentialChunk.length > targetChunkSize && this.isGoodBreakPoint(sentence)) {
        // Good natural break point
        chunks.push(potentialChunk.trim());
        currentChunk = '';
      } else {
        currentChunk = potentialChunk;
      }
    }

    // Add remaining chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Split text into sentences
   */
  private splitIntoSentences(text: string): string[] {
    // Simple sentence splitting - can be improved with more sophisticated NLP
    return text.split(/[.!?]+\s+/).filter(s => s.trim().length > 10);
  }

  /**
   * Check if this is a good point to break a chunk
   */
  private isGoodBreakPoint(sentence: string): boolean {
    // Sentences that typically end a topic or section
    const breakPatterns = [
      /\.$/, // Ends with period
      /vereinbart\.$/, // "vereinbart."
      /festgelegt\.$/, // "festgelegt."
      /geregelt\.$/, // "geregelt."
      /bestimmt\.$/, // "bestimmt."
    ];

    return breakPatterns.some(pattern => pattern.test(sentence.trim()));
  }

  /**
   * Create fallback sections when all else fails
   */
  private createFallbackSections(text: string): ContractSection[] {
    const sections: ContractSection[] = [];
    const chunkSize = 1000;

    for (let i = 0; i < text.length; i += chunkSize) {
      const content = text.slice(i, i + chunkSize);
      sections.push({
        id: uuidv4(),
        content,
        startIndex: i,
        endIndex: i + content.length,
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
  private async analyzeSectionAgainstSwissLaw(section: ContractSection, analysisId: string, documentContext: DocumentContext): Promise<SectionAnalysisResult> {
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
        documentContext
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
   * Analyze compliance with legal context
   */
  private async analyzeComplianceWithContext(
    section: ContractSection,
    queries: GeneratedQuery[],
    legalContext: any[],
    documentContext: DocumentContext
  ): Promise<SectionAnalysisResult['complianceAnalysis']> {
    const systemPrompt = `Du bist ein Experte für Schweizer Obligationenrecht. Du analysierst Vertragsabschnitte auf ihre Rechtmässigkeit gemäss Schweizer Obligationenrecht.

WICHTIGER DOKUMENTKONTEXT:
- Dokumenttyp: ${documentContext.documentType}
- Geschäftsbereich: ${documentContext.businessDomain}
- Schlüsselbegriffe: ${documentContext.keyTerms.join(', ')}
- Kontext: ${documentContext.contextDescription}

Du erhältst:
1. Einen Vertragsabschnitt aus einem ${documentContext.documentType} im Bereich ${documentContext.businessDomain}
2. Relevante Artikel aus dem Obligationenrecht als Kontext

Deine Aufgabe ist es zu beurteilen:
- Ist dieser Abschnitt gemäss Obligationenrecht zulässig, speziell im Kontext von ${documentContext.documentType}?
- Welche Verstösse gibt es (falls vorhanden) unter Berücksichtigung des spezifischen Geschäftsbereichs?
- Welche Empfehlungen hast du für diesen spezifischen Dokumenttyp und Geschäftsbereich?

WICHTIG: Berücksichtige bei der Analyse den spezifischen Kontext des Dokuments. Vermeide Fehlanalysen durch falsche Kontextannahmen (z.B. Mietrecht bei Software-AGB).

Antworte im JSON-Format mit folgender Struktur:
{
  "isCompliant": boolean,
  "confidence": number (0-1),
  "reasoning": "Detaillierte Begründung unter Berücksichtigung des Dokumentkontexts",
  "violations": ["Liste von Verstössen"],
  "recommendations": ["Liste von Empfehlungen"]
}`;


    const contextText = legalContext
    .flatMap(ctx => ctx.documents) // Flatten: Alle documents aus allen contexts
    .map(doc => {
      this.logger.debug('Legal context document', { doc });
      return `${doc.metadata?.title || 'Rechtsnorm'}: ${doc.pageContent}`;
    })
    .join('\n\n');

    this.logger.info('Legal context for compliance analysis', { contextText });

    const humanPrompt = `DOKUMENTKONTEXT:
- Typ: ${documentContext.documentType}
- Geschäftsbereich: ${documentContext.businessDomain}
- Beschreibung: ${documentContext.contextDescription}
- Schlüsselbegriffe: ${documentContext.keyTerms.join(', ')}

VERTRAGSABSCHNITT:
"${section.content}"

RELEVANTER RECHTLICHER KONTEXT AUS DEM OBLIGATIONENRECHT:
${contextText}

Analysiere die Rechtmässigkeit dieses Abschnitts unter Berücksichtigung des spezifischen Dokumentkontexts (${documentContext.documentType} im Bereich ${documentContext.businessDomain}):`;

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
          recommendations: analysis.recommendations || []
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

    const isCompliant = complianceScore >= 0.8; // 80% compliance threshold

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
   * Save analysis result to Firestore
   */
  private async saveAnalysisResult(result: SwissObligationAnalysisResult): Promise<void> {
    try {
      const docData = {
        analysisId: result.analysisId,
        documentId: result.documentId,
        userId: result.userId,
        sections: result.sections,
        overallCompliance: result.overallCompliance,
        createdAt: result.createdAt.toISOString(),
        completedAt: result.completedAt?.toISOString()
      };

      await this.firestoreService.saveDocument(`swissObligationAnalyses/${result.analysisId}`, docData);

      this.logger.info('Swiss obligation analysis result saved', {
        analysisId: result.analysisId,
        documentId: result.documentId,
        userId: result.userId
      });
    } catch (error) {
      this.logger.error('Error saving Swiss obligation analysis result', error as Error, {
        analysisId: result.analysisId
      });
      throw error;
    }
  }

  /**
   * Get analysis result by ID
   */
  public async getAnalysisResult(analysisId: string, userId: string): Promise<SwissObligationAnalysisResult | null> {
    try {
      const result = await this.firestoreService.getDocument(analysisId, userId);

      if (!result || result.userId !== userId) {
        return null;
      }

      return {
        ...result,
        createdAt: new Date(result.createdAt),
        completedAt: result.completedAt ? new Date(result.completedAt) : undefined
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

      querySnapshot.forEach((doc: any) => {
        const data = doc.data();
        analyses.push({
          analysisId: data.analysisId,
          documentId: data.documentId,
          userId: data.userId,
          documentContext: data.documentContext,
          sections: data.sections,
          overallCompliance: data.overallCompliance,
          createdAt: new Date(data.createdAt),
          completedAt: data.completedAt ? new Date(data.completedAt) : undefined
        });
      });

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
