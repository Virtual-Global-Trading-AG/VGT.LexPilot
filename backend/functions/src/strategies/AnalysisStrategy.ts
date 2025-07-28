import { Document, AnalysisResult, AnalysisType } from '../models';
import { Logger } from '../utils/logger';

/**
 * Strategy Pattern Interface for Analysis
 */
export interface IAnalysisStrategy {
  analyze(document: Document): Promise<AnalysisResult>;
  validateResult(result: AnalysisResult): boolean;
  getAnalysisType(): AnalysisType;
}

/**
 * Abstract Base Strategy for Analysis
 */
export abstract class BaseAnalysisStrategy implements IAnalysisStrategy {
  protected logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  abstract analyze(document: Document): Promise<AnalysisResult>;
  abstract getAnalysisType(): AnalysisType;

  /**
   * Default result validation
   */
  validateResult(result: AnalysisResult): boolean {
    try {
      // Basic validation
      if (!result.summary || result.summary.length === 0) {
        this.logger.warn('Analysis result missing summary');
        return false;
      }

      if (!Array.isArray(result.findings)) {
        this.logger.warn('Analysis result findings is not an array');
        return false;
      }

      if (!Array.isArray(result.recommendations)) {
        this.logger.warn('Analysis result recommendations is not an array');
        return false;
      }

      if (typeof result.riskScore !== 'number' || 
          result.riskScore < 0 || 
          result.riskScore > 1) {
        this.logger.warn('Analysis result has invalid risk score', {
          riskScore: result.riskScore
        });
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Error validating analysis result', error as Error);
      return false;
    }
  }

  /**
   * Calculate confidence score based on various factors
   */
  protected calculateConfidence(
    document: Document,
    result: AnalysisResult
  ): number {
    let confidence = 0.5; // Base confidence

    // Document quality factors
    const textLength = document.content.rawText.length;
    if (textLength > 1000) confidence += 0.1;
    if (textLength > 5000) confidence += 0.1;

    // Language detection confidence
    if (document.language !== 'auto') confidence += 0.1;

    // Structured data availability
    if (document.content.structuredData) confidence += 0.1;

    // Analysis result factors
    if (result.findings.length > 0) confidence += 0.1;
    if (result.recommendations.length > 0) confidence += 0.1;

    // Ensure confidence is between 0 and 1
    return Math.min(Math.max(confidence, 0), 1);
  }

  /**
   * Extract key terms from document text
   */
  protected extractKeyTerms(text: string): string[] {
    // Simple implementation - can be enhanced with NLP libraries
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);

    // Get word frequency
    const frequency: Record<string, number> = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

    // Return most frequent terms
    return Object.entries(frequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([word]) => word);
  }
}

/**
 * GDPR Compliance Analysis Strategy
 */
export class GDPRComplianceStrategy extends BaseAnalysisStrategy {
  getAnalysisType(): AnalysisType {
    return AnalysisType.GDPR_COMPLIANCE;
  }

  async analyze(document: Document): Promise<AnalysisResult> {
    this.logger.info('Starting GDPR compliance analysis', {
      documentId: document.id,
      documentType: document.type
    });

    try {
      const text = document.content.rawText;
      const findings = await this.analyzeGDPRCompliance(text);
      const recommendations = await this.generateGDPRRecommendations(findings);
      const complianceScore = this.calculateComplianceScore(findings);

      const result: AnalysisResult = {
        summary: this.generateGDPRSummary(findings, complianceScore),
        findings,
        recommendations,
        riskScore: 1 - complianceScore, // Higher compliance = lower risk
        complianceScore,
        detailedReport: {
          analysisType: 'gdpr_compliance',
          keyTerms: this.extractKeyTerms(text),
          complianceAreas: this.identifyComplianceAreas(text),
          timestamp: new Date()
        }
      };

      this.logger.info('GDPR compliance analysis completed', {
        documentId: document.id,
        complianceScore,
        findingsCount: findings.length,
        recommendationsCount: recommendations.length
      });

      return result;
    } catch (error) {
      this.logger.error('GDPR compliance analysis failed', error as Error, {
        documentId: document.id
      });
      throw error;
    }
  }

