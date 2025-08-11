import { ChatPromptTemplate } from '@langchain/core/prompts';
import { Document as LangChainDocument } from 'langchain/document';
import { Logger } from '../utils/logger';
import { LLMFactory } from '../factories/LLMFactory';
import { BaseLegalChain } from './BaseChain';
import { RunnableSequence, Runnable } from '@langchain/core/runnables';

export interface ComplianceCheck {
  name: string;
  description: string;
  execute(document: LangChainDocument, regulations: LangChainDocument[]): Promise<ComplianceCheckResult>;
}

export interface ComplianceCheckResult {
  checkName: string;
  status: 'compliant' | 'non_compliant' | 'unclear' | 'not_applicable';
  score: number; // 0-1
  findings: string[];
  recommendations: string[];
  riskLevel: 'low' | 'medium' | 'high';
  evidence: string[];
}

export interface ComplianceReport {
  overallScore: number;
  overallStatus: 'compliant' | 'non_compliant' | 'partial_compliance';
  checkResults: ComplianceCheckResult[];
  criticalIssues: string[];
  prioritizedRecommendations: string[];
  nextSteps: string[];
  generatedAt: string;
}

/**
 * Basis-Klasse für GDPR/DSG Compliance Checks mit LCEL
 */
abstract class BaseComplianceCheck implements ComplianceCheck {
  protected readonly logger = Logger.getInstance();
  protected readonly llmFactory = new LLMFactory();

  abstract name: string;
  abstract description: string;

  abstract execute(document: LangChainDocument, regulations: LangChainDocument[]): Promise<ComplianceCheckResult>;

  protected createComplianceChain(promptTemplate: string): Runnable {
    const prompt = ChatPromptTemplate.fromTemplate(promptTemplate);
    const llm = this.llmFactory.createAnalysisLLM();
    return RunnableSequence.from([prompt, llm]);
  }
}

/**
 * Prüft Datenminimierung nach DSGVO Art. 5 und DSG
 */
class DataMinimizationCheck extends BaseComplianceCheck {
  name = 'Datenminimierung';
  description = 'Prüft ob nur notwendige personenbezogene Daten verarbeitet werden';

  async execute(document: LangChainDocument, regulations: LangChainDocument[]): Promise<ComplianceCheckResult> {
    const chain = this.createComplianceChain(`
Analysiere das Dokument auf Einhaltung des Datenminimierungsgrundsatzes.

DOKUMENT:
{document}

RELEVANTE REGELUNGEN:
{regulations}

Prüfe:
1. Werden nur notwendige Daten verarbeitet?
2. Ist der Zweck klar definiert?
3. Gibt es übermäßige Datensammlung?
4. Sind Aufbewahrungsfristen angemessen?

Antworte im JSON-Format:
{{
  "status": "compliant|non_compliant|unclear|not_applicable",
  "score": 0.8,
  "findings": ["Befund 1", "Befund 2"],
  "recommendations": ["Empfehlung 1"],
  "riskLevel": "low|medium|high",
  "evidence": ["Beleg 1"]
}}
    `);

    const result = await chain.invoke({
      document: document.pageContent,
      regulations: regulations.map(r => r.pageContent).join('\n\n')
    });

    const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    const parsed = JSON.parse(content);
    return {
      checkName: this.name,
      ...parsed
    };
  }
}

/**
 * Prüft Rechtsgrundlage für Datenverarbeitung
 */
class LawfulBasisCheck extends BaseComplianceCheck {
  name = 'Rechtsgrundlage';
  description = 'Prüft ob eine gültige Rechtsgrundlage für Datenverarbeitung vorliegt';

  async execute(document: LangChainDocument, regulations: LangChainDocument[]): Promise<ComplianceCheckResult> {
    const chain = this.createComplianceChain(`
Prüfe die Rechtsgrundlage für Datenverarbeitung nach DSGVO Art. 6 und DSG.

DOKUMENT:
{document}

Prüfe:
1. Ist eine Rechtsgrundlage genannt?
2. Ist die Rechtsgrundlage angemessen?
3. Bei Einwilligung: Ist sie freiwillig, spezifisch, informiert?
4. Bei berechtigtem Interesse: Ist Abwägung dokumentiert?

Antworte im JSON-Format mit status, score, findings, recommendations, riskLevel, evidence.
    `);

    const result = await chain.invoke({
      document: document.pageContent,
      regulations: regulations.map(r => r.pageContent).join('\n\n')
    });

    const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    const parsed = JSON.parse(content);
    return {
      checkName: this.name,
      ...parsed
    };
  }
}

