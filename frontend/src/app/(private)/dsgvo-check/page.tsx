
'use client';

import MainLayout from '@/components/layouts/main-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Shield,
  CheckCircle,
  AlertTriangle,
  XCircle,
  FileText,
  Zap,
  Info,
  Building,
  Scale,
  Target,
  BookOpen,
} from 'lucide-react';
import { useState } from 'react';
import { useDocumentAnalysis } from '@/lib/hooks/useApi';

const complianceChecks = [
  {
    id: 'data-minimization',
    title: 'Datenminimierung',
    description: 'Prüft ob nur notwendige personenbezogene Daten verarbeitet werden',
    status: 'compliant',
    score: 85,
  },
  {
    id: 'lawful-basis',
    title: 'Rechtsgrundlage',
    description: 'Überprüft ob eine gültige Rechtsgrundlage für Datenverarbeitung vorliegt',
    status: 'non-compliant',
    score: 45,
  },
  {
    id: 'consent',
    title: 'Einwilligung',
    description: 'Analysiert Einwilligungsmechanismen auf DSGVO-Konformität',
    status: 'partial',
    score: 70,
  },
  {
    id: 'data-subject-rights',
    title: 'Betroffenenrechte',
    description: 'Prüft Umsetzung der Betroffenenrechte nach DSGVO',
    status: 'compliant',
    score: 90,
  },
];

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'compliant':
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case 'non-compliant':
      return <XCircle className="h-5 w-5 text-red-500" />;
    case 'partial':
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    default:
      return <Info className="h-5 w-5 text-gray-500" />;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'compliant':
      return <Badge variant="secondary" className="bg-green-100 text-green-800">Konform</Badge>;
    case 'non-compliant':
      return <Badge variant="destructive">Nicht konform</Badge>;
    case 'partial':
      return <Badge variant="default" className="bg-yellow-100 text-yellow-800">Teilweise konform</Badge>;
    default:
      return <Badge variant="outline">Unbekannt</Badge>;
  }
};

const getScoreColor = (score: number) => {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
};

// Define interfaces for the analysis results
interface Source {
  content: string;
  metadata?: {
    source?: string;
  };
}

interface AnalysisResult {
  analysis: string;
  legalBasis?: string; // 🏛️ Rechtliche Grundlage (DSG Schweiz)
  swissLawAnswer?: string; // ✅ Antwort basierend auf Schweizer Recht
  legalAssessment?: string; // ⚖️ Rechtliche Bewertung
  recommendations?: string; // 🎯 Konkrete Empfehlungen
  importantNotes?: string; // ⚠️ Wichtige Hinweise
  references?: string; // 📚 Referenzen
  foundSources?: {
    count: number;
    sources: Source[];
  };
  searchQueries?: string[];
  processingSteps?: Record<string, string>;
  timestamp?: string;
}

