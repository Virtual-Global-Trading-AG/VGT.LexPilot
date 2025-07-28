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
  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">DSGVO-Check</h1>
            <p className="text-muted-foreground">
              Überprüfen Sie Texte auf DSGVO-Konformität mit KI-Unterstützung
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
                  <span>DSGVO-Echtzeit-Check</span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Text zur Überprüfung eingeben:
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="dsgvo-text">Text eingeben</Label>
                  <Textarea
                    id="dsgvo-text"
                    placeholder="Fügen Sie hier den Text ein, den Sie auf DSGVO-Konformität prüfen möchten..."
                    rows={10}
                    className="min-h-[200px]"
                  />
                </div>
                <Button className="w-full" size="lg">
                  <Zap className="mr-2 h-4 w-4" />
                  Text prüfen
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Results Section */}
          <div className="space-y-6">
            {/* Overall Score */}
            <Card>
              <CardHeader>
                <CardTitle>Compliance-Bewertung</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Gesamtbewertung</span>
                    <span className="text-lg font-bold">72%</span>
                  </div>
                  <Progress value={72} className="h-3" />
                  <p className="text-sm text-muted-foreground">
                    Ihr Text zeigt <span className="font-medium text-yellow-600">teilweise Konformität</span> mit der DSGVO.
                    Einige Bereiche benötigen Aufmerksamkeit.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Compliance Checks */}
            <Card>
              <CardHeader>
                <CardTitle>Detaillierte Prüfung</CardTitle>
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

            {/* Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle>Empfohlene Maßnahmen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start space-x-3 p-3 rounded-lg bg-red-50 border border-red-200">
                  <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800">Rechtsgrundlage präzisieren</p>
                    <p className="text-sm text-red-600">
                      Die Rechtsgrundlage für die Datenverarbeitung sollte klarer definiert werden.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                  <Info className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800">Einwilligungsmechanismus verbessern</p>
                    <p className="text-sm text-yellow-600">
                      Implementieren Sie granulare Einwilligungsoptionen für verschiedene Datenverarbeitungszwecke.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 rounded-lg bg-green-50 border border-green-200">
                  <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-800">Betroffenenrechte gut implementiert</p>
                    <p className="text-sm text-green-600">
                      Die Umsetzung der Betroffenenrechte entspricht den DSGVO-Anforderungen.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
