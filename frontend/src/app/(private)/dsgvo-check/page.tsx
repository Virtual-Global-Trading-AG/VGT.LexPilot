
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

export default function DSGVOCheckPage() {
  const [dsgvoText, setDsgvoText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysisResults, setAnalysisResults] = useState('');
  const { completeDSGVOCheck, loading, error } = useDocumentAnalysis();

  const handleTextCheck = async () => {
    if (!dsgvoText.trim()) {
      return;
    }

    setIsLoading(true);
    setAnalysisResults('');

    try {
      const result = await completeDSGVOCheck({
        question: dsgvoText,
        language: 'de',
        includeContext: true,
        maxSources: 10
      });

      console.log('Complete DSGVO check result:', result);

      if (result && result.analysis) {
        // Format the complete analysis result
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

                {analysisResults && (
                  <div className="space-y-2 mt-6">
                    <Label htmlFor="analysis-results">KI-Analyseergebnisse</Label>
                    <Textarea
                      id="analysis-results"
                      rows={20}
                      className="min-h-[400px] bg-slate-50 font-mono text-sm"
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