import pdfParse from 'pdf-parse';
import { Logger } from '../utils/logger';

export class TextExtractionService {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Extract text from document buffer based on content type
   */
  async extractText(buffer: Buffer, contentType: string, fileName: string): Promise<string> {
    try {
      this.logger.info('Starting text extraction', {
        contentType,
        fileName,
        bufferSize: buffer.length
      });

      let extractedText: string;

      switch (contentType) {
        case 'application/pdf':
          extractedText = await this.extractFromPDF(buffer);
          break;

        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          extractedText = await this.extractFromDOCX(buffer);
          break;

        case 'application/msword':
          extractedText = await this.extractFromDOC(buffer);
          break;

        case 'text/plain':
        case 'text/markdown':
        case 'text/csv':
          extractedText = this.extractFromText(buffer);
          break;

        default:
          throw new Error(`Unsupported content type for text extraction: ${contentType}`);
      }

      this.logger.info('Text extraction completed', {
        contentType,
        fileName,
        extractedLength: extractedText.length
      });

      return extractedText;
    } catch (error) {
      this.logger.error('Text extraction failed', error as Error, {
        contentType,
        fileName,
        bufferSize: buffer.length
      });
      throw new Error(`Failed to extract text from ${contentType}: ${(error as Error).message}`);
    }
  }

  /**
   * Extract text from PDF buffer
   */
  private async extractFromPDF(buffer: Buffer): Promise<string> {
    try {
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      this.logger.error('PDF text extraction failed', error as Error);
      throw new Error('Failed to extract text from PDF');
    }
  }

  /**
   * Extract text from DOCX buffer
   */
  private async extractFromDOCX(buffer: Buffer): Promise<string> {
    try {
      // For now, we'll use a simple approach. In a production environment,
      // you might want to use a library like 'mammoth' or 'docx-parser'
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      this.logger.error('DOCX text extraction failed', error as Error);
      // Fallback: try to extract as plain text
      return this.extractFromText(buffer);
    }
  }

  /**
   * Extract text from DOC buffer (legacy Word format)
   */
  private async extractFromDOC(buffer: Buffer): Promise<string> {
    try {
      // For DOC files, we'll use a simple text extraction approach
      // In production, you might want to use a more sophisticated library
      return this.extractFromText(buffer);
    } catch (error) {
      this.logger.error('DOC text extraction failed', error as Error);
      throw new Error('Failed to extract text from DOC file');
    }
  }

  /**
   * Extract text from plain text buffer
   */
  private extractFromText(buffer: Buffer): string {
    try {
      return buffer.toString('utf-8');
    } catch (error) {
      this.logger.error('Text extraction failed', error as Error);
      throw new Error('Failed to extract text from buffer');
    }
  }

  /**
   * Clean and normalize extracted text
   */
  cleanText(text: string): string {
    return text
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\r/g, '\n')   // Handle old Mac line endings
      .replace(/\n{3,}/g, '\n\n') // Reduce multiple line breaks
      .replace(/\s+/g, ' ')   // Normalize whitespace
      .trim();
  }

  /**
   * Replace specific texts with random dummy data
   */
  replaceSpecificTexts(text: string, anonymizedKeywords: string[]): string {
    try {
      this.logger.info('Starting specific text replacement', {
        originalLength: text.length,
        textsCount: anonymizedKeywords.length
      });

      let sanitizedText = text;

      // Generate random replacement texts
      const generateRandomText = (originalText: string): string => {
        const randomWords = [
          'Lorem', 'Ipsum', 'Dolor', 'Sit', 'Amet', 'Consectetur', 'Adipiscing', 'Elit',
          'Sed', 'Do', 'Eiusmod', 'Tempor', 'Incididunt', 'Ut', 'Labore', 'Et', 'Dolore',
          'Magna', 'Aliqua', 'Enim', 'Ad', 'Minim', 'Veniam', 'Quis', 'Nostrud',
          'Exercitation', 'Ullamco', 'Laboris', 'Nisi', 'Aliquip', 'Ex', 'Ea', 'Commodo',
          'Consequat', 'Duis', 'Aute', 'Irure', 'In', 'Reprehenderit', 'Voluptate',
          'Velit', 'Esse', 'Cillum', 'Fugiat', 'Nulla', 'Pariatur', 'Excepteur', 'Sint',
          'Occaecat', 'Cupidatat', 'Non', 'Proident', 'Sunt', 'Culpa', 'Qui', 'Officia',
          'Deserunt', 'Mollit', 'Anim', 'Id', 'Est', 'Laborum'
        ];

        // If original text is short (likely a name or specific term), use a simple replacement
        if (originalText.length <= 20) {
          return randomWords[Math.floor(Math.random() * randomWords.length)] ?? '';
        }

        // For longer texts, generate a replacement of similar length
        const words = originalText.split(/\s+/);
        const replacementWords = [];

        for (let i = 0; i < words.length; i++) {
          replacementWords.push(randomWords[Math.floor(Math.random() * randomWords.length)]);
        }

        return replacementWords.join(' ');
      };

      // Replace each specified text with random dummy data
      anonymizedKeywords.forEach((textToReplace, index) => {
        if (textToReplace && textToReplace.trim()) {
          const escapedText = textToReplace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(escapedText, 'gi');
          const replacement = generateRandomText(textToReplace);

          sanitizedText = sanitizedText.replace(regex, replacement);

          this.logger.info(`Replaced text ${index + 1}`, {
            original: textToReplace,
            replacement: replacement
          });
        }
      });

      this.logger.info('Specific text replacement completed', {
        originalLength: text.length,
        sanitizedLength: sanitizedText.length,
        replacedTextsCount: anonymizedKeywords.length
      });

      return sanitizedText;
    } catch (error) {
      this.logger.error('Specific text replacement failed', error as Error);
      return text; // Fallback to original text in case of error
    }
  }
}
