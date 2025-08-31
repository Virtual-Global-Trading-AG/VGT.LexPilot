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
  const {
    getDashboardStats,
    getRecentActivities,
    getAnalysisProgress,
    getLawyerDashboardStats,
    getLawyerRecentActivities,
    getLawyerAnalysisProgress,
    loading,
    error
  } = useDashboard();
  const { userProfile } = useAuthStore();
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [analysisProgress, setAnalysisProgress] = useState<any[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [progressLoading, setProgressLoading] = useState(true);

  const isLawyer = userProfile?.role === 'lawyer';

  // Load dashboard data
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        if (isLawyer) {
          // Load lawyer-specific data
          const statsResult = await getLawyerDashboardStats();
          if (statsResult.success && statsResult.data) {
            setDashboardStats(statsResult.data);
          }
          setStatsLoading(false);

          const activitiesResult = await getLawyerRecentActivities(6);
          if (activitiesResult.success && activitiesResult.data) {
            setRecentActivities(activitiesResult.data.activities || []);
          }
          setActivitiesLoading(false);

          const progressResult = await getLawyerAnalysisProgress();
          if (progressResult.success && progressResult.data) {
            setAnalysisProgress(progressResult.data.progressItems || []);
          }
          setProgressLoading(false);
        } else {
          // Load regular user data
          const statsResult = await getDashboardStats();
          if (statsResult.success && statsResult.data) {
            setDashboardStats(statsResult.data);
          }
          setStatsLoading(false);

          const activitiesResult = await getRecentActivities(6);
          if (activitiesResult.success && activitiesResult.data) {
            setRecentActivities(activitiesResult.data.activities || []);
          }
          setActivitiesLoading(false);

          const progressResult = await getAnalysisProgress();
          if (progressResult.success && progressResult.data) {
            setAnalysisProgress(progressResult.data.progressItems || []);
          }
          setProgressLoading(false);
        }
      } catch (error) {
        console.error('Error loading dashboard data:', error);
        setStatsLoading(false);
        setActivitiesLoading(false);
        setProgressLoading(false);
      }
    };

    loadDashboardData();
  }, [
    getDashboardStats,
    getRecentActivities,
    getAnalysisProgress,
    getLawyerDashboardStats,
    getLawyerRecentActivities,
    getLawyerAnalysisProgress,
    isLawyer
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            {isLawyer ? 'Anwalt Dashboard' : 'Dashboard'}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {isLawyer
              ? 'Überblick über Ihre Prüfungen und Verdienste'
              : 'Überblick über Ihre Rechtsanalysen und Aktivitäten'
            }
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {isLawyer ? 'Gesamtverdienst' : 'Aktive Verträge'}
            </CardTitle>
            {isLawyer ? (
              <DollarSign className="h-4 w-4 text-muted-foreground"/>
            ) : (
              <FileText className="h-4 w-4 text-muted-foreground"/>
            )}
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin"/>
                <span className="text-sm text-muted-foreground">Lädt...</span>
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {isLawyer ? (
                    `${dashboardStats?.totalEarnings?.currency || 'CHF'} ${dashboardStats?.totalEarnings?.amount?.toLocaleString() || '0'}`
                  ) : (
                    dashboardStats?.activeContracts?.count || 0
                  )}
                </div>
                {(isLawyer ? dashboardStats?.totalEarnings?.growth : dashboardStats?.activeContracts?.growth) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    <span className="text-green-600">
                      +{isLawyer ? dashboardStats?.totalEarnings?.growth : dashboardStats?.activeContracts?.growth}%
                    </span> vs. letzter Monat
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {isLawyer ? 'Geprüfte Verträge' : 'Hohe Risiken'}
            </CardTitle>
            {isLawyer ? (
              <CheckCircle className="h-4 w-4 text-muted-foreground"/>
            ) : (
              <AlertTriangle className="h-4 w-4 text-muted-foreground"/>
            )}
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin"/>
                <span className="text-sm text-muted-foreground">Lädt...</span>
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {isLawyer ? (
                    dashboardStats?.reviewedContracts?.count || 0
                  ) : (
                    dashboardStats?.highRisks?.count || 0
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {isLawyer ? (
                    <>
                      <span className="text-green-600">{dashboardStats?.reviewedContracts?.approved || 0} genehmigt</span>
                      {' • '}
                      <span className="text-red-600">{dashboardStats?.reviewedContracts?.declined || 0} abgelehnt</span>
                    </>
                  ) : (
                    <span className="text-red-600">Sofortige Aufmerksamkeit</span>
                  )}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {isLawyer ? 'Ungeprüfte Dokumente' : 'Fällige Fristen'}
            </CardTitle>
            {isLawyer ? (
              <FileText className="h-4 w-4 text-muted-foreground"/>
            ) : (
              <Clock className="h-4 w-4 text-muted-foreground"/>
            )}
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin"/>
                <span className="text-sm text-muted-foreground">Lädt...</span>
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {isLawyer ? (
                    dashboardStats?.unreviewedDocuments?.count || 0
                  ) : (
                    dashboardStats?.dueDates?.count || 0
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {isLawyer ? (
                    <span className="text-blue-600">Warten auf Prüfung</span>
                  ) : (
                    <span className="text-orange-600">innerhalb 30 Tage</span>
                  )}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {isLawyer ? 'Offene Prüfungen' : 'Monatliche Einsparungen'}
            </CardTitle>
            {isLawyer ? (
              <Clock className="h-4 w-4 text-muted-foreground"/>
            ) : (
              <DollarSign className="h-4 w-4 text-muted-foreground"/>
            )}
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin"/>
                <span className="text-sm text-muted-foreground">Lädt...</span>
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {isLawyer ? (
                    dashboardStats?.pendingReviews?.count || 0
                  ) : (
                    `${dashboardStats?.monthlySavings?.currency || 'CHF'} ${dashboardStats?.monthlySavings?.amount?.toLocaleString() || '0'}`
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {isLawyer ? (
                    <span className="text-orange-600">In Bearbeitung</span>
                  ) : (
                    dashboardStats?.monthlySavings?.growth && dashboardStats.monthlySavings.growth > 0 && (
                      <>
                        <span className="text-green-600">+{dashboardStats.monthlySavings.growth}%</span> vs. letzter Monat
                      </>
                    )
                  )}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                <Loader2 className="h-6 w-6 animate-spin"/>
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
                  <Progress value={item.progress} className="h-2"/>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        {/* Recent Activities */}
        <Card>
          <CardHeader>
            <CardTitle>Letzte Aktivitäten</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activitiesLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin"/>
                <span className="ml-2 text-sm text-muted-foreground">Lädt Aktivitäten...</span>
              </div>
            ) : recentActivities.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">Keine aktuellen Aktivitäten</p>
              </div>
            ) : (
              recentActivities.map((activity) => {
                const IconComponent = iconMap[activity.icon] || FileText;

                // Handle new format (aligned with contracts table) vs old format (uploaded documents)
                if (activity.fileName && activity.status) {
                  // New format: fileName, status, time (for violations/conformity)
                  return (
                    <div key={activity.id} className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        <IconComponent className={`h-5 w-5 ${activity.iconColor}`}/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {activity.fileName}
                        </p>
                        <div className="flex items-center space-x-2 mt-1">
                          <Badge variant={activity.statusVariant || 'default'} className="text-xs">
                            {activity.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {activity.time}
                        </p>
                      </div>
                    </div>
                  );
                } else {
                  // Old format: title, subtitle, time (for uploaded documents)
                  return (
                    <div key={activity.id} className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        <IconComponent className={`h-5 w-5 ${activity.iconColor}`}/>
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
                    </div>
                  );
                }
              })
            )}
          </CardContent>
        </Card>
      </div>


    </div>
  );
}

export default function DashboardPage() {
  return (
    <MainLayout>
      <DashboardContent/>
    </MainLayout>
  );
}