export default function DSGVOCheckPage() {
  const [dsgvoText, setDsgvoText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysisResults, setAnalysisResults] = useState('');
  const [parsedResults, setParsedResults] = useState<AnalysisResult | null>(null);
  const { completeDSGVOCheck, loading, error } = useDocumentAnalysis();

  const handleTextCheck = async () => {
    if (!dsgvoText.trim()) {
      return;
    }

    setIsLoading(true);
    setAnalysisResults('');
    setParsedResults(null);

    try {
      const result = await completeDSGVOCheck({
        question: dsgvoText,
        language: 'de',
        includeContext: true,
        maxSources: 10
      });

      console.log('Complete DSGVO check result:', result);

      if (result && result.analysis) {
        // Parse the analysis text into sections if they're not already provided
        const parsedResult = { ...result } as AnalysisResult;

        // If the specific sections are not provided but the analysis contains section markers,
        // try to parse them from the analysis text
        if (!parsedResult.legalBasis && !parsedResult.swissLawAnswer && 
            !parsedResult.legalAssessment && !parsedResult.recommendations && 
            !parsedResult.importantNotes && !parsedResult.references) {

          const analysis = parsedResult.analysis;

          // Extract sections using regex patterns
          // Use more flexible regex patterns to match the sections
          const legalBasisMatch = analysis.match(/## 🏛️\s*Rechtliche\s*Grundlage.*?(?=\n\s*##\s*(?:✅|⚖️|🎯|⚠️|📚)|$)/s) || 
                                  analysis.match(/🏛️\s*Rechtliche\s*Grundlage.*?(?=\n\s*(?:##\s*)?(?:✅|⚖️|🎯|⚠️|📚)|$)/s);

          const swissLawMatch = analysis.match(/## ✅\s*Antwort\s*basierend\s*auf\s*Schweizer\s*Recht.*?(?=\n\s*##\s*(?:🏛️|⚖️|🎯|⚠️|📚)|$)/s) || 
                               analysis.match(/✅\s*Antwort\s*basierend\s*auf\s*Schweizer\s*Recht.*?(?=\n\s*(?:##\s*)?(?:🏛️|⚖️|🎯|⚠️|📚)|$)/s);

          const legalAssessmentMatch = analysis.match(/## ⚖️\s*Rechtliche\s*Bewertung.*?(?=\n\s*##\s*(?:🏛️|✅|🎯|⚠️|📚)|$)/s) || 
                                      analysis.match(/⚖️\s*Rechtliche\s*Bewertung.*?(?=\n\s*(?:##\s*)?(?:🏛️|✅|🎯|⚠️|📚)|$)/s);

          const recommendationsMatch = analysis.match(/## 🎯\s*Konkrete\s*Empfehlungen.*?(?=\n\s*##\s*(?:🏛️|✅|⚖️|⚠️|📚)|$)/s) || 
                                      analysis.match(/🎯\s*Konkrete\s*Empfehlungen.*?(?=\n\s*(?:##\s*)?(?:🏛️|✅|⚖️|⚠️|📚)|$)/s);

          const importantNotesMatch = analysis.match(/## ⚠️\s*Wichtige\s*Hinweise.*?(?=\n\s*##\s*(?:🏛️|✅|⚖️|🎯|📚)|$)/s) || 
                                     analysis.match(/⚠️\s*Wichtige\s*Hinweise.*?(?=\n\s*(?:##\s*)?(?:🏛️|✅|⚖️|🎯|📚)|$)/s);

          const referencesMatch = analysis.match(/## 📚\s*Referenzen.*?(?=\n\s*##\s*(?:🏛️|✅|⚖️|🎯|⚠️)|$)/s) || 
                                 analysis.match(/📚\s*Referenzen.*?(?=\n\s*(?:##\s*)?(?:🏛️|✅|⚖️|🎯|⚠️)|$)/s);

          // Log the extracted sections for debugging
          console.log('Extracted sections:', {
            legalBasis: legalBasisMatch ? legalBasisMatch[0] : null,
            swissLaw: swissLawMatch ? swissLawMatch[0] : null,
            legalAssessment: legalAssessmentMatch ? legalAssessmentMatch[0] : null,
            recommendations: recommendationsMatch ? recommendationsMatch[0] : null,
            importantNotes: importantNotesMatch ? importantNotesMatch[0] : null,
            references: referencesMatch ? referencesMatch[0] : null
          });

          // Helper function to clean up section content
          const cleanSectionContent = (content: string, sectionTitle: string) => {
            // Remove the section header (both with and without ##)
            let cleaned = content.replace(new RegExp(`^##\\s*${sectionTitle}.*?\\n`, 's'), '');
            cleaned = cleaned.replace(new RegExp(`^${sectionTitle}.*?\\n`, 's'), '');
            return cleaned.trim();
          };

          // Assign extracted sections to the parsed result
          if (legalBasisMatch) {
            parsedResult.legalBasis = cleanSectionContent(legalBasisMatch[0], "🏛️\\s*Rechtliche\\s*Grundlage");
          }

          if (swissLawMatch) {
            parsedResult.swissLawAnswer = cleanSectionContent(swissLawMatch[0], "✅\\s*Antwort\\s*basierend\\s*auf\\s*Schweizer\\s*Recht");
          }

          if (legalAssessmentMatch) {
            parsedResult.legalAssessment = cleanSectionContent(legalAssessmentMatch[0], "⚖️\\s*Rechtliche\\s*Bewertung");
          }

          if (recommendationsMatch) {
            parsedResult.recommendations = cleanSectionContent(recommendationsMatch[0], "🎯\\s*Konkrete\\s*Empfehlungen");
          }

          if (importantNotesMatch) {
            parsedResult.importantNotes = cleanSectionContent(importantNotesMatch[0], "⚠️\\s*Wichtige\\s*Hinweise");
          }

          if (referencesMatch) {
            parsedResult.references = cleanSectionContent(referencesMatch[0], "📚\\s*Referenzen");
          }
        }

        // Store the parsed results
        setParsedResults(parsedResult);

        // Keep the old format for backward compatibility
        let formattedResults = `## DSGVO-Analyse\n\n`;
        formattedResults += `${result.analysis}\n\n`;

        if (result.foundSources && result.foundSources.count > 0) {
          formattedResults += `## Verwendete Quellen (${result.foundSources.count})\n\n`;
          result.foundSources.sources.forEach((source: any, index: number) => {
            formattedResults += `${index + 1}. ${source.content}\n`;
            if (source.metadata?.source) {
              formattedResults += `   Quelle: ${source.metadata.source}\n`;
            }
            formattedResults += `\n`;
          });
        }

        if (result.searchQueries && result.searchQueries.length > 0) {
          formattedResults += `## Verwendete Suchbegriffe\n\n`;
          result.searchQueries.forEach((query: string, index: number) => {
            formattedResults += `- ${query}\n`;
          });
          formattedResults += `\n`;
        }

        if (result.processingSteps) {
          formattedResults += `## Verarbeitungsschritte\n\n`;
          Object.entries(result.processingSteps).forEach(([key, value]) => {
            formattedResults += `- ${value}\n`;
          });
          formattedResults += `\n`;
        }

        if (result.timestamp) {
          formattedResults += `---\n*Analyse durchgeführt am: ${new Date(result.timestamp).toLocaleString('de-DE')}*`;
        }

        setAnalysisResults(formattedResults);
      } else {
        setAnalysisResults('Keine Analyseergebnisse erhalten. Bitte versuchen Sie es erneut.');
      }
    } catch (err) {
      console.error('Error during complete DSGVO check:', err);
      setAnalysisResults('Fehler bei der DSGVO-Analyse. Bitte versuchen Sie es erneut.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">DSGVO-Check</h1>
            <p className="text-muted-foreground">
              Stellen Sie Ihre Datenschutzfrage und erhalten Sie eine KI-gestützte DSGVO-Analyse
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Input Section */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Shield className="h-5 w-5" />
                  <span>DSGVO-Fragen-Assistent</span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Stellen Sie eine konkrete Frage zur DSGVO-Konformität:
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="dsgvo-text">Ihre DSGVO-Frage</Label>
                  <Textarea
                    id="dsgvo-text"
                    placeholder="Beispiel: 'Darf ich E-Mail-Adressen von Kunden für Marketing-Zwecke verwenden?' oder 'Welche Rechte haben Betroffene bei der Löschung ihrer Daten?'"
                    rows={6}
                    className="min-h-[120px]"
                    value={dsgvoText}
                    onChange={(e) => setDsgvoText(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Stellen Sie eine spezifische Frage zur DSGVO-Konformität (max. 5.000 Zeichen)
                  </p>
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleTextCheck}
                  disabled={isLoading || loading || !dsgvoText.trim() || dsgvoText.length < 10}
                >
                  <Zap className="mr-2 h-4 w-4" />
                  {isLoading || loading ? 'KI-Analyse läuft...' : 'DSGVO-Analyse starten'}
                </Button>

                {error && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {parsedResults && (
                  <div className="space-y-4 mt-6">
                    <Label>KI-Analyseergebnisse</Label>

                    {/* Main Analysis - Only show if no specific sections are available */}
                    {(!parsedResults.legalBasis && !parsedResults.swissLawAnswer && 
                      !parsedResults.legalAssessment && !parsedResults.recommendations && 
                      !parsedResults.importantNotes && !parsedResults.references) && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center">
                            <FileText className="h-5 w-5 mr-2" />
                            DSGVO-Analyse
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="whitespace-pre-wrap text-sm">
                            {parsedResults.analysis}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Rechtliche Grundlage */}
                    {parsedResults.legalBasis && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center">
                            <Building className="h-5 w-5 mr-2" />
                            Rechtliche Grundlage (DSG Schweiz)
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="whitespace-pre-wrap text-sm">
                            {parsedResults.legalBasis.replace(/^## 🏛️\s*Rechtliche\s*Grundlage.*?\n/s, '').replace(/^🏛️\s*Rechtliche\s*Grundlage.*?\n/s, '')}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Combined Antwort basierend auf Schweizer Recht and Rechtliche Bewertung */}
                    {parsedResults.swissLawAnswer && parsedResults.legalAssessment && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center justify-between">
                            <div className="flex items-center">
                              <Scale className="h-5 w-5 mr-2" />
                              Rechtliche Bewertung
                            </div>
                            {parsedResults.legalAssessment.includes("**Status:** KONFORM") ? (
                              <Badge variant="secondary" className="bg-green-100 text-green-800">KONFORM</Badge>
                            ) : parsedResults.legalAssessment.includes("**Status:** NICHT KONFORM") ? (
                              <Badge variant="destructive">NICHT KONFORM</Badge>
                            ) : parsedResults.legalAssessment.includes("**Status:** TEILWEISE KONFORM") ? (
                              <Badge variant="default" className="bg-yellow-100 text-yellow-800">TEILWEISE KONFORM</Badge>
                            ) : (
                              <Badge variant="outline">UNBEKANNT</Badge>
                            )}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="whitespace-pre-wrap text-sm mb-4">
                            {parsedResults.swissLawAnswer.replace(/^## ✅\s*Antwort\s*basierend\s*auf\s*Schweizer\s*Recht.*?\n/s, '').replace(/^✅\s*Antwort\s*basierend\s*auf\s*Schweizer\s*Recht.*?\n/s, '')}
                          </div>
                          <div className="whitespace-pre-wrap text-sm">
                            {parsedResults.legalAssessment
                              .replace(/^## ⚖️\s*Rechtliche\s*Bewertung.*?\n/s, '')
                              .replace(/^⚖️\s*Rechtliche\s*Bewertung.*?\n/s, '')
                              .replace(/\*\*Status:\*\*.*?\n\n/s, '')
                              .replace(/\*\*Begründung:\*\*\s*/s, '')}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Antwort basierend auf Schweizer Recht (only shown if legalAssessment is not available) */}
                    {parsedResults.swissLawAnswer && !parsedResults.legalAssessment && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center">
                            <CheckCircle className="h-5 w-5 mr-2" />
                            Antwort basierend auf Schweizer Recht
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="whitespace-pre-wrap text-sm">
                            {parsedResults.swissLawAnswer.replace(/^## ✅\s*Antwort\s*basierend\s*auf\s*Schweizer\s*Recht.*?\n/s, '').replace(/^✅\s*Antwort\s*basierend\s*auf\s*Schweizer\s*Recht.*?\n/s, '')}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Rechtliche Bewertung (only shown if swissLawAnswer is not available) */}
                    {parsedResults.legalAssessment && !parsedResults.swissLawAnswer && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center justify-between">
                            <div className="flex items-center">
                              <Scale className="h-5 w-5 mr-2" />
                              Rechtliche Bewertung
                            </div>
                            {parsedResults.legalAssessment.includes("**Status:** KONFORM") ? (
                              <Badge variant="secondary" className="bg-green-100 text-green-800">KONFORM</Badge>
                            ) : parsedResults.legalAssessment.includes("**Status:** NICHT KONFORM") ? (
                              <Badge variant="destructive">NICHT KONFORM</Badge>
                            ) : parsedResults.legalAssessment.includes("**Status:** TEILWEISE KONFORM") ? (
                              <Badge variant="default" className="bg-yellow-100 text-yellow-800">TEILWEISE KONFORM</Badge>
                            ) : (
                              <Badge variant="outline">UNBEKANNT</Badge>
                            )}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="whitespace-pre-wrap text-sm">
                            {parsedResults.legalAssessment
                              .replace(/^## ⚖️\s*Rechtliche\s*Bewertung.*?\n/s, '')
                              .replace(/^⚖️\s*Rechtliche\s*Bewertung.*?\n/s, '')
                              .replace(/\*\*Status:\*\*.*?\n\n/s, '')
                              .replace(/\*\*Begründung:\*\*\s*/s, '')}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Konkrete Empfehlungen */}
                    {parsedResults.recommendations && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center">
                            <Target className="h-5 w-5 mr-2" />
                            Konkrete Empfehlungen
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="whitespace-pre-wrap text-sm">
                            {parsedResults.recommendations.replace(/^## 🎯\s*Konkrete\s*Empfehlungen.*?\n/s, '').replace(/^🎯\s*Konkrete\s*Empfehlungen.*?\n/s, '')}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Wichtige Hinweise */}
                    {parsedResults.importantNotes && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center">
                            <AlertTriangle className="h-5 w-5 mr-2" />
                            Wichtige Hinweise
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="whitespace-pre-wrap text-sm">
                            {parsedResults.importantNotes.replace(/^## ⚠️\s*Wichtige\s*Hinweise.*?\n/s, '').replace(/^⚠️\s*Wichtige\s*Hinweise.*?\n/s, '')}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Referenzen */}
                    {parsedResults.references && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center">
                            <BookOpen className="h-5 w-5 mr-2" />
                            Referenzen
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="whitespace-pre-wrap text-sm">
                            {parsedResults.references.replace(/^## 📚\s*Referenzen.*?\n/s, '').replace(/^📚\s*Referenzen.*?\n/s, '')}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Sources */}
                    {parsedResults.foundSources && parsedResults.foundSources.count > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center">
                            <Info className="h-5 w-5 mr-2" />
                            Verwendete Quellen ({parsedResults.foundSources.count})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {parsedResults.foundSources.sources.map((source, index) => (
                              <div key={index} className="p-3 bg-slate-50 rounded-md">
                                <p className="text-sm font-medium mb-1">Quelle {index + 1}</p>
                                <p className="text-sm">{source.content}</p>
                                {source.metadata?.source && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Quelle: {source.metadata.source}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Search Queries */}
                    {parsedResults.searchQueries && parsedResults.searchQueries.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center">
                            <Zap className="h-5 w-5 mr-2" />
                            Verwendete Suchbegriffe
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {parsedResults.searchQueries.map((query, index) => (
                              <Badge key={index} variant="secondary" className="text-sm">
                                {query}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Processing Steps */}
                    {parsedResults.processingSteps && Object.keys(parsedResults.processingSteps).length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center">
                            <CheckCircle className="h-5 w-5 mr-2" />
                            Verarbeitungsschritte
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-2">
                            {Object.entries(parsedResults.processingSteps).map(([key, value], index) => (
                              <li key={index} className="flex items-start">
                                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-sky-100 flex items-center justify-center text-xs font-medium text-sky-600 mr-2">
                                  {index + 1}
                                </div>
                                <span className="text-sm">{value}</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}

                    {/* Timestamp */}
                    {parsedResults.timestamp && (
                      <p className="text-xs text-muted-foreground text-right">
                        Analyse durchgeführt am: {new Date(parsedResults.timestamp).toLocaleString('de-DE')}
                      </p>
                    )}
                  </div>
                )}

                {/* Keep the old textarea for debugging or if needed */}
                {false && analysisResults && (
                  <div className="space-y-2 mt-6">
                    <Label htmlFor="analysis-results">Rohdaten (Debug)</Label>
                    <Textarea
                      id="analysis-results"
                      rows={10}
                      className="min-h-[200px] bg-slate-50 font-mono text-xs"
                      value={analysisResults}
                      readOnly
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Results Section */}
          <div className="space-y-6">
            {/* Information Card */}
            <Card>
              <CardHeader>
                <CardTitle>Wie funktioniert die KI-Analyse?</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-600">1</div>
                    <div>
                      <p className="text-sm font-medium">Frage analysieren</p>
                      <p className="text-xs text-muted-foreground">Die KI generiert passende Suchbegriffe für Ihre Frage</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-600">2</div>
                    <div>
                      <p className="text-sm font-medium">Relevante DSGVO-Artikel finden</p>
                      <p className="text-xs text-muted-foreground">Suche in der Schweizer DSGVO-Datenbank nach passenden Bestimmungen</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-600">3</div>
                    <div>
                      <p className="text-sm font-medium">Detaillierte Analyse erstellen</p>
                      <p className="text-xs text-muted-foreground">KI erstellt eine strukturierte Antwort mit Compliance-Bewertung</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Compliance Checks (Static for now - can be made dynamic later) */}
            <Card>
              <CardHeader>
                <CardTitle>Häufige DSGVO-Prüfbereiche</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {complianceChecks.map((check) => (
                  <div
                    key={check.id}
                    className="flex items-start space-x-3 rounded-lg border p-4"
                  >
                    <div className="flex-shrink-0">
                      {getStatusIcon(check.status)}
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-foreground">{check.title}</h4>
                        {getStatusBadge(check.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {check.description}
                      </p>
                      <div className="flex items-center space-x-2">
                        <div className="flex-1">
                          <div className={`h-2 rounded-full ${getScoreColor(check.score)}`}
                               style={{ width: `${check.score}%` }} />
                        </div>
                        <span className="text-sm font-medium">{check.score}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Example Questions */}
            <Card>
              <CardHeader>
                <CardTitle>Beispielfragen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <button
                  onClick={() => setDsgvoText('Darf ich E-Mail-Adressen von Kunden für Marketing-Zwecke verwenden?')}
                  className="w-full text-left p-2 rounded border hover:bg-gray-50 text-sm"
                >
                  💼 Marketing mit Kundendaten
                </button>
                <button
                  onClick={() => setDsgvoText('Welche Rechte haben Betroffene bei der Löschung ihrer Daten?')}
                  className="w-full text-left p-2 rounded border hover:bg-gray-50 text-sm"
                >
                  🗑️ Recht auf Löschung
                </button>
                <button
                  onClick={() => setDsgvoText('Wie lange darf ich Mitarbeiterdaten nach Kündigung speichern?')}
                  className="w-full text-left p-2 rounded border hover:bg-gray-50 text-sm"
                >
                  👥 Mitarbeiterdaten-Speicherung
                </button>
                <button
                  onClick={() => setDsgvoText('Welche Informationspflichten habe ich bei der Datenerhebung?')}
                  className="w-full text-left p-2 rounded border hover:bg-gray-50 text-sm"
                >
                  📋 Informationspflichten
                </button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