  private async analyzeGDPRCompliance(text: string): Promise<any[]> {
    const findings: any[] = [];

    // Check for essential GDPR elements
    const gdprChecks = [
      {
        pattern: /data\s+(protection|privacy|processing)/i,
        type: 'data_processing',
        severity: 'medium',
        title: 'Data Processing Mentioned'
      },
      {
        pattern: /consent/i,
        type: 'consent',
        severity: 'high',
        title: 'Consent Mechanism'
      },
      {
        pattern: /right\s+to\s+(access|delete|portability|rectification)/i,
        type: 'data_subject_rights',
        severity: 'high',
        title: 'Data Subject Rights'
      },
      {
        pattern: /data\s+controller/i,
        type: 'controller',
        severity: 'medium',
        title: 'Data Controller Identification'
      },
      {
        pattern: /lawful\s+basis/i,
        type: 'lawful_basis',
        severity: 'critical',
        title: 'Lawful Basis for Processing'
      }
    ];

    gdprChecks.forEach((check, index) => {
      const matches = text.match(check.pattern);
      if (matches) {
        findings.push({
          id: `gdpr_${index}`,
          type: check.type,
          severity: check.severity,
          title: check.title,
          description: `Found reference to ${check.title.toLowerCase()}`,
          location: {
            startIndex: text.indexOf(matches[0]),
            endIndex: text.indexOf(matches[0]) + matches[0].length
          },
          evidence: [matches[0]]
        });
      } else if (check.severity === 'critical') {
        // Missing critical elements
        findings.push({
          id: `gdpr_missing_${index}`,
          type: 'missing_element',
          severity: 'critical',
          title: `Missing: ${check.title}`,
          description: `No reference found for required GDPR element: ${check.title.toLowerCase()}`,
          location: { startIndex: 0, endIndex: 0 },
          evidence: []
        });
      }
    });

    return findings;
  }

  private async generateGDPRRecommendations(findings: any[]): Promise<any[]> {
    const recommendations: any[] = [];

    // Generate recommendations based on findings
    const missingElements = findings.filter(f => f.type === 'missing_element');
    
    if (missingElements.length > 0) {
      recommendations.push({
        id: 'gdpr_rec_1',
        type: 'add_clause',
        priority: 'high',
        title: 'Add Missing GDPR Elements',
        description: 'Several required GDPR elements are missing from this document',
        suggestedAction: 'Add clauses covering lawful basis, data subject rights, and consent mechanisms',
        estimatedEffort: '2-4 hours'
      });
    }

    if (findings.some(f => f.type === 'consent' && f.severity === 'high')) {
      recommendations.push({
        id: 'gdpr_rec_2',
        type: 'clarify_terms',
        priority: 'medium',
        title: 'Enhance Consent Mechanism',
        description: 'Ensure consent mechanisms are clear, specific, and freely given',
        suggestedAction: 'Review and enhance consent language for GDPR compliance',
        estimatedEffort: '1-2 hours'
      });
    }

    return recommendations;
  }

  private calculateComplianceScore(findings: any[]): number {
    const totalChecks = 5; // Number of GDPR checks
    const criticalIssues = findings.filter(f => f.severity === 'critical').length;
    const highIssues = findings.filter(f => f.severity === 'high').length;
    const mediumIssues = findings.filter(f => f.severity === 'medium').length;

    // Scoring: critical = -0.3, high = -0.2, medium = -0.1
    const penalty = (criticalIssues * 0.3) + (highIssues * 0.2) + (mediumIssues * 0.1);
    const score = Math.max(0, 1 - penalty);

    return score;
  }

