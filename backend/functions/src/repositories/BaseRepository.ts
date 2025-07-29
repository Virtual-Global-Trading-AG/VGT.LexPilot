import { Firestore, DocumentData, CollectionReference, DocumentReference } from 'firebase-admin/firestore';
import { firestore } from '../config/container';
import { BaseEntity } from '../models';
import { Logger } from '../utils/logger';

/**
 * Abstract Base Repository implementing Repository Pattern
 * Provides common CRUD operations for all entities
 */
export abstract class BaseRepository<T extends BaseEntity> {
  protected db: Firestore;
  protected collection: string;
  protected logger: Logger;

  constructor(collectionName: string) {
    this.db = firestore;
    this.collection = collectionName;
    this.logger = Logger.getInstance();
  }

  /**
   * Get collection reference
   */
  protected getCollection(): CollectionReference<DocumentData> {
    return this.db.collection(this.collection);
  }

  /**
   * Create a new entity
   */
  async create(item: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const now = new Date();
      
      // Filter out undefined values to prevent Firestore errors
      const filteredItem = Object.fromEntries(
        Object.entries(item).filter(([_, value]) => value !== undefined)
      );

      const entity = {
        ...filteredItem,
        createdAt: now,
        updatedAt: now
      } as T;

      const docRef = await this.getCollection().add(entity);
      
      this.logger.info(`Entity created in ${this.collection}`, {
        entityId: docRef.id,
        collection: this.collection
      });

      return docRef.id;
    } catch (error) {
      this.logger.error(`Failed to create entity in ${this.collection}`, error as Error);
      throw error;
    }
  }

  /**
   * Find entity by ID
   */
  async findById(id: string): Promise<T | null> {
    try {
      const doc = await this.getCollection().doc(id).get();
      
      if (!doc.exists) {
        return null;
      }

      return {
        id: doc.id,
        ...doc.data()
      } as T;
    } catch (error) {
      this.logger.error(`Failed to find entity by ID in ${this.collection}`, error as Error, {
        entityId: id
      });
      throw error;
    }
  }

  /**
   * Update entity by ID
   */
  async update(id: string, updates: Partial<Omit<T, 'id' | 'createdAt'>>): Promise<void> {
    try {
      // Filter out undefined values to prevent Firestore errors
      const filteredUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_, value]) => value !== undefined)
      );

      const updateData = {
        ...filteredUpdates,
        updatedAt: new Date()
      };

      await this.getCollection().doc(id).update(updateData);
      
      this.logger.info(`Entity updated in ${this.collection}`, {
        entityId: id,
        collection: this.collection
      });
    } catch (error) {
      this.logger.error(`Failed to update entity in ${this.collection}`, error as Error, {
        entityId: id
      });
      throw error;
    }
  }

  /**
   * Delete entity by ID
   */
  async delete(id: string): Promise<void> {
    try {
      await this.getCollection().doc(id).delete();
      
      this.logger.info(`Entity deleted from ${this.collection}`, {
        entityId: id,
        collection: this.collection
      });
    } catch (error) {
      this.logger.error(`Failed to delete entity from ${this.collection}`, error as Error, {
        entityId: id
      });
      throw error;
    }
  }

  /**
   * Find entities with pagination
   */
  async findWithPagination(
    limit: number = 10,
    startAfter?: string,
    filters?: Record<string, any>
  ): Promise<{ items: T[]; hasNext: boolean; lastDocId?: string }> {
    try {
      let query = this.getCollection()
        .orderBy('createdAt', 'desc')
        .limit(limit + 1); // +1 to check if there are more items

      // Apply filters
      if (filters) {
        for (const [field, value] of Object.entries(filters)) {
          query = query.where(field, '==', value);
        }
      }

      // Start after specific document for pagination
      if (startAfter) {
        const startDoc = await this.getCollection().doc(startAfter).get();
        if (startDoc.exists) {
          query = query.startAfter(startDoc);
        }
      }

      const snapshot = await query.get();
      const docs = snapshot.docs;
      
      // Check if there are more items
      const hasNext = docs.length > limit;
      const items = docs.slice(0, limit); // Remove the extra item
      
      const result = {
        items: items.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as T)),
        hasNext,
        lastDocId: items.length > 0 ? items[items.length - 1]?.id : undefined
      };

      return result;
    } catch (error) {
      this.logger.error(`Failed to find entities with pagination in ${this.collection}`, error as Error);
      throw error;
    }
  }

  /**
   * Count total entities
   */
  async count(filters?: Record<string, any>): Promise<number> {
    try {
      let query = this.getCollection().select();

      if (filters) {
        for (const [field, value] of Object.entries(filters)) {
          query = query.where(field, '==', value);
        }
      }

      const snapshot = await query.get();
      return snapshot.size;
    } catch (error) {
      this.logger.error(`Failed to count entities in ${this.collection}`, error as Error);
      throw error;
    }
  }

  /**
   * Check if entity exists
   */
  async exists(id: string): Promise<boolean> {
    try {
      const doc = await this.getCollection().doc(id).get();
      return doc.exists;
    } catch (error) {
      this.logger.error(`Failed to check entity existence in ${this.collection}`, error as Error, {
        entityId: id
      });
      throw error;
    }
  }

  /**
   * Batch operations support
   */
  protected getBatch() {
    return this.db.batch();
  }

  /**
   * Transaction support
   */
  protected async runTransaction<R>(updateFunction: (transaction: FirebaseFirestore.Transaction) => Promise<R>): Promise<R> {
    return this.db.runTransaction(updateFunction);
  }
}
