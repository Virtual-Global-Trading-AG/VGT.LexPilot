'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useGlobalJobMonitor } from '@/lib/hooks/useGlobalJobMonitor';

interface JobMonitorContextType {
  activeJobs: Array<{
    jobId: string;
    type: string;
    documentId?: string;
    fileName?: string;
    startTime: number;
    pollCount?: number;
    lastPollTime?: number;
  }>;
  hasActiveJobs: boolean;
  checkForActiveJobs: () => void;
  startJobMonitoring: (jobId: string, jobType: string, documentId?: string, fileName?: string) => void;
}

const JobMonitorContext = createContext<JobMonitorContextType | undefined>(undefined);

export function JobMonitorProvider({ children }: { children: ReactNode }) {
  const jobMonitor = useGlobalJobMonitor();

  return (
    <JobMonitorContext.Provider value={jobMonitor}>
      {children}
    </JobMonitorContext.Provider>
  );
}

export function useJobMonitor() {
  const context = useContext(JobMonitorContext);
  if (context === undefined) {
    throw new Error('useJobMonitor must be used within a JobMonitorProvider');
  }
  return context;
}