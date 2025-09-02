import { env } from '@config/environment';
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
            id: 'disclosingPartyAddress',
            name: 'Adresse der offenlegenden Partei',
            type: 'text',
            required: true,
            description: 'Vollständige Adresse der offenlegenden Partei'
          },
          {
            id: 'receivingParty',
            name: 'Empfangende Partei',
            type: 'text',
            required: true,
            description: 'Name der Partei, die Informationen empfängt'
          },
          {
            id: 'receivingPartyAddress',
            name: 'Adresse der empfangenden Partei',
            type: 'text',
            required: true,
            description: 'Vollständige Adresse der empfangenden Partei'
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
            name: 'Dauer der Geheimhaltung',
            type: 'text',
            required: true,
            description: 'Dauer der Geheimhaltungspflicht (z.B. "5 Jahre")'
          },
          {
            id: 'penalty',
            name: 'Vertragsstrafe',
            type: 'text',
            required: true,
            description: 'Vertragsstrafe bei Verletzung der Geheimhaltung'
          },
          {
            id: 'jurisdiction',
            name: 'Gerichtsstand',
            type: 'text',
            required: true,
            description: 'Zuständiger Gerichtsstand'
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
   * Generate a contract document using ChatGPT
   */
  async generateContractDocument(
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

      let templateVectorStoreId: string = '';
      if (contractType.id === 'employment') {
        templateVectorStoreId = 'vs_68adafe6de688191b7728412c74f57b1';
      } else if (contractType.id === 'nda') {
        templateVectorStoreId = 'vs_68b703fa4da48191a55d4e7f7bf2de00';
      } else {
        throw new Error(`Keine Vorlage für Vertragstyp: ${request.contractType}`);
      }

      // Create the prompt for ChatGPT
      const prompt = this.createContractPrompt(request.contractType, request.parameters);

      // Create system prompt based on contract type
      let systemPrompt: string;
      if (contractType.id === 'nda') {
        systemPrompt = `Du bist ein erfahrener Vertragsgenerator.`;
      } else if (contractType.id === 'employment') {
        systemPrompt = `Du bist ein spezialisierter Schweizer Arbeitsrechtanwalt mit Expertise in OR Art. 319-362. 
Erstelle AUSSCHLIESSLICH rechtsgültige Arbeitsverträge nach schweizerischem Recht.

RECHTLICHE VALIDIERUNG:
- Prüfe JEDEN Abschnitt auf OR-Konformität (Art. 319-362)
- Stelle sicher: Mindestlohn, Arbeitszeit, Kündigungsfristen korrekt
- Berücksichtige zwingende Bestimmungen (OR Art. 361/362)
- Validiere Probezeit max. 3 Monate (OR Art. 335b)
- Prüfe Ferienanspruch min. 4 Wochen (OR Art. 329a)

PFLICHTKLAUSELN SICHERSTELLEN:
- Vertragsparteien mit vollständigen Adressen
- Arbeitsort und -beginn eindeutig definiert
- Lohn und Arbeitspensum rechtlich korrekt
- Kündigungsfristen nach OR Art. 335 ff.
- Arbeitszeiten nach ArG

AUSGABE:
- Erstelle einen sauberen, professionellen Arbeitsvertrag
- KEINE Empfehlungen, Hinweise oder Kommentare im Dokument
- KEINE rechtlichen Bewertungen sichtbar
- NUR den fertigen Vertrag ausgeben
- Verwende ausschließlich rechtsgültige OR-konforme Klauseln`;
      } else {
        throw new Error(`Unbekannter Vertragstyp: ${contractType.id}`);
      }

      const response = await this.openai.responses.create({
        model: env.OPENAI_CHAT_MODEL,
        service_tier: 'priority',
        input: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        tools: [
          {
            type: 'file_search',
            vector_store_ids: [templateVectorStoreId, 'vs_68a726b561888191ab1eeeb15e5c34e8']
          },
        ],
      });

      const markdownContent = response.output_text;

      this.logger.info('Contract generation completed successfully', { markdownContent })

      if (!markdownContent) {
        throw new Error('Keine Antwort von ChatGPT erhalten');
      }

      // Generate PDF from markdown
      const pdfBuffer = await this.generatePDF(markdownContent, request.parameters, contractType.id, asWord);

      // Create filename for the PDF
      let fileNameSuffix: string;
      if (request.contractType === 'nda') {
        fileNameSuffix = `${request.parameters['disclosingParty']?.replace(/[^a-zA-Z0-9]/g, '_') || 'NDA'}`;
      } else {
        fileNameSuffix = `${request.parameters['employerName']?.replace(/[^a-zA-Z0-9]/g, '_') || 'Contract'}`;
      }
      const fileName = `${contractType.name.replace(/[^a-zA-Z0-9]/g, '_')}_${fileNameSuffix}.${asWord ? 'docx' : 'pdf'}`;

      // Save PDF to Firebase Storage at /users/userId/documents/generated/documentId
      const base64Content = pdfBuffer.toString('base64');

      // Upload to storage using the generated document ID
      const uploadResult = await this.storageService.uploadDocumentDirect(
        `generated/${documentId}`,
        fileName,
        asWord ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf',
        base64Content,
        request.userId
      );

      // Add document to user's Firestore collection
      await this.firestoreService.createDocument(request.userId, documentId, uploadResult.downloadUrl, {
        fileName,
        size: pdfBuffer.length,
        contentType: asWord ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf',
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
        downloadUrl: uploadResult.downloadUrl
      });

      return { downloadUrl: uploadResult.downloadUrl, documentId };

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
   * Get common HTML formatting instructions for all contract types
   */
  private getHtmlFormattingInstructions(): string {
    return `- Gib das Ergebnis als vollständiges HTML-Dokument zurück.
- Verwende <!DOCTYPE html>, <html>, <head>, <meta charset="UTF-8">, <style>, <body>.
- Nutze ein modernes, aber seriöses, SCHLICHTES Layout (keine farbigen Hintergründe, keine Boxen, keine Schatten).
- Kein Markdown, nur valides HTML.
- Erwähne nie die Vertragsvorlagen oder die Artikel des OR im Vertragstext.
- Verwende ausschließlich Abschnitte aus der angehängten Vorlage, die du mit den vorliegenden Vertragsdaten befüllen kannst.
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

Achte auf juristisch korrekte Formulierungen gemäß OR und keine Platzhaltertexte. Nimm genau die Angaben aus den Vertragsdaten unten. Verwende keine anderen Daten.`;
  }

  /**
   * Create a prompt for ChatGPT based on contract type and parameters
   */
  private createContractPrompt(contractType: string, parameters: Record<string, any>): string {
    if (contractType === 'nda') {
      // NDA-specific prompt
      return `Du bist ein Vertragsgenerator für Vertraulichkeitsvereinbarungen (NDA) nach schweizerischem Recht (OR ist bekannt aus dem Vector Store)
Verwende die Standardvorlage (bekannt aus dem Vector Store) und ersetze die Platzhalter durch die folgenden Daten:

- Offenlegende Partei: ${parameters.disclosingParty}
- Adresse der offenlegenden Partei: ${parameters.disclosingPartyAddress}
- Empfangende Partei: ${parameters.receivingParty}
- Adresse der empfangenden Partei: ${parameters.receivingPartyAddress}
- Zweck: ${parameters.purpose}
- Dauer der Geheimhaltung: ${parameters.duration}
- Vertragsstrafe: ${parameters.penalty}
- Gerichtsstand: ${parameters.jurisdiction}

WICHTIG: 
- Gib NUR die fertige Vertraulichkeitsvereinbarung aus - keine Empfehlungen, Hinweise oder Kommentare!
- Erfinde keine zusätzlichen Abschnitte, verwende nur die aus der Vorlage.

${this.getHtmlFormattingInstructions()}

Erstelle eine saubere, professionelle Vertraulichkeitsvereinbarung ohne zusätzliche Kommentare oder Empfehlungen.`;
    }

    // Employment contract logic (existing)
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

    let prompt = `Erstelle einen rechtsgültigen Schweizer Arbeitsvertrag nach OR Art. 319-362 mit der angehängten Vertragsvorlage.

WICHTIG: Gib NUR den fertigen Arbeitsvertrag aus - keine Empfehlungen, Hinweise oder Kommentare!

${this.getHtmlFormattingInstructions()}

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
- Probezeit: ${parameters['probationPeriod'] || 3} Monate

Erstelle einen sauberen, professionellen Arbeitsvertrag ohne zusätzliche Kommentare oder Empfehlungen.`;

    return prompt;
  }


  /**
   * Generate PDF from markdown content
   */
  public async generatePDF(content: string, parameters: Record<string, any>, contractType: string, asWord: boolean = false): Promise<Buffer> {
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

        let footerName: string = ''
        if (contractType === 'nda') {
          footerName = parameters['disclosingParty'] || '';
        } else if (contractType === 'employment') {
          footerName = parameters['employerName'] || '';
        }

        let footerAddress: string = '';
        if (contractType === 'nda') {
          footerAddress = parameters['disclosingPartyAddress'] || '';
        } else if (contractType === 'employment') {
          footerAddress = parameters['employerAddress'] || '';
        }

        const pdfUint8Array = await page.pdf({
          format: 'A4',
          printBackground: false,
          preferCSSPageSize: true,
          displayHeaderFooter: true,
          footerTemplate: `
            <div style="width: 100%; font-size: 9px; color: #444; display: flex; justify-content: space-between;  padding: 0 10mm;">
              <div style="display: flex; gap: 15px;">
                <div>
                  ${footerName}<br>
                  ${footerAddress}
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
}
