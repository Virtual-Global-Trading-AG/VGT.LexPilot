import { Logger } from '../utils/logger';

/**
 * Base Observer für Chain-Implementierungen
 * Implementiert grundlegende Observer-Pattern Funktionalität
 */
export abstract class BaseObserver {
  readonly logger = Logger.getInstance();
  private observers: Array<(data: any) => void> = [];

  /**
   * Fügt einen Observer hinzu
   */
  addObserver(observer: (data: any) => void): void {
    this.observers.push(observer);
  }

  /**
   * Entfernt einen Observer
   */
  removeObserver(observer: (data: any) => void): void {
    this.observers = this.observers.filter(obs => obs !== observer);
  }

  /**
   * Benachrichtigt alle Observer
   */
  protected notify(data: any): void {
    this.observers.forEach(observer => {
      try {
        observer(data);
      } catch (error) {
        this.logger.error('Observer notification failed', error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
}

/**
 * Base Chain Klasse für alle LangChain-basierten Analyse-Chains
 */
export abstract class BaseLegalChain extends BaseObserver {
  protected abstract analyze(document: any): Promise<any>;

  /**
   * Validiert Input-Parameter
   */
  protected validateInput(document: any): boolean {
    if (!document) {
      this.logger.error('Document is required for analysis');
      return false;
    }

    if (!document.pageContent || document.pageContent.trim().length === 0) {
      this.logger.error('Document content is empty');
      return false;
    }

    return true;
  }

  /**
   * Hilfsmethode für Error Handling
   */
  protected handleError(error: unknown, context: string): never {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.logger.error(`Error in ${context}`, error instanceof Error ? error : new Error(String(error)));
    throw new Error(`${context} failed: ${errorMessage}`);
  }
}
