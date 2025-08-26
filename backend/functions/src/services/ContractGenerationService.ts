import OpenAI from 'openai';
import markdownpdf from 'markdown-pdf';
import * as path from 'path';
import * as fs from 'fs';
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
        model: "gpt-5-mini-2025-08-07",
        input: prompt,
        tools: [
          {
            type: "file_search",
            vector_store_ids: ['vs_68adafe6de688191b7728412c74f57b1', 'vs_68a726b561888191ab1eeeb15e5c34e8']
          },
        ],
      });

      const markdownContent = response.output_text;

      this.logger.info('Contract generation completed successfully', {markdownContent})

      if (!markdownContent) {
        throw new Error('Keine Antwort von ChatGPT erhalten');
      }

      // Generate PDF from markdown
      const pdfBuffer = await this.generatePDF(markdownContent, contractType.name);

      // Create filename for the PDF
      const fileName = `${contractType.name.replace(/[^a-zA-Z0-9]/g, '_')}_${documentId}.pdf`;

      // Save PDF to Firebase Storage at /users/userId/documents/generated/documentId
      const base64Content = pdfBuffer.toString('base64');

      // Upload to storage using the generated document ID
      await this.storageService.uploadDocumentDirect(
        `generated/${documentId}`,
        fileName,
        'application/pdf',
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
        contentType: 'application/pdf',
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

    let prompt = `Erstelle einen Arbeitsvertrag basierend auf der Vertragsvorlage.
Berücksichtige zwingend die relevanten Artikel aus dem Schweizer OR (Art. 319 ff.).

⚠️ Wichtig:
- Gib den Vertrag ausschließlich in **Markdown** zurück.
- Markdown orientiert sich an der Vorlage
- Brauche exakt die Struktur der Vorlage, keine zusätzlichen Abschnitte oder Erklärungen.
- Überschriften = \`##\`
- Unterüberschriften = \`###\`
- Absätze normaler Text
- Kein zusätzlicher Text, keine Kommentare, nur den Vertrag.

Vertragsdaten:
- Arbeitgeber: ${parameters['employerName']}
- Adresse des Arbeitgebers: ${parameters['employerAddress']}
- Arbeitnehmer: ${parameters['employeeName']}
- Adresse des Arbeitnehmers: ${parameters['employeeAddress']}
- Beginn: ${formattedStartDate}
- Funktion: ${parameters['position']}
- Jahreslohn Brutto: ${parameters['salary']} CHF
- Monatslohn Brutto: ${parameters['salary'] / 12} CHF // rundet auf ganze Franken
- Arbeitspensum: ${parameters['workingHours'] || 100}%
- Ferien: ${parameters['vacationDays'] || 25} Tage
- Probezeit: ${parameters['probationPeriod'] || 3} Monate

 Gib den Vertrag in Markdown-Struktur zurück (Überschriften = ##, Unterpunkte = -, Absätze klar getrennt)`;

    return prompt;
  }


  /**
   * Generate PDF from markdown content
   */
  public async generatePDF(markdownContent: string, contractTitle: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        // Add title to markdown content if provided
        /*const fullMarkdownContent = contractTitle
          ? `# ${contractTitle}\n\n${markdownContent}`
          : markdownContent;
          */


        // Read CSS stylesheet
        const cssPath = path.join(__dirname, '../../assets/pdf-styles.css');
        const cssContent = fs.readFileSync(cssPath, 'utf8');

        // Configure markdown-pdf options
        const options = {
          cssPath: cssPath,
          paperFormat: 'A4' as const,
          paperBorder: '1cm',
          renderDelay: 1000
        };

        // Generate PDF from markdown
        markdownpdf(options).from.string(markdownContent).to.buffer((err: Error | null, buffer: Buffer) => {
          if (err) {
            this.logger.error('Error in generatePDF method', err);
            reject(err);
          } else {
            this.logger.info('PDF generated successfully using markdown-pdf');
            resolve(buffer);
          }
        });

      } catch (error) {
        this.logger.error('Error in generatePDF method', error as Error);
        reject(error);
      }
    });
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