/**
 * Prüft Einwilligungsmechanismen
 */
class ConsentMechanismCheck extends BaseComplianceCheck {
  name = 'Einwilligung';
  description = 'Prüft Einwilligungsmechanismen auf DSGVO-Konformität';

  async execute(document: LangChainDocument, regulations: LangChainDocument[]): Promise<ComplianceCheckResult> {
    const chain = this.createComplianceChain(`
Analysiere Einwilligungsmechanismen nach DSGVO Art. 7.

DOKUMENT:
{document}

Prüfe:
1. Ist Einwilligung eindeutig und freiwillig?
2. Können Nutzer Einwilligung widerrufen?
3. Ist granulare Einwilligung möglich?
4. Sind Opt-in statt Opt-out implementiert?

Bewerte im JSON-Format.
    `);

    const result = await chain.invoke({
      document: document.pageContent,
      regulations: regulations.map(r => r.pageContent).join('\n\n')
    });

    const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    const parsed = JSON.parse(content);
    return {
      checkName: this.name,
      ...parsed
    };
  }
}

/**
 * Prüft Betroffenenrechte
 */
class DataSubjectRightsCheck extends BaseComplianceCheck {
  name = 'Betroffenenrechte';
  description = 'Prüft Umsetzung der Betroffenenrechte nach DSGVO';

  async execute(document: LangChainDocument, regulations: LangChainDocument[]): Promise<ComplianceCheckResult> {
    const chain = this.createComplianceChain(`
Prüfe Umsetzung der Betroffenenrechte (DSGVO Art. 15-22).

DOKUMENT:
{document}

Prüfe ob folgende Rechte implementiert sind:
1. Auskunftsrecht (Art. 15)
2. Berichtigungsrecht (Art. 16)
3. Löschungsrecht (Art. 17)
4. Recht auf Datenübertragbarkeit (Art. 20)
5. Widerspruchsrecht (Art. 21)

Bewerte im JSON-Format.
    `);

    const result = await chain.invoke({
      document: document.pageContent,
      regulations: regulations.map(r => r.pageContent).join('\n\n')
    });

    const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    const parsed = JSON.parse(content);
    return {
      checkName: this.name,
      ...parsed
    };
  }
}

/**
 * GDPR/DSG Compliance Chain mit Multi-Stage Validation und LCEL
 */
export class GDPRComplianceChain extends BaseLegalChain {
  readonly logger = Logger.getInstance();
  private readonly complianceChecks: ComplianceCheck[];

  constructor() {
    super();
    this.complianceChecks = [
      new DataMinimizationCheck(),
      new LawfulBasisCheck(),
      new ConsentMechanismCheck(),
      new DataSubjectRightsCheck()
    ];
  }

