import HTMLtoDOCX from '@turbodocx/html-to-docx';
import OpenAI from 'openai';
import * as puppeteer from 'puppeteer';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import { FirestoreService } from './FirestoreService';
import { StorageService } from './StorageService';


// Contract generation interfaces
export interface ContractGenerationRequest {
  contractType: string;
  parameters: Record<string, any>;
  userId: string;
}

export interface ContractGenerationResult {
  id: string;
  userId: string;
  contractType: string;
  parameters: Record<string, any>;
  markdownContent: string;
  pdfBuffer?: Buffer;
  createdAt: Date;
  status: 'generating' | 'completed' | 'error';
  error?: string;
}

export interface ContractType {
  id: string;
  name: string;
  description: string;
  parameters: ContractParameter[];
}

export interface ContractParameter {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  required: boolean;
  description: string;
  options?: string[]; // for select type
  defaultValue?: any;
}

export class ContractGenerationService {
  private logger = Logger.getInstance();
  private firestoreService: FirestoreService;
  private storageService: StorageService;
  private openai: OpenAI;

  constructor(firestoreService?: FirestoreService, storageService?: StorageService) {
    this.firestoreService = firestoreService || new FirestoreService();
    this.storageService = storageService || new StorageService();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Get available contract types with their parameters
   */
  getContractTypes(): ContractType[] {
    return [
      {
        id: 'nda',
        name: 'Geheimhaltungsvereinbarung (NDA)',
        description: 'Vertraulichkeitsvereinbarung nach Schweizer Recht',
        parameters: [
          {
            id: 'disclosingParty',
            name: 'Offenlegende Partei',
            type: 'text',
            required: true,
            description: 'Name der Partei, die Informationen offenlegt'
          },
          {
            id: 'receivingParty',
            name: 'Empfangende Partei',
            type: 'text',
            required: true,
            description: 'Name der Partei, die Informationen empfängt'
          },
          {
            id: 'purpose',
            name: 'Zweck der Offenlegung',
            type: 'text',
            required: true,
            description: 'Zweck, für den die vertraulichen Informationen offengelegt werden'
          },
          {
            id: 'duration',
            name: 'Dauer der Geheimhaltung (Jahre)',
            type: 'number',
            required: true,
            description: 'Dauer der Geheimhaltungspflicht in Jahren',
            defaultValue: 5
          },
          {
            id: 'mutualNDA',
            name: 'Gegenseitige Geheimhaltung',
            type: 'boolean',
            required: false,
            description: 'Sollen beide Parteien zur Geheimhaltung verpflichtet werden?',
            defaultValue: false
          }
        ]
      },
      {
        id: 'employment',
        name: 'Arbeitsvertrag',
        description: 'Standardarbeitsvertrag nach Schweizer Recht',
        parameters: [
          {
            id: 'employeeName',
            name: 'Name des Arbeitnehmers',
            type: 'text',
            required: true,
            description: 'Vollständiger Name des Arbeitnehmers'
          },
          {
            id: 'employerName',
            name: 'Name des Arbeitgebers',
            type: 'text',
            required: true,
            description: 'Vollständiger Name oder Firmenname des Arbeitgebers'
          },
          {
            id: 'position',
            name: 'Position/Stelle',
            type: 'text',
            required: true,
            description: 'Bezeichnung der Position oder Stelle'
          },
          {
            id: 'salary',
            name: 'Gehalt (CHF)',
            type: 'number',
            required: true,
            description: 'Jahresgehalt in Schweizer Franken'
          },
          {
            id: 'startDate',
            name: 'Arbeitsbeginn',
            type: 'date',
            required: true,
            description: 'Datum des Arbeitsbeginns'
          },
          {
            id: 'workingHours',
            name: 'Arbeitspensum (%)',
            type: 'number',
            required: true,
            description: 'Arbeitspensum in Prozent (z.B. 100 für Vollzeit)',
            defaultValue: 100
          },
          {
            id: 'probationPeriod',
            name: 'Probezeit (Monate)',
            type: 'number',
            required: false,
            description: 'Dauer der Probezeit in Monaten',
            defaultValue: 3
          },
          {
            id: 'vacationDays',
            name: 'Ferientage',
            type: 'number',
            required: false,
            description: 'Anzahl Ferientage pro Jahr',
            defaultValue: 25
          }
        ]
      },
      {
        id: 'terms',
        name: 'Allgemeine Geschäftsbedingungen',
        description: 'AGB für Unternehmen nach Schweizer Recht',
        parameters: [
          {
            id: 'companyName',
            name: 'Firmenname',
            type: 'text',
            required: true,
            description: 'Vollständiger Name des Unternehmens'
          },
          {
            id: 'companyAddress',
            name: 'Firmenadresse',
            type: 'text',
            required: true,
            description: 'Vollständige Adresse des Unternehmens'
          },
          {
            id: 'businessType',
            name: 'Art des Geschäfts',
            type: 'select',
            required: true,
            description: 'Art der Geschäftstätigkeit',
            options: ['Online-Shop', 'Dienstleistung', 'Software/SaaS', 'Beratung', 'Sonstiges'],
            defaultValue: 'Dienstleistung'
          },
          {
            id: 'paymentTerms',
            name: 'Zahlungsbedingungen',
            type: 'select',
            required: true,
            description: 'Standard-Zahlungsbedingungen',
            options: ['Sofort', '7 Tage', '14 Tage', '30 Tage', '60 Tage'],
            defaultValue: '30 Tage'
          },
          {
            id: 'warrantyPeriod',
            name: 'Gewährleistungsfrist (Monate)',
            type: 'number',
            required: false,
            description: 'Gewährleistungsfrist in Monaten',
            defaultValue: 12
          },
          {
            id: 'jurisdiction',
            name: 'Gerichtsstand',
            type: 'text',
            required: true,
            description: 'Zuständiger Gerichtsstand (z.B. Zürich, Bern)',
            defaultValue: 'Zürich'
          },
          {
            id: 'dataProtection',
            name: 'Datenschutz einbeziehen',
            type: 'boolean',
            required: false,
            description: 'Sollen Datenschutzbestimmungen einbezogen werden?',
            defaultValue: true
          }
        ]
      }
    ];
  }

  /**
   * Generate a contract using ChatGPT
   */
  async generateContract(
    request: ContractGenerationRequest
  ): Promise<{ downloadUrl: string; documentId: string }> {
    const documentId = uuidv4();
    // for now fix false, later allow user to choose
    const asWord = false;

    this.logger.info('Starting contract generation', {
      documentId,
      contractType: request.contractType,
      userId: request.userId
    });

    try {
      // Get contract type configuration
      const contractTypes = this.getContractTypes();
      const contractType = contractTypes.find(ct => ct.id === request.contractType);

      if (!contractType) {
        throw new Error(`Unbekannter Vertragstyp: ${request.contractType}`);
      }

      // Create the prompt for ChatGPT
      const prompt = this.createContractPrompt(request.parameters);

      const response = await this.openai.responses.create({
        model: 'gpt-5-mini-2025-08-07',
        input: prompt,
        tools: [
          {
            type: 'file_search',
            vector_store_ids: ['vs_68adafe6de688191b7728412c74f57b1', 'vs_68a726b561888191ab1eeeb15e5c34e8']
          },
        ],
      });

      const markdownContent = response.output_text;

      this.logger.info('Contract generation completed successfully', { markdownContent })

      if (!markdownContent) {
        throw new Error('Keine Antwort von ChatGPT erhalten');
      }

      // Generate PDF from markdown
      const pdfBuffer = await this.generatePDF(markdownContent, request.parameters, asWord);

      // Create filename for the PDF
      const fileName = `${contractType.name.replace(/[^a-zA-Z0-9]/g, '_')}_${documentId}.${asWord ? 'docx' : 'pdf'}`;

      // Save PDF to Firebase Storage at /users/userId/documents/generated/documentId
      const base64Content = pdfBuffer.toString('base64');

      // Upload to storage using the generated document ID
      await this.storageService.uploadDocumentDirect(
        `generated/${documentId}`,
        fileName,
        asWord ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf',
        base64Content,
        request.userId
      );

      // Get download URL
      const downloadUrl = await this.storageService.getDocumentDownloadUrl(
        request.userId,
        `generated/${documentId}`,
        fileName
      );

      // Add document to user's Firestore collection
      await this.firestoreService.createDocument(request.userId, documentId, {
        fileName,
        size: pdfBuffer.length,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        uploadedAt: new Date().toISOString(),
        status: 'uploaded',
        category: 'contract',
        description: `Generated ${contractType.name}`,
        tags: ['generated', 'contract', request.contractType]
      });

      this.logger.info('Contract generation completed successfully', {
        documentId,
        contractType: request.contractType,
        userId: request.userId,
        downloadUrl
      });

      return { downloadUrl, documentId };

    } catch (error) {
      this.logger.error('Error during contract generation', error as Error, {
        documentId,
        contractType: request.contractType,
        userId: request.userId
      });

      throw error;
    }
  }

  /**
   * Create a prompt for ChatGPT based on contract type and parameters
   */
  private createContractPrompt(parameters: Record<string, any>): string {
    // Format startDate from ISO string (YYYY-MM-DD) to Swiss format (DD.MM.YYYY)
    let formattedStartDate = parameters['startDate'];
    if (parameters['startDate']) {
      const date = new Date(parameters['startDate']);
      if (!isNaN(date.getTime())) {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        formattedStartDate = `${day}.${month}.${year}`;
      }
    }

    let prompt = `Erstelle einen Arbeitsvertrag nach der angehängten Vertragsvorlage.  
Berücksichtige die relevanten Artikel der angehängten Schweizer OR (insbesondere Art. 319 ff. OR).

Gib das Ergebnis als vollständiges HTML-Dokument zurück:
- Verwende <!DOCTYPE html>, <html>, <head>, <meta charset="UTF-8">, <style>, <body>.
- Nutze ein modernes, aber seriöses, SCHLICHTES Layout (keine farbigen Hintergründe, keine Boxen, keine Schatten).
- Kein Markdown, nur valides HTML.
- Verwende ausschließlich die Abschnitte der Vorlage, KEINE zusätzlichen Abschnitte.
- Abschnitte nummerieren
- Struktur: Jeder Abschnitt ist ein <section class="section"> mit <h2> und den zugehörigen Inhalten (Absätze, Listen, dl/dt/dd).
- Abschnitte sollen NICHT über Seiten hinweg getrennt werden. Wenn ein Abschnitt länger als eine Seite ist, soll zumindest die Überschrift mit dem ersten Absatz zusammenbleiben.
- Verwende folgendes CSS im <style>-Block (nicht ändern):

body {
  font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.7;
  margin: 35mm 20mm;
  color: #222;
  background: none;
}

h1 {
  font-size: 1.8em;
  font-weight: 600;
  letter-spacing: -0.5px;
  margin: 0 0 15mm 0;
  text-align: center;
}

h2 {
  font-size: 1.2em;
  font-weight: 600;
  margin: 0 0 5mm 0;
  border-bottom: 0.3mm solid #aaa;
  padding-bottom: 2mm;
  page-break-after: avoid;
  break-after: avoid;
}

.section {
  margin: 15mm 0;
  page-break-inside: avoid;
  break-inside: avoid;
}

p, li, dd {
  margin: 0 0 5mm 0;
  font-size: 0.95em;
}

dl { margin: 0; }
dt { font-weight: 600; margin-top: 4mm; }
dd { margin-left: 0; }

.signature-row {
  display: flex;
  justify-content: space-between;
  gap: 10mm;
  margin-top: 25mm;
}

.signature {
  width: 45%;
  text-align: center;
  border-top: 0.2mm solid #444;
  padding-top: 4mm;
  font-size: 0.9em;
  page-break-inside: avoid;
  break-inside: avoid;
}

@page {
  size: A4;
  margin: 20mm;
}

@media print {
  body { margin: 0; }
  * { background: none !important; box-shadow: none !important; }
  h2 { page-break-after: avoid; }
  .section { page-break-inside: avoid; }
}

Achte auf juristisch korrekte Formulierungen gemäß OR und keine Platzhaltertexte. Nimm genau die Angaben aus den Vertragsdaten unten. Verwende keine anderen Daten.

Vertragsdaten:
- Arbeitgeber: ${parameters['employerName']}
- Adresse des Arbeitgebers: ${parameters['employerAddress']}
- Arbeitnehmer: ${parameters['employeeName']}
- Adresse des Arbeitnehmers: ${parameters['employeeAddress']}
- Beginn: ${formattedStartDate}
- Funktion: ${parameters['position']}
- Jahreslohn Brutto: ${parameters['salary']} CHF
- Monatslohn Brutto: ${Math.round(parameters['salary'] / 12)} CHF
- Arbeitspensum: ${parameters['workingHours'] || 100}%
- Ferien: ${parameters['vacationDays'] || 25} Tage
- Probezeit: ${parameters['probationPeriod'] || 3} Monate`;

    return prompt;
  }


  /**
   * Generate PDF from markdown content
   */
  public async generatePDF(content: string, parameters: Record<string, any>, asWord: boolean = false): Promise<Buffer> {
    let browser: puppeteer.Browser | null = null;

    try {

      if (asWord) {
        this.logger.info('Generating Word document from HTML content');

        // @turbodocx/html-to-docx gibt einen ArrayBuffer zurück
        const docxArrayBuffer: ArrayBuffer = await HTMLtoDOCX(content, null, {
          table: { row: { cantSplit: true } },
          footer: true,
          pageNumber: true,
        }) as ArrayBuffer;

        // ArrayBuffer zu Buffer konvertieren
        const docxBuffer = Buffer.from(docxArrayBuffer);

        this.logger.info('Word document generated successfully', {
          bufferSize: docxBuffer.length
        });

        return docxBuffer;

      } else {
        // Launch puppeteer
        browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();

        // Set content and generate PDF
        await page.setContent(content, { waitUntil: 'networkidle0' });

        await page.emulateMediaType('print');

        const pdfUint8Array = await page.pdf({
          format: 'A4',
          printBackground: false,
          preferCSSPageSize: true,
          displayHeaderFooter: true,
          footerTemplate: `
            <div style="width: 100%; font-size: 9px; color: #444; display: flex; justify-content: space-between;  padding: 0 10mm;">
              <div style="display: flex; gap: 15px;">
                <div>
                  ${parameters['employerName']}<br>
                  ${parameters['employerAddress']}
                </div>
                <div>
                  ${parameters['employerPhone'] ? parameters['employerPhone'] : ''}
                  ${parameters['employerWebsite'] ? `${parameters['employerPhone'] ? '<br>' : ''}${parameters['employerWebsite']}` : ''}
                </div>
              </div>
              <div>
                <span class="pageNumber"></span>
              </div>
            </div>
          `,
          headerTemplate: `<div></div>`, // leer, wenn kein Header gewünscht
          margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
        });

        await browser.close();
        browser = null;

        return Buffer.from(pdfUint8Array);
      }


    } catch (error) {
      this.logger.error('Error in generatePDF method', error as Error);

      // Ensure browser is closed in case of error
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          this.logger.error('Error closing browser', closeError as Error);
        }
      }

      throw error;
    }
  }


  /**
   * Save generation result to Firestore
   */
  private async saveGenerationResult(result: ContractGenerationResult): Promise<void> {
    try {
      const docRef = this.firestoreService.db
      .collection('contractGenerations')
      .doc(result.id);

      // Don't save the PDF buffer to Firestore (too large)
      const { pdfBuffer, ...resultWithoutBuffer } = result;

      await docRef.set(resultWithoutBuffer);

      this.logger.info('Contract generation result saved to Firestore', {
        generationId: result.id,
        userId: result.userId
      });
    } catch (error) {
      this.logger.error('Error saving contract generation result', error as Error, {
        generationId: result.id,
        userId: result.userId
      });
      throw error;
    }
  }

  /**
   * Get contract generation result by ID
   */
  async getGenerationResult(generationId: string, userId: string): Promise<ContractGenerationResult | null> {
    try {
      const docRef = this.firestoreService.db
      .collection('contractGenerations')
      .doc(generationId);

      const doc = await docRef.get();

      if (!doc.exists) {
        return null;
      }

      const data = doc.data() as ContractGenerationResult;

      // Verify user access
      if (data.userId !== userId) {
        throw new Error('Unauthorized access to contract generation result');
      }

      return data;
    } catch (error) {
      this.logger.error('Error retrieving contract generation result', error as Error, {
        generationId,
        userId
      });
      throw error;
    }
  }

  /**
   * List user's contract generations
   */
  async listUserGenerations(userId: string, limit: number = 20): Promise<ContractGenerationResult[]> {
    try {
      const querySnapshot = await this.firestoreService.db
      .collection('contractGenerations')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

      const results: ContractGenerationResult[] = [];
      querySnapshot.forEach(doc => {
        results.push(doc.data() as ContractGenerationResult);
      });

      return results;
    } catch (error) {
      this.logger.error('Error listing user contract generations', error as Error, {
        userId
      });
      throw error;
    }
  }

  /**
   * Delete contract generation
   */
  async deleteGeneration(generationId: string, userId: string): Promise<void> {
    try {
      const docRef = this.firestoreService.db
      .collection('contractGenerations')
      .doc(generationId);

      const doc = await docRef.get();

      if (!doc.exists) {
        throw new Error('Contract generation not found');
      }

      const data = doc.data() as ContractGenerationResult;

      // Verify user access
      if (data.userId !== userId) {
        throw new Error('Unauthorized access to contract generation');
      }

      await docRef.delete();

      this.logger.info('Contract generation deleted', {
        generationId,
        userId
      });
    } catch (error) {
      this.logger.error('Error deleting contract generation', error as Error, {
        generationId,
        userId
      });
      throw error;
    }
  }
}
