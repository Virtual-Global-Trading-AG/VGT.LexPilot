'use client';

import { useGlobalJobMonitor } from '@/lib/hooks/useGlobalJobMonitor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Clock, Loader2, FileText } from 'lucide-react';

export function GlobalJobIndicator() {
  const { activeJobs, hasActiveJobs } = useGlobalJobMonitor();

  if (!hasActiveJobs) {
    return null;
  }

  const getJobTypeIcon = (type: string) => {
    switch (type) {
      case 'swiss-obligation-analysis':
        return <FileText className="h-3 w-3" />;
      default:
        return <Clock className="h-3 w-3" />;
    }
  };

  const getJobTypeLabel = (type: string) => {
    switch (type) {
      case 'swiss-obligation-analysis':
        return 'Obligationenrecht-Analyse';
      default:
        return 'Analyse';
    }
  };

  const formatTimeElapsed = (startTime: number) => {
    const elapsed = Date.now() - startTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative h-8 px-2 bg-blue-50 border-blue-200 hover:bg-blue-100 text-blue-700"
        >
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          <span className="text-xs font-medium">
            {activeJobs.length} Analyse{activeJobs.length !== 1 ? 'n' : ''}
          </span>
          <Badge 
            variant="secondary" 
            className="ml-1 h-4 px-1 text-xs bg-blue-100 text-blue-800"
          >
            {activeJobs.length}
          </Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80 p-3" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">Laufende Analysen</h4>
            <Badge variant="secondary" className="text-xs">
              {activeJobs.length} aktiv
            </Badge>
          </div>

          <div className="space-y-2">
            {activeJobs.map((job) => (
              <div
                key={job.jobId}
                className="flex items-start space-x-2 p-2 rounded-md bg-gray-50 border"
              >
                <div className="flex-shrink-0 mt-0.5">
                  {getJobTypeIcon(job.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-gray-900 truncate">
                      {getJobTypeLabel(job.type)}
                    </p>
                    <span className="text-xs text-gray-500">
                      {formatTimeElapsed(job.startTime)}
                    </span>
                  </div>
                  {job.fileName && (
                    <p className="text-xs text-gray-600 truncate mt-1">
                      {job.fileName}
                    </p>
                  )}
                  <div className="flex items-center mt-1">
                    <Loader2 className="h-2 w-2 animate-spin mr-1 text-blue-500" />
                    <span className="text-xs text-blue-600">Wird verarbeitet...</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-xs text-gray-500 text-center pt-2 border-t">
            Sie erhalten eine Benachrichtigung, wenn die Analysen abgeschlossen sind.
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