  private generateGDPRSummary(findings: any[], complianceScore: number): string {
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;

    if (complianceScore >= 0.8) {
      return `Das Dokument zeigt gute GDPR-Compliance (${Math.round(complianceScore * 100)}%). ${findings.length} Punkte identifiziert.`;
    } else if (complianceScore >= 0.6) {
      return `Moderate GDPR-Compliance (${Math.round(complianceScore * 100)}%). ${criticalCount} kritische und ${highCount} wichtige Probleme gefunden.`;
    } else {
      return `Niedrige GDPR-Compliance (${Math.round(complianceScore * 100)}%). Wesentliche Verbesserungen erforderlich.`;
    }
  }

  private identifyComplianceAreas(text: string): string[] {
    const areas: string[] = [];
    
    if (/consent/i.test(text)) areas.push('Consent Management');
    if (/data\s+subject\s+rights/i.test(text)) areas.push('Data Subject Rights');
    if (/data\s+protection/i.test(text)) areas.push('Data Protection');
    if (/lawful\s+basis/i.test(text)) areas.push('Lawful Basis');
    if (/data\s+controller/i.test(text)) areas.push('Controller Responsibilities');

    return areas;
  }
}

/**
 * Contract Risk Analysis Strategy
 */
export class ContractRiskStrategy extends BaseAnalysisStrategy {
  getAnalysisType(): AnalysisType {
    return AnalysisType.CONTRACT_RISK;
  }

  async analyze(document: Document): Promise<AnalysisResult> {
    this.logger.info('Starting contract risk analysis', {
      documentId: document.id,
      documentType: document.type
    });

    try {
      const text = document.content.rawText;
      const findings = await this.analyzeContractRisks(text);
      const recommendations = await this.generateRiskRecommendations(findings);
      const riskScore = this.calculateRiskScore(findings);

      const result: AnalysisResult = {
        summary: this.generateRiskSummary(findings, riskScore),
        findings,
        recommendations,
        riskScore,
        detailedReport: {
          analysisType: 'contract_risk',
          keyTerms: this.extractKeyTerms(text),
          riskAreas: this.identifyRiskAreas(text),
          timestamp: new Date()
        }
      };

      this.logger.info('Contract risk analysis completed', {
        documentId: document.id,
        riskScore,
        findingsCount: findings.length,
        recommendationsCount: recommendations.length
      });

      return result;
    } catch (error) {
      this.logger.error('Contract risk analysis failed', error as Error, {
        documentId: document.id
      });
      throw error;
    }
  }

  private async analyzeContractRisks(text: string): Promise<any[]> {
    const findings: any[] = [];

    const riskChecks = [
      {
        pattern: /unlimited\s+liability/i,
        type: 'liability_risk',
        severity: 'critical',
        title: 'Unlimited Liability'
      },
      {
        pattern: /without\s+notice/i,
        type: 'termination_risk',
        severity: 'high',
        title: 'Termination Without Notice'
      },
      {
        pattern: /automatic\s+renewal/i,
        type: 'renewal_risk',
        severity: 'medium',
        title: 'Automatic Renewal Clause'
      },
      {
        pattern: /penalty|liquidated\s+damages/i,
        type: 'penalty_risk',
        severity: 'high',
        title: 'Penalty Clauses'
      },
      {
        pattern: /indemnification|indemnify/i,
        type: 'indemnity_risk',
        severity: 'high',
        title: 'Indemnification Clauses'
      }
    ];

    riskChecks.forEach((check, index) => {
      const matches = text.match(check.pattern);
      if (matches) {
        findings.push({
          id: `risk_${index}`,
          type: check.type,
          severity: check.severity,
          title: check.title,
          description: `Potentially risky clause found: ${check.title.toLowerCase()}`,
          location: {
            startIndex: text.indexOf(matches[0]),
            endIndex: text.indexOf(matches[0]) + matches[0].length
          },
          evidence: [matches[0]]
        });
      }
    });

    return findings;
  }

