'use client';

import MainLayout from '@/components/layouts/main-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useDashboard } from '@/lib/hooks/useApi';
import { useAuthStore } from '@/lib/stores/authStore';
import {
  FileText,
  AlertTriangle,
  Clock,
  DollarSign,
  Upload,
  TrendingUp,
  Calendar,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { useEffect, useState } from 'react';

// Icon mapping for activities
const iconMap: { [key: string]: any } = {
  AlertTriangle,
  CheckCircle,
  Upload,
};

function DashboardContent() {
  const { getDashboardStats, getRecentActivities, getAnalysisProgress, loading, error } = useDashboard();
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [analysisProgress, setAnalysisProgress] = useState<any[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [progressLoading, setProgressLoading] = useState(true);

  // Load dashboard data
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        // Load stats
        const statsResult = await getDashboardStats();
        if (statsResult.success && statsResult.data) {
          setDashboardStats(statsResult.data);
        }
        setStatsLoading(false);

        // Load activities
        const activitiesResult = await getRecentActivities(6);
        if (activitiesResult.success && activitiesResult.data) {
          setRecentActivities(activitiesResult.data.activities || []);
        }
        setActivitiesLoading(false);

        // Load progress
        const progressResult = await getAnalysisProgress();
        if (progressResult.success && progressResult.data) {
          setAnalysisProgress(progressResult.data.progressItems || []);
        }
        setProgressLoading(false);
      } catch (error) {
        console.error('Error loading dashboard data:', error);
        setStatsLoading(false);
        setActivitiesLoading(false);
        setProgressLoading(false);
      }
    };

    loadDashboardData();
  }, [getDashboardStats, getRecentActivities, getAnalysisProgress]);

  return (
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
            {statsLoading ? (
              <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Lädt...</span>
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {dashboardStats?.activeContracts?.count || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-600">+{dashboardStats?.activeContracts?.growth || 0}%</span> vs. letzter Monat
                </p>
              </>
            )}
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
            {statsLoading ? (
              <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Lädt...</span>
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {dashboardStats?.highRisks?.count || 0}
                </div>
                <p className="text-xs text-red-600">
                  Sofortige Aufmerksamkeit
                </p>
              </>
            )}
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
            {statsLoading ? (
              <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Lädt...</span>
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {dashboardStats?.dueDates?.count || 0}
                </div>
                <p className="text-xs text-orange-600">
                  innerhalb 30 Tage
                </p>
              </>
            )}
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
            {statsLoading ? (
              <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Lädt...</span>
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {dashboardStats?.monthlySavings?.currency} {dashboardStats?.monthlySavings?.amount?.toLocaleString() || '0'}
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-600">+{dashboardStats?.monthlySavings?.growth || 0}%</span> vs. letzter Monat
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Call to Action */}
        <Card className="relative">
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
            {activitiesLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2 text-sm text-muted-foreground">Lädt Aktivitäten...</span>
              </div>
            ) : recentActivities.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">Keine aktuellen Aktivitäten</p>
              </div>
            ) : (
              recentActivities.map((activity) => {
                const IconComponent = iconMap[activity.icon] || FileText;
                return (
                  <div key={activity.id} className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <IconComponent className={`h-5 w-5 ${activity.iconColor}`} />
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
              })
            )}
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
          {progressLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2 text-sm text-muted-foreground">Lädt Fortschritt...</span>
            </div>
          ) : analysisProgress.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">Keine aktiven Analysen</p>
            </div>
          ) : (
            analysisProgress.map((item) => (
              <div key={item.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{item.fileName}</span>
                  <span className="text-sm text-muted-foreground">{item.status}</span>
                </div>
                <Progress value={item.progress} className="h-2" />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  const { userProfile } = useAuthStore();

  // Only show dashboard for regular users, not lawyers
  if (userProfile?.role === 'lawyer') {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">Anwalt Dashboard</h1>
            <p className="text-muted-foreground">
              Als Anwalt verwenden Sie bitte die Vertragsübersicht für geteilte Dokumente.
            </p>
            <Button className="mt-4" onClick={() => window.location.href = '/contracts'}>
              Zu den Verträgen
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <DashboardContent />
    </MainLayout>
  );
}