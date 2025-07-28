import { RecursiveCharacterTextSplitter, TokenTextSplitter } from 'langchain/text_splitter';
import { MarkdownTextSplitter } from 'langchain/text_splitter';
import { Document } from 'langchain/document';
import { Logger } from '../utils/logger';
import { DocumentType } from '../services/EmbeddingService';

export interface SplitterConfig {
  chunkSize: number;
  chunkOverlap: number;
  separators?: string[];
  keepSeparator?: boolean;
}

export interface HierarchicalChunk extends Document {
  metadata: {
    id: string;
    documentId: string;
    chunkIndex: number;
    chunkLevel: ChunkLevel;
    language: string;
    legalReferences: string[];
    contractClauses: string[];
    section?: string;
    subsection?: string;
    [key: string]: any;
  };
}

export enum ChunkLevel {
  CHAPTER = 'chapter',
  SECTION = 'section', 
  CLAUSE = 'clause',
  TABLE = 'table',
  PARAGRAPH = 'paragraph'
}

export interface DocumentStructure {
  type: DocumentType;
  language: string;
  hasChapters: boolean;
  hasSections: boolean;
  hasTables: boolean;
  estimatedComplexity: 'low' | 'medium' | 'high';
}

/**
 * Hierarchischer Text-Splitter speziell für juristische Dokumente
 * Implementiert kontextbewusste Aufteilung nach Rechtsstruktur
 */
export class LegalDocumentSplitter {
  private readonly logger = Logger.getInstance();
  private readonly splitters: Map<ChunkLevel, RecursiveCharacterTextSplitter | TokenTextSplitter | MarkdownTextSplitter>;

  constructor() {
    this.splitters = new Map();
    this.initializeSplitters();
  }