  /**
   * Führt umfassende GDPR/DSG Compliance-Prüfung durch
   */
  async analyze(document: LangChainDocument): Promise<ComplianceReport> {
    try {
      this.logger.info('Starting GDPR compliance analysis', {
        documentLength: document.pageContent.length,
        checksCount: this.complianceChecks.length
      });

      // 1. Lade relevante Regulationen (in Produktion aus Vector Store)
      const relevantRegulations = await this.getRelevantRegulations(document);

      // 2. Führe alle Compliance Checks parallel aus
      const checkResults = await Promise.all(
        this.complianceChecks.map(async (check) => {
          try {
            this.logger.info(`Executing compliance check: ${check.name}`);
            return await check.execute(document, relevantRegulations);
          } catch (error) {
            this.logger.error(`Compliance check failed: ${check.name}`, error instanceof Error ? error : new Error(String(error)));
            return {
              checkName: check.name,
              status: 'unclear' as const,
              score: 0,
              findings: [`Fehler bei der Ausführung: ${error instanceof Error ? error.message : String(error)}`],
              recommendations: ['Manuelle Überprüfung erforderlich'],
              riskLevel: 'high' as const,
              evidence: []
            };
          }
        })
      );

      // 3. Aggregiere Ergebnisse
      const report = this.aggregateComplianceResults(checkResults);

      this.logger.info('GDPR compliance analysis completed', {
        overallScore: report.overallScore,
        overallStatus: report.overallStatus,
        criticalIssuesCount: report.criticalIssues.length
      });

      return report;

    } catch (error) {
      this.logger.error('GDPR compliance analysis failed', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Lädt relevante Regulationen (Mock - in Produktion aus Vector Store)
   */
  private async getRelevantRegulations(document: LangChainDocument): Promise<LangChainDocument[]> {
    // Mock implementation - in Produktion würde hier der Vector Store abgefragt
    return [
      new LangChainDocument({
        pageContent: `DSGVO Art. 5 (Grundsätze für die Verarbeitung personenbezogener Daten):
        Personenbezogene Daten müssen auf rechtmäßige Weise, nach Treu und Glauben und in einer für die betroffene Person nachvollziehbaren Weise verarbeitet werden („Rechtmäßigkeit, Verarbeitung nach Treu und Glauben, Transparenz");`,
        metadata: { source: 'DSGVO', article: '5' }
      }),
      new LangChainDocument({
        pageContent: `DSG Art. 6 (Grundsätze):
        Personendaten müssen rechtmäßig bearbeitet werden. Ihre Bearbeitung hat nach Treu und Glauben und verhältnismäßig zu erfolgen.`,
        metadata: { source: 'DSG', article: '6' }
      })
    ];
  }

  /**
   * Aggregiert die Ergebnisse aller Compliance Checks
   */
  private aggregateComplianceResults(checkResults: ComplianceCheckResult[]): ComplianceReport {
    // Berechne Overall Score (gewichteter Durchschnitt)
    const weights = {
      'Datenminimierung': 0.25,
      'Rechtsgrundlage': 0.35,
      'Einwilligung': 0.25,
      'Betroffenenrechte': 0.15
    };

    const overallScore = checkResults.reduce((sum, result) => {
      const weight = weights[result.checkName as keyof typeof weights] || 0.1;
      return sum + (result.score * weight);
    }, 0);

    // Bestimme Overall Status
    const highRiskChecks = checkResults.filter(r => r.riskLevel === 'high');
    const nonCompliantChecks = checkResults.filter(r => r.status === 'non_compliant');

    let overallStatus: 'compliant' | 'non_compliant' | 'partial_compliance';
    if (highRiskChecks.length > 0 || nonCompliantChecks.length > 2) {
      overallStatus = 'non_compliant';
    } else if (nonCompliantChecks.length > 0) {
      overallStatus = 'partial_compliance';
    } else {
      overallStatus = 'compliant';
    }

    // Sammle kritische Probleme
    const criticalIssues = checkResults
    .filter(r => r.riskLevel === 'high')
    .flatMap(r => r.findings);

    // Priorisiere Empfehlungen
    const prioritizedRecommendations = this.prioritizeRecommendations(checkResults);

    // Bestimme nächste Schritte
    const nextSteps = this.determineNextSteps(overallStatus, criticalIssues);

    return {
      overallScore: Math.round(overallScore * 100) / 100,
      overallStatus,
      checkResults,
      criticalIssues,
      prioritizedRecommendations,
      nextSteps,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Priorisiert Empfehlungen nach Risiko und Aufwand
   */
  private prioritizeRecommendations(checkResults: ComplianceCheckResult[]): string[] {
    const allRecommendations = checkResults.flatMap(result =>
      result.recommendations.map(rec => ({
        recommendation: rec,
        riskLevel: result.riskLevel,
        checkName: result.checkName
      }))
    );

    // Sortiere nach Risiko (high > medium > low)
    const priorityOrder = { high: 3, medium: 2, low: 1 };

    return allRecommendations
    .sort((a, b) => priorityOrder[b.riskLevel] - priorityOrder[a.riskLevel])
    .map(item => `[${item.checkName}] ${item.recommendation}`)
    .slice(0, 10); // Top 10 Empfehlungen
  }

  /**
   * Bestimmt nächste Schritte basierend auf Compliance Status
   */
  private determineNextSteps(status: string, criticalIssues: string[]): string[] {
    const steps: string[] = [];

    if (status === 'non_compliant') {
      steps.push('Sofortige Überprüfung und Korrektur kritischer Compliance-Probleme');
      steps.push('Rechtsberatung konsultieren');
      if (criticalIssues.length > 0) {
        steps.push('Priorität auf Behebung kritischer Probleme legen');
      }
    }

    if (status === 'partial_compliance') {
      steps.push('Schrittweise Verbesserung der Compliance-Maßnahmen');
      steps.push('Interne Compliance-Schulungen durchführen');
    }

    if (status === 'compliant') {
      steps.push('Regelmäßige Compliance-Überprüfungen einrichten');
      steps.push('Dokumentation auf dem neuesten Stand halten');
    }

    steps.push('Nächste Überprüfung in 6 Monaten oder bei Änderungen');

    return steps;
  }
}