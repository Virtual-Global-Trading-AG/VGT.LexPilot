'use client';

import { useJobMonitor } from '@/lib/contexts/JobMonitorContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Clock, Loader2, FileText, PenTool } from 'lucide-react';

export function GlobalJobIndicator() {
  const { activeJobs, hasActiveJobs } = useJobMonitor();

  if (!hasActiveJobs) {
    return null;
  }

  const getJobTypeIcon = (type: string) => {
    switch (type) {
      case 'swiss-obligation-analysis':
        return <FileText className="h-3 w-3" />;
      case 'contract-generation':
        return <PenTool className="h-3 w-3" />;
      default:
        return <Clock className="h-3 w-3" />;
    }
  };

  const getJobTypeLabel = (type: string) => {
    switch (type) {
      case 'swiss-obligation-analysis':
        return 'Obligationenrecht-Analyse';
      case 'contract-generation':
        return 'Vertragsgenerierung';
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

  // Helper functions for context-aware labels
  const getContextLabel = () => {
    const hasAnalysis = activeJobs.some(job => job.type === 'swiss-obligation-analysis');
    const hasGeneration = activeJobs.some(job => job.type === 'contract-generation');

    if (hasAnalysis && hasGeneration) {
      return 'Auftrag';
    } else if (hasGeneration) {
      return 'Vertragsgenerierung';
    } else {
      return 'Analyse';
    }
  };

  const getContextPluralLabel = () => {
    const hasAnalysis = activeJobs.some(job => job.type === 'swiss-obligation-analysis');
    const hasGeneration = activeJobs.some(job => job.type === 'contract-generation');

    if (hasAnalysis && hasGeneration) {
      return 'Aufträge';
    } else if (hasGeneration) {
      return 'Vertragsgenerierungen';
    } else {
      return 'Analysen';
    }
  };

  const getDropdownTitle = () => {
    const hasAnalysis = activeJobs.some(job => job.type === 'swiss-obligation-analysis');
    const hasGeneration = activeJobs.some(job => job.type === 'contract-generation');

    if (hasAnalysis && hasGeneration) {
      return 'Laufende Aufträge';
    } else if (hasGeneration) {
      return 'Laufende Vertragsgenerierungen';
    } else {
      return 'Laufende Analysen';
    }
  };

  const getFooterMessage = () => {
    const hasAnalysis = activeJobs.some(job => job.type === 'swiss-obligation-analysis');
    const hasGeneration = activeJobs.some(job => job.type === 'contract-generation');

    if (hasAnalysis && hasGeneration) {
      return 'Sie erhalten eine Benachrichtigung, wenn die Aufträge abgeschlossen sind.';
    } else if (hasGeneration) {
      return 'Sie erhalten eine Benachrichtigung, wenn die Vertragsgenerierungen abgeschlossen sind.';
    } else {
      return 'Sie erhalten eine Benachrichtigung, wenn die Analysen abgeschlossen sind.';
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="default"
          className="relative h-10 px-4 bg-orange-100 border-orange-300 hover:bg-orange-200 text-orange-800 shadow-lg animate-pulse"
        >
          <Loader2 className="h-4 w-4 mr-2 animate-spin text-orange-600" />
          <span className="text-sm font-semibold">
            {activeJobs.length} {activeJobs.length === 1 ? getContextLabel() : getContextPluralLabel()}
          </span>
          <Badge 
            variant="secondary" 
            className="ml-2 h-5 px-2 text-sm bg-orange-200 text-orange-900 font-bold animate-bounce"
          >
            {activeJobs.length}
          </Badge>
          {/* Pulsing ring effect */}
          <div className="absolute -inset-1 bg-orange-400 rounded-md opacity-30 animate-ping"></div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80 p-3" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">{getDropdownTitle()}</h4>
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
            {getFooterMessage()}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
