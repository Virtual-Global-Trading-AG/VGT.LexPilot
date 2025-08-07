import { ChatPromptTemplate } from '@langchain/core/prompts';
import { Runnable, RunnableSequence } from '@langchain/core/runnables';
import { Document as LangChainDocument } from 'langchain/document';
import { z } from 'zod';
import { LLMFactory } from '../factories/LLMFactory';
import { Logger } from '../utils/logger';
import { BaseLegalChain } from './BaseChain';

// Zod Schemas für strukturierte Ausgaben
const IssueSchema = z.object({
  issue: z.string().describe('Die identifizierte Rechtsfrage'),
  severity: z.enum(['high', 'medium', 'low']).describe('Schweregrad der Rechtsfrage'),
  legalArea: z.string().describe('Rechtsbereich (z.B. Vertragsrecht, Arbeitsrecht)'),
  description: z.string().describe('Detaillierte Beschreibung der Rechtsfrage'),
  potentialConsequences: z.array(z.string()).describe('Mögliche rechtliche Konsequenzen')
});

const RuleSchema = z.object({
  lawReference: z.string().describe('Gesetzesreferenz (z.B. OR Art. 123)'),
  legalText: z.string().describe('Relevanter Gesetzestext'),
  interpretation: z.string().describe('Juristische Interpretation'),
  precedents: z.array(z.string()).optional().describe('Relevante Präzedenzfälle')
});

const ApplicationSchema = z.object({
  factPattern: z.string().describe('Relevanter Sachverhalt'),
  legalAnalysis: z.string().describe('Rechtliche Würdigung'),
  riskAssessment: z.string().describe('Risikobewertung'),
  recommendedActions: z.array(z.string()).describe('Empfohlene Maßnahmen')
});

const ConclusionSchema = z.object({
  overallAssessment: z.string().describe('Gesamtbeurteilung'),
  complianceStatus: z.enum(['compliant', 'non_compliant', 'unclear', 'requires_review']),
  criticalIssues: z.array(z.string()).describe('Kritische Problempunkte'),
  recommendations: z.array(z.string()).describe('Konkrete Handlungsempfehlungen'),
  confidenceLevel: z.number().min(0).max(1).describe('Vertrauenswert der Analyse')
});

export const ContractAnalysisResultSchema = z.object({
  issues: z.array(IssueSchema),
  rules: z.array(RuleSchema),
  application: ApplicationSchema,
  conclusion: ConclusionSchema,
  metadata: z.object({
    analysisDate: z.string(),
    jurisdiction: z.string(),
    contractType: z.string(),
    processingTimeMs: z.number()
  })
});

export type ContractAnalysisResult = z.infer<typeof ContractAnalysisResultSchema>;

/**
 * Subject für Observer Pattern zur Fortschritts-Updates
 */
export class AnalysisSubject {
  private observers: Array<(progress: { step: string; progress: number; data?: any }) => void> = [];

  addObserver(observer: (progress: { step: string; progress: number; data?: any }) => void): void {
    this.observers.push(observer);
  }

  removeObserver(observer: (progress: { step: string; progress: number; data?: any }) => void): void {
    this.observers = this.observers.filter(obs => obs !== observer);
  }

  notify(progress: { step: string; progress: number; data?: any }): void {
    this.observers.forEach(observer => observer(progress));
  }
}

/**
 * Contract Analysis Chain implementiert die IRAC Methodology mit LCEL
 * (Issue, Rule, Application, Conclusion)
 */
export class ContractAnalysisChain extends BaseLegalChain {
  readonly logger = Logger.getInstance();
  private readonly llmFactory = new LLMFactory();
  private readonly chains: {
    issue: Runnable;
    rule: Runnable;
    application: Runnable;
    conclusion: Runnable;
  };

  constructor() {
    super();
    this.chains = this.setupChains();
  }

