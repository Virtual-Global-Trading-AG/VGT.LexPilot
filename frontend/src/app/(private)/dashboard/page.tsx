import MainLayout from '@/components/layouts/main-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import IndexLawButton from '../../../components/admin/IndexLawButton';
import {
  FileText,
  AlertTriangle,
  Clock,
  DollarSign,
  Upload,
  TrendingUp,
  Calendar,
  CheckCircle,
} from 'lucide-react';

const recentActivities = [
  {
    id: '1',
    type: 'high-risk',
    title: 'Hochrisiko-Klausel erkannt',
    subtitle: 'Arbeitsvertrag_Schmidt_AG.pdf',
    time: 'vor 2 Stunden',
    icon: AlertTriangle,
    iconColor: 'text-red-500',
  },
  {
    id: '2',
    type: 'completed',
    title: 'Analyse abgeschlossen',
    subtitle: 'NDA_Startup_Kooperation.pdf',
    time: 'gestern',
    icon: CheckCircle,
    iconColor: 'text-green-500',
  },
  {
    id: '3',
    type: 'uploaded',
    title: 'Neuer Vertrag hochgeladen',
    subtitle: 'AGB_Webshop_2025.pdf',
    time: 'vor 3 Tagen',
    icon: Upload,
    iconColor: 'text-blue-500',
  },
];

export default function DashboardPage() {
  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">
              Überblick über Ihre Rechtsanalysen und Aktivitäten
            </p>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline">
              <Calendar className="mr-2 h-4 w-4" />
              Bericht erstellen
            </Button>
            <Button>
              <Upload className="mr-2 h-4 w-4" />
              Vertrag hochladen
            </Button>
            <IndexLawButton />
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Aktive Verträge
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">23</div>
              <p className="text-xs text-muted-foreground">
                <span className="text-green-600">+12%</span> vs. letzter Monat
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Hohe Risiken
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">3</div>
              <p className="text-xs text-red-600">
                Sofortige Aufmerksamkeit
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Fällige Fristen
              </CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">2</div>
              <p className="text-xs text-orange-600">
                innerhalb 30 Tage
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Monatliche Einsparungen
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">CHF 15,200</div>
              <p className="text-xs text-muted-foreground">
                <span className="text-green-600">+8%</span> vs. letzter Monat
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Call to Action */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold text-white">
                      Neuen Vertrag prüfen lassen
                    </h2>
                    <p className="text-blue-100">
                      Laden Sie einen Vertrag hoch und erhalten Sie sofort eine KI-basierte Risikoanalyse.
                    </p>
                  </div>
                  <Button variant="secondary" size="lg">
                    <Upload className="mr-2 h-4 w-4" />
                    Vertrag hochladen
                  </Button>
                </div>
              </div>
            </CardContent>
            <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 -z-10" />
          </Card>

          {/* Recent Activities */}
          <Card>
            <CardHeader>
              <CardTitle>Letzte Aktivitäten</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {recentActivities.map((activity) => {
                const Icon = activity.icon;
                return (
                  <div key={activity.id} className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <Icon className={`h-5 w-5 ${activity.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {activity.title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {activity.subtitle}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {activity.time}
                      </p>
                    </div>
                    {activity.type === 'high-risk' && (
                      <Badge variant="destructive" className="text-xs">
                        Details
                      </Badge>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Progress Section */}
        <Card>
          <CardHeader>
            <CardTitle>Analysefortschritt</CardTitle>
            <p className="text-sm text-muted-foreground">
              Aktuelle Verarbeitungen und deren Status
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Arbeitsvertrag_Schmidt_AG.pdf</span>
                <span className="text-sm text-muted-foreground">Analysiert</span>
              </div>
              <Progress value={100} className="h-2" />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">NDA_Startup_Kooperation.pdf</span>
                <span className="text-sm text-muted-foreground">Analysiert</span>
              </div>
              <Progress value={100} className="h-2" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">AGB_Webshop_2025.pdf</span>
                <span className="text-sm text-muted-foreground">Analysiert</span>
              </div>
              <Progress value={100} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
