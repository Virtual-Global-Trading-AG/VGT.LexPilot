import pdfParse from 'pdf-parse';
import PDFDocument from 'pdfkit';
import { Logger } from '../utils/logger';
import { AnonymizedKeyword } from '../models';

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
   * Replace specific texts with predefined anonymized replacements
   */
  replaceSpecificTexts(text: string, anonymizedKeywords: AnonymizedKeyword[]): string {
    try {
      this.logger.info('Starting specific text replacement', {
        originalLength: text.length,
        textsCount: anonymizedKeywords.length
      });

      let sanitizedText = text;

      // Replace each specified text with its predefined replacement
      anonymizedKeywords.forEach((anonymizedKeyword, index) => {
        if (anonymizedKeyword.keyword && anonymizedKeyword.keyword.trim() && 
            anonymizedKeyword.replaceWith && anonymizedKeyword.replaceWith.trim()) {
          const escapedText = anonymizedKeyword.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(escapedText, 'gi');

          sanitizedText = sanitizedText.replace(regex, anonymizedKeyword.replaceWith);

          this.logger.info(`Replaced text ${index + 1}`, {
            original: anonymizedKeyword.keyword,
            replacement: anonymizedKeyword.replaceWith
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

  /**
   * Reverse the anonymization process by replacing anonymized placeholders back with original keywords
   */
  reverseAnonymization(text: string, anonymizedKeywords: AnonymizedKeyword[]): string {
    try {
      this.logger.info('Starting reverse anonymization', {
        originalLength: text.length,
        keywordsCount: anonymizedKeywords.length
      });

      let deanonymizedText = text;

      // Replace each anonymized placeholder back with its original keyword
      anonymizedKeywords.forEach((anonymizedKeyword, index) => {
        if (anonymizedKeyword.replaceWith && anonymizedKeyword.replaceWith.trim() && 
            anonymizedKeyword.keyword && anonymizedKeyword.keyword.trim()) {
          const escapedReplacement = anonymizedKeyword.replaceWith.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(escapedReplacement, 'gi');

          deanonymizedText = deanonymizedText.replace(regex, anonymizedKeyword.keyword);

          this.logger.info(`Reversed anonymization ${index + 1}`, {
            anonymized: anonymizedKeyword.replaceWith,
            original: anonymizedKeyword.keyword
          });
        }
      });

      this.logger.info('Reverse anonymization completed', {
        originalLength: text.length,
        deanonymizedLength: deanonymizedText.length,
        reversedKeywordsCount: anonymizedKeywords.length
      });

      return deanonymizedText;
    } catch (error) {
      this.logger.error('Reverse anonymization failed', error as Error);
      return text; // Fallback to original text in case of error
    }
  }

  /**
   * Convert text back to PDF buffer
   */
  async convertTextToPDF(text: string, fileName: string = 'document.pdf'): Promise<Buffer> {
    try {
      this.logger.info('Starting text to PDF conversion', {
        textLength: text.length,
        fileName
      });

      return new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({
          size: 'A4',
          margins: {
            top: 50,
            bottom: 50,
            left: 50,
            right: 50
          }
        });

        const buffers: Buffer[] = [];

        // Collect PDF data
        doc.on('data', (chunk: Buffer) => {
          buffers.push(chunk);
        });

        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          this.logger.info('Text to PDF conversion completed', {
            textLength: text.length,
            pdfBufferSize: pdfBuffer.length,
            fileName
          });
          resolve(pdfBuffer);
        });

        doc.on('error', (error: Error) => {
          this.logger.error('PDF generation failed', error);
          reject(error);
        });

        // Add text content to PDF
        doc.fontSize(12);
        doc.font('Helvetica');

        // Split text into paragraphs and add them to the PDF
        const paragraphs = text.split('\n\n');

        paragraphs.forEach((paragraph, index) => {
          if (paragraph.trim()) {
            // Add some spacing between paragraphs
            if (index > 0) {
              doc.moveDown(0.5);
            }

            // Handle long paragraphs by wrapping text
            doc.text(paragraph.trim(), {
              align: 'left',
              width: doc.page.width - 100, // Account for margins
              continued: false
            });
          }
        });

        // Finalize the PDF
        doc.end();
      });
    } catch (error) {
      this.logger.error('Text to PDF conversion failed', error as Error, {
        textLength: text.length,
        fileName
      });
      throw new Error(`Failed to convert text to PDF: ${(error as Error).message}`);
    }
  }
}