  /**
   * Initialisiert die verschiedenen Analyse-Chains mit LCEL
   */
  private setupChains() {
    const analysisLLM = this.llmFactory.createAnalysisLLM();
    const validationLLM = this.llmFactory.createValidationLLM();

    // Issue Identification Chain mit LCEL
    const issuePrompt = ChatPromptTemplate.fromTemplate(`
Als Schweizer Rechtsexperte identifiziere die rechtlichen Hauptfragen in diesem Vertrag.

VERTRAG:
{contract}

VERTRAGSTYP: {contractType}
JURISDIKTION: {jurisdiction}

Analysiere systematisch und antworte im JSON-Format:
{{
  "mainIssues": [
    {{
      "issue": "Beschreibung der Rechtsfrage",
      "severity": "high|medium|low",
      "legalArea": "Rechtsbereich",
      "description": "Detaillierte Beschreibung",
      "potentialConsequences": ["Konsequenz 1"]
    }}
  ],
  "missingClauses": ["Fehlende Klausel"],
  "ambiguities": ["Mehrdeutigkeit"]
}}
    `);

    const issueChain = RunnableSequence.from([issuePrompt, analysisLLM]);

    // Rule Application Chain mit LCEL
    const rulePrompt = ChatPromptTemplate.fromTemplate(`
Wende relevante Schweizer Gesetze auf die Rechtsfragen an.

RECHTSFRAGEN:
{issues}

Analysiere nach Schweizer Recht und antworte im JSON-Format:
{{
  "applicableLaws": [
    {{
      "lawReference": "OR Art. 123",
      "legalText": "Gesetzestext",
      "interpretation": "Interpretation",
      "precedents": ["BGE 123 III 456"]
    }}
  ],
  "legalPrinciples": ["Grundsatz 1"],
  "jurisdictionSpecifics": "Schweizer Besonderheiten"
}}
    `);

    const ruleChain = RunnableSequence.from([rulePrompt, analysisLLM]);

    // Application Chain mit LCEL
    const applicationPrompt = ChatPromptTemplate.fromTemplate(`
Wende die Rechtsregeln auf den Sachverhalt an.

RECHTSFRAGEN: {issues}
REGELN: {rules}
VERTRAG: {contract}

Antworte im JSON-Format:
{{
  "factPattern": "Relevanter Sachverhalt",
  "legalAnalysis": "Rechtliche Würdigung",
  "riskAssessment": "Risikobewertung",
  "recommendedActions": ["Maßnahme 1"]
}}
    `);

    const applicationChain = RunnableSequence.from([applicationPrompt, analysisLLM]);

    // Conclusion Chain mit LCEL
    const conclusionPrompt = ChatPromptTemplate.fromTemplate(`
Erstelle die Schlussfolgerung der IRAC-Analyse.

RECHTSFRAGEN: {issues}
REGELN: {rules}
ANWENDUNG: {application}

Antworte im JSON-Format:
{{
  "overallAssessment": "Gesamtbeurteilung",
  "complianceStatus": "compliant|non_compliant|unclear|requires_review",
  "criticalIssues": ["Kritischer Punkt"],
  "recommendations": ["Empfehlung"],
  "confidenceLevel": 0.8
}}
    `);

    const conclusionChain = RunnableSequence.from([conclusionPrompt, validationLLM]);

    return {
      issue: issueChain,
      rule: ruleChain,
      application: applicationChain,
      conclusion: conclusionChain
    };
  }

