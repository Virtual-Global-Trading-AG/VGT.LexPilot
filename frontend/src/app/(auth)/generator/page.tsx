import MainLayout from '@/components/layouts/main-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Briefcase,
  Shield,
  Calendar,
  Zap,
  BookOpen,
} from 'lucide-react';

const contractTemplates = [
  {
    id: 'nda',
    title: 'Geheimhaltungsvereinbarung (NDA)',
    description: 'Standardvorlage für Geheimhaltungsvereinbarungen',
    category: 'Geschäft',
    icon: Shield,
    selected: true,
  },
  {
    id: 'employment',
    title: 'Arbeitsvertrag',
    description: 'Standardvorlage für Arbeitsverträge',
    category: 'Personal',
    icon: Briefcase,
    selected: false,
  },
  {
    id: 'terms',
    title: 'Allgemeine Geschäftsbedingungen',
    description: 'AGB-Vorlage für Online-Shops und Dienstleister',
    category: 'E-Commerce',
    icon: BookOpen,
    selected: false,
  },
];

export default function GeneratorPage() {
  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Generator</h1>
            <p className="text-muted-foreground">
              Erstellen Sie rechtssichere Verträge mit KI-Unterstützung
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Template Selection */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <FileText className="h-5 w-5" />
                  <span>Vorlagen auswählen</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {contractTemplates.map((template) => {
                  const Icon = template.icon;
                  return (
                    <div
                      key={template.id}
                      className={`cursor-pointer rounded-lg border-2 p-4 transition-all hover:border-primary ${
                        template.selected
                          ? 'border-primary bg-primary/5'
                          : 'border-border'
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        <Icon className="h-6 w-6 text-primary shrink-0" />
                        <div className="flex-1">
                          <h3 className="font-medium text-foreground">
                            {template.title}
                          </h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            {template.description}
                          </p>
                          <Badge variant="secondary" className="mt-2 text-xs">
                            {template.category}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* Contract Form */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Shield className="h-5 w-5" />
                  <span>Geheimhaltungsvereinbarung (NDA)</span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Füllen Sie die Felder aus, um Ihren personalisierten Vertrag zu erstellen
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Parties Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Partei 1 (Unternehmen)</h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="company1">Unternehmen</Label>
                      <Input
                        id="company1"
                        placeholder="Unternehmen"
                        defaultValue="Unternehmen"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address1">Adresse</Label>
                      <Input
                        id="address1"
                        placeholder="Vollständige Adresse"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Partei 2 (Empfänger)</h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="company2">Unternehmen/Person</Label>
                      <Input
                        id="company2"
                        placeholder="Partei 2 (Empfänger)"
                        defaultValue="Partei 2 (Empfänger)"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address2">Adresse</Label>
                      <Input
                        id="address2"
                        placeholder="Vollständige Adresse"
                      />
                    </div>
                  </div>
                </div>

                {/* Contract Details */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Vertragsdetails</h3>
                  
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="duration">Laufzeit (Jahre)</Label>
                      <Select defaultValue="2">
                        <SelectTrigger>
                          <SelectValue placeholder="Laufzeit wählen" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 Jahr</SelectItem>
                          <SelectItem value="2">2 Jahre</SelectItem>
                          <SelectItem value="3">3 Jahre</SelectItem>
                          <SelectItem value="5">5 Jahre</SelectItem>
                          <SelectItem value="unbegrenzt">Unbegrenzt</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="law">Anwendbares Recht</Label>
                      <Select defaultValue="schweiz">
                        <SelectTrigger>
                          <SelectValue placeholder="Rechtsordnung wählen" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="schweiz">Schweizer Recht</SelectItem>
                          <SelectItem value="deutschland">Deutsches Recht</SelectItem>
                          <SelectItem value="oesterreich">Österreichisches Recht</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scope">Gegenstand der Geheimhaltung</Label>
                    <Textarea
                      id="scope"
                      placeholder="Beschreiben Sie, welche Informationen vertraulich behandelt werden sollen..."
                      rows={4}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="restrictions">Haftungsbeschränkung</Label>
                    <Select defaultValue="standard">
                      <SelectTrigger>
                        <SelectValue placeholder="Haftungsbeschränkung wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="keine">Keine Beschränkung</SelectItem>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="erweitert">Erweitert</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="probationPeriod">Probezeit (Monate)</Label>
                    <Select defaultValue="3">
                      <SelectTrigger>
                        <SelectValue placeholder="Probezeit wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 Monat</SelectItem>
                        <SelectItem value="2">2 Monate</SelectItem>
                        <SelectItem value="3">3 Monate</SelectItem>
                        <SelectItem value="6">6 Monate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-4 pt-4">
                  <Button className="flex-1" size="lg">
                    <Zap className="mr-2 h-4 w-4" />
                    Vertrag generieren
                  </Button>
                  <Button variant="outline" size="lg">
                    Als Vorlage speichern
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
