import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/logger';
import { FirestoreService } from './FirestoreService';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';

export interface VectorStoreDocument {
  id: string;
  vectorStoreId: string;
  name: string;
  description?: string;
  fileId: string;
  fileUrl: string;
  status: 'creating' | 'ready' | 'error';
  fileCount: number;
  files: Array<{
    id: string;
    object: string;
    usage_bytes: number;
    created_at: number;
    status: string;
  }>;
  createdBy: string;
  createdAt: Date;
  lastUpdated: Date;
  metadata?: {
    jurisdiction?: string;
    lawType?: string;
    language?: string;
    version?: string;
  };
}

export class VectorStoreService {
  private readonly logger = Logger.getInstance();
  private readonly openai: OpenAI;
  private readonly firestoreService: FirestoreService;

  constructor(
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    this.firestoreService = new FirestoreService();
  }

  /**
   * Erstelle VectorStore und speichere in Firestore
   */
  async createAndSaveVectorStore(
    name: string,
    fileUrl: string,
    userId: string,
  ): Promise<VectorStoreDocument> {
    const firestoreDocId = uuidv4();

    try {
      this.logger.info('Erstelle VectorStore', { name, fileUrl, userId });

      // 1. Datei in OpenAI hochladen
      const fileId = await this.createFile(fileUrl);

      // 2. VectorStore erstellen
      const vectorStore = await this.openai.vectorStores.create({
        name: name,
      });

      // 3. Datei zu VectorStore hinzufügen
      await this.openai.vectorStores.files.create(
        vectorStore.id,
        { file_id: fileId }
      );

      // 4. Dateien-Status abrufen
      const result = await this.openai.vectorStores.files.list(vectorStore.id);

      // 5. VectorStore-Dokument erstellen
      const vectorStoreDoc: VectorStoreDocument = {
        id: firestoreDocId,
        vectorStoreId: vectorStore.id,
        name: name,
        description: 'OR Vetor store',
        fileId: fileId,
        fileUrl: fileUrl,
        status: 'ready',
        fileCount: result.data.length,
        files: result.data.map(file => ({
          id: file.id,
          object: file.object,
          usage_bytes: file.usage_bytes,
          created_at: file.created_at,
          status: file.status
        })),
        createdBy: userId,
        createdAt: new Date(),
        lastUpdated: new Date()
      };

      // 6. In Firestore speichern
      await this.firestoreService.db
      .collection('vectorStores')
      .doc(firestoreDocId)
      .set(vectorStoreDoc);

      this.logger.info('VectorStore erfolgreich erstellt und gespeichert', {
        firestoreDocId,
        vectorStoreId: vectorStore.id,
        fileCount: result.data.length
      });

      return vectorStoreDoc;

    } catch (error) {
      this.logger.error('Fehler beim Erstellen des VectorStores', error as Error, {
        name,
        fileUrl,
        userId,
        firestoreDocId
      });

      // Fehler-Status in Firestore speichern
      const errorDoc: VectorStoreDocument = {
        id: firestoreDocId,
        vectorStoreId: '',
        name: name,
        description: 'OR faile',
        fileId: '',
        fileUrl: fileUrl,
        status: 'error',
        fileCount: 0,
        files: [],
        createdBy: userId,
        createdAt: new Date(),
        lastUpdated: new Date(),
      };

      await this.firestoreService.db
      .collection('vectorStores')
      .doc(firestoreDocId)
      .set(errorDoc);

      throw error;
    }
  }

  /**
   * Alle VectorStores für einen User abrufen
   */
  async getUserVectorStores(userId: string): Promise<VectorStoreDocument[]> {
    try {
      const snapshot = await this.firestoreService.db
      .collection('vectorStores')
      .where('createdBy', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

      return snapshot.docs.map(doc => doc.data() as VectorStoreDocument);
    } catch (error) {
      this.logger.error('Fehler beim Abrufen der VectorStores', error as Error, { userId });
      throw error;
    }
  }

  /**
   * VectorStore nach ID abrufen
   */
  async getVectorStore(firestoreDocId: string, userId: string): Promise<VectorStoreDocument | null> {
    try {
      const doc = await this.firestoreService.db
      .collection('vectorStores')
      .doc(firestoreDocId)
      .get();

      if (!doc.exists) {
        return null;
      }

      const vectorStore = doc.data() as VectorStoreDocument;

      // Sicherheitsprüfung: User kann nur eigene VectorStores abrufen
      if (vectorStore.createdBy !== userId) {
        return null;
      }

      return vectorStore;
    } catch (error) {
      this.logger.error('Fehler beim Abrufen des VectorStores', error as Error, { firestoreDocId, userId });
      throw error;
    }
  }

  /**
   * VectorStore löschen (sowohl OpenAI als auch Firestore)
   */
  async deleteVectorStore(firestoreDocId: string, userId: string): Promise<void> {
    try {
      const vectorStore = await this.getVectorStore(firestoreDocId, userId);
      if (!vectorStore) {
        throw new Error('VectorStore nicht gefunden');
      }

      // 1. OpenAI VectorStore löschen
      if (vectorStore.vectorStoreId) {
        try {
          await this.openai.vectorStores.delete(vectorStore.vectorStoreId);
          this.logger.info('OpenAI VectorStore gelöscht', {
            vectorStoreId: vectorStore.vectorStoreId
          });
        } catch (error) {
          this.logger.warn('Fehler beim Löschen des OpenAI VectorStores', error as Error);
          // Weitermachen, auch wenn OpenAI-Löschung fehlschlägt
        }
      }

      // 2. Firestore-Dokument löschen
      await this.firestoreService.db
      .collection('vectorStores')
      .doc(firestoreDocId)
      .delete();

      this.logger.info('VectorStore vollständig gelöscht', { firestoreDocId, userId });
    } catch (error) {
      this.logger.error('Fehler beim Löschen des VectorStores', error as Error, { firestoreDocId, userId });
      throw error;
    }
  }

  /**
   * Datei in OpenAI hochladen
   */
  private async createFile(filePath: string) {
    let result;
    if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
      // Download the file content from the URL
      const res = await fetch(filePath);
      const buffer = await res.arrayBuffer();
      const urlParts = filePath.split("/");
      const fileName = urlParts[urlParts.length - 1];
      // @ts-ignore
      const file = new File([buffer], fileName);
      result = await this.openai.files.create({
        file: file,
        purpose: "assistants",
      });
    } else {
      // Handle local file path
      const directPath = path.join(__dirname, filePath);
      const fileContent = fs.createReadStream(directPath);
      result = await this.openai.files.create({
        file: fileContent,
        purpose: "assistants",
      });
    }
    return result.id;
  }
}