  /**
   * Initialisiert die verschiedenen Splitter für unterschiedliche Chunk-Level
   */
  private initializeSplitters(): void {
    // Level 1: Hauptkapitel/Artikel
    this.splitters.set(ChunkLevel.CHAPTER, new RecursiveCharacterTextSplitter({
      chunkSize: 4000,
      chunkOverlap: 400,
      separators: [
        "\n## ", // Markdown Headers
        "\nArtikel ", "\nArt. ", // Deutsch
        "\nArticle ", // English
        "\nChapitre ", // Französisch
        "\nArticolo ", // Italienisch
        "\nKapitel ", "\nAbschnitt ", // Deutsch
        "\nSection ", "\nChapter ", // English
        "\n\n\n", // Triple line breaks
      ],
      keepSeparator: true
    }));

    // Level 2: Sections/Absätze
    this.splitters.set(ChunkLevel.SECTION, new RecursiveCharacterTextSplitter({
      chunkSize: 2000,
      chunkOverlap: 200,
      separators: [
        "\n### ",
        "\n§ ", "\nAbs. ", "\nAbsatz ", // Deutsch
        "\nParagraph ", "\nSection ", // English
        "\nAlinéa ", "\nParagraphe ", // Französisch
        "\nCapoverso ", "\nParagrafo ", // Italienisch
        "\n\n", // Double line breaks
        "\n",
        " ",
      ],
      keepSeparator: true
    }));

    // Level 3: Klauseln/Sätze - Token-basiert für präzise GPT-4 Kompatibilität
    this.splitters.set(ChunkLevel.CLAUSE, new TokenTextSplitter({
      encodingName: "cl100k_base", // GPT-4 encoding
      chunkSize: 512,
      chunkOverlap: 50,
      disallowedSpecial: []
    }));

    // Speziell für Tabellen
    this.splitters.set(ChunkLevel.TABLE, new MarkdownTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 0 // Keine Überlappung bei Tabellen
    }));

    // Paragraphen-Level für detaillierte Analyse
    this.splitters.set(ChunkLevel.PARAGRAPH, new RecursiveCharacterTextSplitter({
      chunkSize: 800,
      chunkOverlap: 80,
      separators: [
        ". ", // Satzende
        "; ", // Semikolon
        ", ", // Komma
        " ",
      ],
      keepSeparator: true
    }));

    this.logger.info('Legal document splitters initialized', {
      splitterCount: this.splitters.size,
      levels: Array.from(this.splitters.keys())
    });
  }

  /**
   * Hauptmethode für hierarchische Dokumentaufteilung
   */
  async splitDocument(document: Document): Promise<HierarchicalChunk[]> {
    try {
      this.logger.info('Starting document splitting', {
        documentLength: document.pageContent.length,
        documentType: document.metadata.type
      });

      // 1. Identifiziere Dokumentstruktur
      const structure = this.identifyStructure(document);
      
      // 2. Wende hierarchische Aufteilung an
      const chunks = await this.applyHierarchicalSplitting(document, structure);
      
      // 3. Reichere mit Metadaten an
      const enrichedChunks = this.enrichWithMetadata(chunks, document);
      
      this.logger.info('Document splitting completed', {
        originalLength: document.pageContent.length,
        chunkCount: enrichedChunks.length,
        avgChunkSize: enrichedChunks.reduce((sum, chunk) => sum + chunk.pageContent.length, 0) / enrichedChunks.length,
        structure
      });

      return enrichedChunks;

    } catch (error) {
      this.logger.error('Error splitting document', error instanceof Error ? error : new Error(String(error)), {
        documentLength: document.pageContent.length,
        documentType: document.metadata.type
      });
      throw error;
    }
  }

  /**
   * Identifiziert die Struktur des Dokuments
   */
  private identifyStructure(document: Document): DocumentStructure {
    const content = document.pageContent;
    const language = this.detectLanguage(content);
    
    // Prüfe auf verschiedene Strukturelemente
    const hasChapters = this.hasChapterStructure(content);
    const hasSections = this.hasSectionStructure(content);
    const hasTables = this.hasTableStructure(content);
    
    // Schätze Komplexität
    const estimatedComplexity = this.estimateComplexity(content, hasChapters, hasSections);

    return {
      type: document.metadata.type || DocumentType.GENERAL,
      language,
      hasChapters,
      hasSections,
      hasTables,
      estimatedComplexity
    };
  }

  /**
   * Wendet hierarchische Aufteilung basierend auf Dokumentstruktur an
   */
  private async applyHierarchicalSplitting(
    document: Document, 
    structure: DocumentStructure
  ): Promise<Document[]> {
    const chunks: Document[] = [];

    // Strategie basierend auf Dokumenttyp und Struktur
    if (structure.type === DocumentType.REGULATION && structure.hasChapters) {
      // Gesetzestexte: Kapitel → Artikel → Absätze
      chunks.push(...await this.splitByLevel(document, ChunkLevel.CHAPTER));
    } else if (structure.type === DocumentType.CONTRACT) {
      // Verträge: Sections → Klauseln
      chunks.push(...await this.splitByLevel(document, ChunkLevel.SECTION));
    } else if (structure.hasTables) {
      // Dokumente mit Tabellen: Spezielle Behandlung
      chunks.push(...await this.splitWithTableHandling(document));
    } else if (structure.estimatedComplexity === 'high') {
      // Komplexe Dokumente: Mehrstufige Aufteilung
      chunks.push(...await this.multiLevelSplit(document));
    } else {
      // Standard-Aufteilung
      chunks.push(...await this.splitByLevel(document, ChunkLevel.SECTION));
    }

    return chunks;
  }

  /**
   * Aufteilung nach spezifischem Level
   */
  private async splitByLevel(document: Document, level: ChunkLevel): Promise<Document[]> {
    const splitter = this.splitters.get(level);
    if (!splitter) {
      throw new Error(`No splitter found for level: ${level}`);
    }

    const chunks = await splitter.splitDocuments([document]);
    
    // Füge Level-Information hinzu
    return chunks.map((chunk, index) => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        chunkLevel: level,
        chunkIndex: index
      }
    }));
  }

  /**
   * Mehrstufige Aufteilung für komplexe Dokumente
   */
  private async multiLevelSplit(document: Document): Promise<Document[]> {
    const allChunks: Document[] = [];

    // Level 1: Grobe Kapitel-Aufteilung
    const chapterChunks = await this.splitByLevel(document, ChunkLevel.CHAPTER);
    
    for (const chapterChunk of chapterChunks) {
      // Level 2: Feinere Section-Aufteilung
      const sectionChunks = await this.splitByLevel(chapterChunk, ChunkLevel.SECTION);
      
      for (const sectionChunk of sectionChunks) {
        // Level 3: Detail-Aufteilung wenn nötig
        if (sectionChunk.pageContent.length > 1500) {
          const detailChunks = await this.splitByLevel(sectionChunk, ChunkLevel.CLAUSE);
          allChunks.push(...detailChunks);
        } else {
          allChunks.push(sectionChunk);
        }
      }
    }

    return allChunks;
  }

  /**
   * Spezielle Behandlung für Dokumente mit Tabellen
   */
  private async splitWithTableHandling(document: Document): Promise<Document[]> {
    const chunks: Document[] = [];
    const content = document.pageContent;
    
    // Identifiziere Tabellen-Bereiche
    const tableRegex = /\|.*\|.*\n(?:\|.*\|.*\n)*/g;
    const tables = content.match(tableRegex) || [];
    
    if (tables.length === 0) {
      // Keine Tabellen gefunden, Standard-Splitting
      return await this.splitByLevel(document, ChunkLevel.SECTION);
    }

    // Spalte Text in Tabellen und Nicht-Tabellen auf
    let currentIndex = 0;
    
    for (const table of tables) {
      const tableStart = content.indexOf(table, currentIndex);
      
      // Text vor der Tabelle
      if (tableStart > currentIndex) {
        const beforeTable = content.substring(currentIndex, tableStart);
        const textDoc = new Document({
          pageContent: beforeTable,
          metadata: { ...document.metadata }
        });
        const textChunks = await this.splitByLevel(textDoc, ChunkLevel.SECTION);
        chunks.push(...textChunks);
      }
      
      // Die Tabelle selbst
      const tableDoc = new Document({
        pageContent: table,
        metadata: { 
          ...document.metadata,
          chunkLevel: ChunkLevel.TABLE 
        }
      });
      const tableChunks = await this.splitByLevel(tableDoc, ChunkLevel.TABLE);
      chunks.push(...tableChunks);
      
      currentIndex = tableStart + table.length;
    }
    
    // Text nach der letzten Tabelle
    if (currentIndex < content.length) {
      const afterTables = content.substring(currentIndex);
      const textDoc = new Document({
        pageContent: afterTables,
        metadata: { ...document.metadata }
      });
      const textChunks = await this.splitByLevel(textDoc, ChunkLevel.SECTION);
      chunks.push(...textChunks);
    }

    return chunks;
  }

  /**
   * Reichert Chunks mit juristischen Metadaten an
   */
  private enrichWithMetadata(chunks: Document[], parentDocument: Document): HierarchicalChunk[] {
    return chunks.map((chunk, index) => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        id: `${parentDocument.metadata.id}_chunk_${index}`,
        documentId: parentDocument.metadata.id,
        chunkIndex: index,
        chunkLevel: chunk.metadata.chunkLevel || ChunkLevel.SECTION,
        language: this.detectLanguage(chunk.pageContent),
        legalReferences: this.extractLegalReferences(chunk.pageContent),
        contractClauses: this.identifyClauses(chunk.pageContent),
        section: this.extractSectionInfo(chunk.pageContent),
        subsection: this.extractSubsectionInfo(chunk.pageContent)
      }
    })) as HierarchicalChunk[];
  }

  /**
   * Detektiert die Sprache des Textes
   */
  private detectLanguage(text: string): string {
    // Einfache Heuristiken für Schweizer Amtssprachen
    const germanKeywords = ['der', 'die', 'das', 'und', 'oder', 'wenn', 'Artikel', 'Absatz', 'Gesetz'];
    const frenchKeywords = ['le', 'la', 'les', 'et', 'ou', 'si', 'article', 'alinéa', 'loi'];
    const italianKeywords = ['il', 'la', 'gli', 'e', 'o', 'se', 'articolo', 'capoverso', 'legge'];
    const englishKeywords = ['the', 'and', 'or', 'if', 'article', 'section', 'law'];

    const lowerText = text.toLowerCase();
    
    const germanScore = germanKeywords.reduce((score, word) => 
      score + (lowerText.includes(word) ? 1 : 0), 0);
    const frenchScore = frenchKeywords.reduce((score, word) => 
      score + (lowerText.includes(word) ? 1 : 0), 0);
    const italianScore = italianKeywords.reduce((score, word) => 
      score + (lowerText.includes(word) ? 1 : 0), 0);
    const englishScore = englishKeywords.reduce((score, word) => 
      score + (lowerText.includes(word) ? 1 : 0), 0);

    const scores = [
      { lang: 'de', score: germanScore },
      { lang: 'fr', score: frenchScore },
      { lang: 'it', score: italianScore },
      { lang: 'en', score: englishScore }
    ];

    const bestMatch = scores.sort((a, b) => b.score - a.score)[0];
    return bestMatch && bestMatch.score > 0 ? bestMatch.lang : 'de'; // Default Deutsch
  }

  /**
   * Extrahiert Rechtsreferenzen aus dem Text
   */
  private extractLegalReferences(text: string): string[] {
    const references: string[] = [];
    
    // Schweizer Gesetze (OR, ZGB, StGB, etc.)
    const swissLawPattern = /(OR|ZGB|StGB|StPO|ZPO|DSG|ArG|BÜPF)\s*(?:Art\.?\s*)?(\d+(?:\w*)?)/gi;
    const swissMatches = text.match(swissLawPattern);
    if (swissMatches) {
      references.push(...swissMatches);
    }

    // EU-Recht (DSGVO, etc.)
    const euLawPattern = /(DSGVO|GDPR)\s*(?:Art\.?\s*)?(\d+)/gi;
    const euMatches = text.match(euLawPattern);
    if (euMatches) {
      references.push(...euMatches);
    }

    // Artikel-Referenzen allgemein
    const articlePattern = /Art\.?\s*(\d+(?:\w*)?)/gi;
    const articleMatches = text.match(articlePattern);
    if (articleMatches) {
      references.push(...articleMatches);
    }

    return [...new Set(references)]; // Duplikate entfernen
  }

  /**
   * Identifiziert Vertragsklauseln
   */
  private identifyClauses(text: string): string[] {
    const clauses: string[] = [];
    
    // Typische Vertragsklauseln
    const clausePatterns = [
      /Haftung(?:sausschluss|sbeschränkung)?/gi,
      /Gerichtsstand/gi,
      /Kündigung(?:sfrist)?/gi,
      /Vertraulichkeit/gi,
      /Datenschutz/gi,
      /Gewährleistung/gi,
      /Schadensersatz/gi,
      /Force\s+Majeure/gi,
      /Salvatorische\s+Klausel/gi
    ];

    for (const pattern of clausePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        clauses.push(...matches);
      }
    }

    return [...new Set(clauses)];
  }

  /**
   * Hilfsmethoden für Strukturerkennung
   */
  private hasChapterStructure(content: string): boolean {
    const chapterPatterns = [
      /\n(?:Kapitel|Chapter|Chapitre|Capitolo)\s+\d+/i,
      /\n(?:Abschnitt|Section)\s+\d+/i,
      /\n##\s+/
    ];
    return chapterPatterns.some(pattern => pattern.test(content));
  }

  private hasSectionStructure(content: string): boolean {
    const sectionPatterns = [
      /\n(?:§|Art\.?|Article)\s*\d+/i,
      /\n###\s+/,
      /\n\d+\.\s+[A-Z]/
    ];
    return sectionPatterns.some(pattern => pattern.test(content));
  }

  private hasTableStructure(content: string): boolean {
    return /\|.*\|.*\n(?:\|.*\|.*\n)+/g.test(content);
  }

  private estimateComplexity(content: string, hasChapters: boolean, hasSections: boolean): 'low' | 'medium' | 'high' {
    const length = content.length;
    const structureComplexity = (hasChapters ? 2 : 0) + (hasSections ? 1 : 0);
    
    if (length > 20000 && structureComplexity >= 2) return 'high';
    if (length > 10000 || structureComplexity >= 1) return 'medium';
    return 'low';
  }

  private extractSectionInfo(text: string): string | undefined {
    const sectionMatch = text.match(/(?:§|Art\.?|Article)\s*(\d+(?:\w*)?)/i);
    return sectionMatch ? sectionMatch[1] : undefined;
  }

  private extractSubsectionInfo(text: string): string | undefined {
    const subsectionMatch = text.match(/(?:Abs\.?|Absatz|Alinéa|Paragraph)\s*(\d+(?:\w*)?)/i);
    return subsectionMatch ? subsectionMatch[1] : undefined;
  }

  /**
   * Hilfsmethode für optimale Chunk-Größe basierend auf Dokumenttyp
   */
  getOptimalChunkSizeForType(type: DocumentType): number {
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
}