  /**
   * Hauptanalyse-Methode - implementiert vollständige IRAC-Methodology mit LCEL
   */
  async analyze(document: LangChainDocument): Promise<ContractAnalysisResult> {
    const startTime = Date.now();
    const analysisSubject = new AnalysisSubject();

    try {
      this.logger.info('Starting contract analysis', {
        documentLength: document.pageContent.length,
        contractType: document.metadata.type,
        jurisdiction: document.metadata.jurisdiction || 'CH'
      });

      // Issue Identification (20% Progress)
      analysisSubject.notify({ step: 'issue_identification', progress: 20 });
      this.logger.info('Starting issue identification phase');

      const issuesResult = await this.chains.issue.invoke({
        contract: document.pageContent,
        contractType: document.metadata.type || 'Allgemeiner Vertrag',
        jurisdiction: document.metadata.jurisdiction || 'CH'
      });

      // Rule Application (40% Progress)
      analysisSubject.notify({ step: 'rule_application', progress: 40 });
      this.logger.info('Starting rule application phase');

      const rulesResult = await this.chains.rule.invoke({
        issues: typeof issuesResult.content === 'string' ? issuesResult.content : JSON.stringify(issuesResult.content)
      });

      // Application to Facts (60% Progress)
      analysisSubject.notify({ step: 'fact_application', progress: 60 });
      this.logger.info('Starting fact application phase');

      const applicationResult = await this.chains.application.invoke({
        issues: typeof issuesResult.content === 'string' ? issuesResult.content : JSON.stringify(issuesResult.content),
        rules: typeof rulesResult.content === 'string' ? rulesResult.content : JSON.stringify(rulesResult.content),
        contract: document.pageContent
      });

      // Conclusion & Recommendations (80% Progress)
      analysisSubject.notify({ step: 'conclusion', progress: 80 });
      this.logger.info('Starting conclusion phase');

      const conclusionResult = await this.chains.conclusion.invoke({
        issues: typeof issuesResult.content === 'string' ? issuesResult.content : JSON.stringify(issuesResult.content),
        rules: typeof rulesResult.content === 'string' ? rulesResult.content : JSON.stringify(rulesResult.content),
        application: typeof applicationResult.content === 'string' ? applicationResult.content : JSON.stringify(applicationResult.content)
      });

      // Parse JSON responses
      const parsedIssues = JSON.parse(typeof issuesResult.content === 'string' ? issuesResult.content : JSON.stringify(issuesResult.content));
      const parsedRules = JSON.parse(typeof rulesResult.content === 'string' ? rulesResult.content : JSON.stringify(rulesResult.content));
      const parsedApplication = JSON.parse(typeof applicationResult.content === 'string' ? applicationResult.content : JSON.stringify(applicationResult.content));
      const parsedConclusion = JSON.parse(typeof conclusionResult.content === 'string' ? conclusionResult.content : JSON.stringify(conclusionResult.content));

      // Validation (95% Progress)
      analysisSubject.notify({ step: 'validation', progress: 95 });
      const validatedResult = await this.validateOutput({
        issues: parsedIssues.mainIssues || [],
        rules: parsedRules.applicableLaws || [],
        application: parsedApplication,
        conclusion: parsedConclusion
      });

      // Final Result Assembly
      const processingTime = Date.now() - startTime;
      const finalResult: ContractAnalysisResult = {
        issues: validatedResult.issues,
        rules: validatedResult.rules,
        application: validatedResult.application,
        conclusion: validatedResult.conclusion,
        metadata: {
          analysisDate: new Date().toISOString(),
          jurisdiction: document.metadata.jurisdiction || 'CH',
          contractType: document.metadata.type || 'Allgemeiner Vertrag',
          processingTimeMs: processingTime
        }
      };

      analysisSubject.notify({ step: 'completed', progress: 100 });

      this.logger.info('Contract analysis completed', {
        processingTimeMs: processingTime,
        issueCount: finalResult.issues.length,
        ruleCount: finalResult.rules.length,
        complianceStatus: finalResult.conclusion.complianceStatus,
        confidenceLevel: finalResult.conclusion.confidenceLevel
      });

      return finalResult;

    } catch (error) {
      this.logger.error('Error during contract analysis', error instanceof Error ? error : new Error(String(error)), {
        step: 'analysis_error',
        documentLength: document.pageContent.length,
        processingTimeMs: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Validiert die Ausgabe der verschiedenen Analyse-Phasen
   */
  private async validateOutput(results: {
    issues: any[];
    rules: any[];
    application: any;
    conclusion: any;
  }): Promise<{
    issues: z.infer<typeof IssueSchema>[];
    rules: z.infer<typeof RuleSchema>[];
    application: z.infer<typeof ApplicationSchema>;
    conclusion: z.infer<typeof ConclusionSchema>;
  }> {
    try {
      // Validiere Issues
      const validatedIssues = results.issues.map(issue => IssueSchema.parse(issue));

      // Validiere Rules
      const validatedRules = results.rules.map(rule => RuleSchema.parse(rule));

      // Validiere Application
      const validatedApplication = ApplicationSchema.parse(results.application);

      // Validiere Conclusion
      const validatedConclusion = ConclusionSchema.parse(results.conclusion);

      // Plausibilitätsprüfungen
      if (validatedIssues.length === 0) {
        this.logger.warn('No issues identified - unusual for contract analysis');
      }

      if (validatedConclusion.confidenceLevel > 0.9 && validatedIssues.some(i => i.severity === 'high')) {
        this.logger.warn('High confidence despite high-severity issues - review recommended');
      }

      return {
        issues: validatedIssues,
        rules: validatedRules,
        application: validatedApplication,
        conclusion: validatedConclusion
      };

    } catch (validationError) {
      this.logger.error('Validation failed', validationError instanceof Error ? validationError : new Error(String(validationError)));
      throw new Error(`Analysis validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}`);
    }
  }

  /**
   * Analysiert spezifische Vertragsklauseln mit LCEL
   */
  async analyzeSpecificClause(
    clauseText: string,
    clauseType: string,
    contractContext: string
  ): Promise<{
    riskLevel: 'low' | 'medium' | 'high';
    issues: string[];
    recommendations: string[];
  }> {
    const clauseAnalysisPrompt = ChatPromptTemplate.fromTemplate(`
Analysiere diese spezifische Vertragsklausel im Kontext des Schweizer Rechts:

KLAUSEL:
{clauseText}

KLAUSELTYP: {clauseType}
VERTRAGSKONTEXT: {contractContext}

Bewerte:
1. Rechtliche Wirksamkeit nach Schweizer Recht
2. Potenzielle Risiken und Probleme  
3. Verbesserungsvorschläge
4. Compliance mit relevanten Gesetzen

Antworte im JSON-Format.
    `);

    const llm = this.llmFactory.createAnalysisLLM();
    const clauseChain = RunnableSequence.from([clauseAnalysisPrompt, llm]);

    const result = await clauseChain.invoke({
      clauseText,
      clauseType,
      contractContext
    });

    // Parse und validiere das Ergebnis
    const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    return JSON.parse(content);
  }
}