  private async generateRiskRecommendations(findings: any[]): Promise<any[]> {
    const recommendations: any[] = [];

    const criticalFindings = findings.filter(f => f.severity === 'critical');
    if (criticalFindings.length > 0) {
      recommendations.push({
        id: 'risk_rec_1',
        type: 'risk_mitigation',
        priority: 'urgent',
        title: 'Address Critical Risk Factors',
        description: 'Critical risk factors identified that require immediate attention',
        suggestedAction: 'Review and modify high-risk clauses before signing',
        estimatedEffort: '3-5 hours'
      });
    }

    const highRiskFindings = findings.filter(f => f.severity === 'high');
    if (highRiskFindings.length > 0) {
      recommendations.push({
        id: 'risk_rec_2',
        type: 'modify_clause',
        priority: 'high',
        title: 'Negotiate High-Risk Terms',
        description: 'Several high-risk terms should be negotiated',
        suggestedAction: 'Propose modifications to reduce exposure',
        estimatedEffort: '2-3 hours'
      });
    }

    return recommendations;
  }

  private calculateRiskScore(findings: any[]): number {
    const criticalIssues = findings.filter(f => f.severity === 'critical').length;
    const highIssues = findings.filter(f => f.severity === 'high').length;
    const mediumIssues = findings.filter(f => f.severity === 'medium').length;

    // Scoring: critical = +0.4, high = +0.2, medium = +0.1
    const riskScore = (criticalIssues * 0.4) + (highIssues * 0.2) + (mediumIssues * 0.1);
    
    return Math.min(1, riskScore);
  }

  private generateRiskSummary(findings: any[], riskScore: number): string {
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;

    if (riskScore <= 0.2) {
      return `Niedriges Risiko (${Math.round(riskScore * 100)}%). Der Vertrag erscheint weitgehend ausgewogen.`;
    } else if (riskScore <= 0.5) {
      return `Moderates Risiko (${Math.round(riskScore * 100)}%). ${highCount} wichtige Risikofaktoren identifiziert.`;
    } else {
      return `Hohes Risiko (${Math.round(riskScore * 100)}%). ${criticalCount} kritische und ${highCount} wichtige Risiken gefunden.`;
    }
  }

  private identifyRiskAreas(text: string): string[] {
    const areas: string[] = [];
    
    if (/liability/i.test(text)) areas.push('Liability');
    if (/termination/i.test(text)) areas.push('Termination');
    if (/penalty|damages/i.test(text)) areas.push('Penalties');
    if (/indemnification/i.test(text)) areas.push('Indemnification');
    if (/warranty|guarantee/i.test(text)) areas.push('Warranties');

    return areas;
  }
}

/**
 * Strategy Context for managing different analysis strategies
 */
export class AnalysisContext {
  private strategy: IAnalysisStrategy;
  private logger = Logger.getInstance();

  constructor(strategy: IAnalysisStrategy) {
    this.strategy = strategy;
  }

  setStrategy(strategy: IAnalysisStrategy): void {
    this.strategy = strategy;
    this.logger.info('Analysis strategy changed', {
      analysisType: strategy.getAnalysisType()
    });
  }

  async executeAnalysis(document: Document): Promise<AnalysisResult> {
    this.logger.info('Executing analysis with strategy', {
      documentId: document.id,
      analysisType: this.strategy.getAnalysisType()
    });

    const result = await this.strategy.analyze(document);
    
    if (!this.strategy.validateResult(result)) {
      throw new Error('Analysis result validation failed');
    }

    return result;
  }
}

/**
 * Strategy Factory for creating analysis strategies
 */
export class AnalysisStrategyFactory {
  static createStrategy(analysisType: AnalysisType): IAnalysisStrategy {
    switch (analysisType) {
      case AnalysisType.GDPR_COMPLIANCE:
        return new GDPRComplianceStrategy();
      
      case AnalysisType.CONTRACT_RISK:
        return new ContractRiskStrategy();
      
      default:
        throw new Error(`Unsupported analysis type: ${analysisType}`);
    }
  }
}
