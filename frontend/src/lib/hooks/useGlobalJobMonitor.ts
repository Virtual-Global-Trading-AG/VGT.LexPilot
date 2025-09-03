'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './use-toast';
import { useDocuments } from './useApi';
import { useAuthStore } from '../stores/authStore';
import { ToastAction } from '@/components/ui/toast';

interface ActiveJob {
  jobId: string;
  type: string;
  documentId?: string;
  fileName?: string;
  startTime: number;
  pollCount?: number;
  lastPollTime?: number;
}

export function useGlobalJobMonitor() {
  const { toast } = useToast();
  const { getJobStatus, getUserJobs, getSwissObligationAnalysesByDocumentId } = useDocuments();
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  const [activeJobs, setActiveJobs] = useState<Map<string, ActiveJob>>(new Map());
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastCheckRef = useRef<number>(0);
  const jobMonitoringIntervals = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Adaptive polling intervals based on job state
  const getGlobalPollInterval = useCallback(() => {
    const activeJobCount = activeJobs.size;
    if (activeJobCount === 0) {
      return 30000; // 30 seconds when no active jobs
    } else if (activeJobCount <= 2) {
      return 15000; // 15 seconds for few jobs
    } else {
      return 10000; // 10 seconds for many jobs
    }
  }, [activeJobs.size]);

  const getJobPollInterval = useCallback((job: ActiveJob) => {
    const elapsed = Date.now() - job.startTime;
    const pollCount = job.pollCount || 0;

    // Exponential backoff for long-running jobs
    if (elapsed > 5 * 60 * 1000) { // After 5 minutes
      return Math.min(10000, 3000 + (pollCount * 500)); // Max 10 seconds
    } else if (elapsed > 2 * 60 * 1000) { // After 2 minutes
      return 5000; // 5 seconds
    } else {
      return 3000; // 3 seconds for new jobs
    }
  }, []);

  // Check for active jobs on mount and when authentication changes
  useEffect(() => {
    if (!isAuthenticated) {
      // Clear everything when not authenticated
      setActiveJobs(new Map());
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      // Clear all job monitoring intervals
      jobMonitoringIntervals.current.forEach(interval => clearInterval(interval));
      jobMonitoringIntervals.current.clear();
      return;
    }

    // Initial check for active jobs
    checkForActiveJobs();

    // Set up adaptive polling interval
    const setupGlobalPolling = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }

      const interval = 1000;
      pollIntervalRef.current = setInterval(() => {
        checkForActiveJobs();
      }, interval);
    };

    setupGlobalPolling();

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      // Clear all job monitoring intervals
      jobMonitoringIntervals.current.forEach(interval => clearInterval(interval));
      jobMonitoringIntervals.current.clear();
    };
  }, [isAuthenticated, getGlobalPollInterval]);

  const getJobCompletionMessage = (jobType: string, fileName?: string): string => {
    switch (jobType) {
      case 'contract-analysis':
        return fileName 
          ? `Vertragsanalyse für "${fileName}" wurde erfolgreich abgeschlossen.`
          : 'Vertragsanalyse wurde erfolgreich abgeschlossen.';
      case 'contract-generation':
        return 'Vertrag wurde erfolgreich generiert und gespeichert.';
      default:
        return fileName
          ? `Analyse für "${fileName}" wurde erfolgreich abgeschlossen.`
          : 'Analyse wurde erfolgreich abgeschlossen.';
    }
  };

  const getJobFailureMessage = (jobType: string, fileName?: string): string => {
    switch (jobType) {
      case 'contract-analysis':
        return fileName
          ? `Vertragsanalyse für "${fileName}" ist fehlgeschlagen.`
          : 'Vertragsanalyse ist fehlgeschlagen.';
      case 'contract-generation':
        return 'Vertragsgenerierung ist fehlgeschlagen.';
      default:
        return fileName
          ? `Analyse für "${fileName}" ist fehlgeschlagen.`
          : 'Analyse ist fehlgeschlagen.';
    }
  };


  const monitorJob = useCallback(async (jobId: string, jobInfo: ActiveJob) => {
    // Clear any existing interval for this job
    const existingInterval = jobMonitoringIntervals.current.get(jobId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    let pollCount = 0;
    let consecutiveProcessingCount = 0; // NEU: Zähle consecutive processing states

    const cleanupJobMonitoring = (jobId: string) => {
      const interval = jobMonitoringIntervals.current.get(jobId);
      if (interval) {
        clearTimeout(interval);
        jobMonitoringIntervals.current.delete(jobId);
      }
    };


    const pollJob = async () => {
      try {
        pollCount++;

        const statusResult = await getJobStatus(jobId);

        if (statusResult.success && statusResult.data) {
          const job = statusResult.data;

          if (job.status === 'completed') {
            // Job completed - show toast and cleanup
            cleanupJobMonitoring(jobId);
            setActiveJobs(prev => {
              const newMap = new Map(prev);
              newMap.delete(jobId);
              return newMap;
            });

            toast({
              variant: "success",
              title: jobInfo.type === 'contract-generation' ? "Vertrag generiert" : "Analyse abgeschlossen",
              description: getJobCompletionMessage(jobInfo.type, jobInfo.fileName),
              duration: 8000,
              action: jobInfo.type === 'contract-generation' 
                ? React.createElement(ToastAction, {
                    altText: "Zu generierten Verträgen",
                    onClick: () => router.push('/contracts?tab=generated')
                  }, "Anzeigen")
                : undefined,
            });

            return; // Stop polling

          } else if (job.status === 'failed') {

            // Job failed - show error toast and cleanup
            cleanupJobMonitoring(jobId);
            setActiveJobs(prev => {
              const newMap = new Map(prev);
              newMap.delete(jobId);
              return newMap;
            });

            toast({
              variant: "destructive",
              title: jobInfo.type === 'contract-generation' ? "Vertragsgenerierung fehlgeschlagen" : "Analyse fehlgeschlagen",
              description: job.error || getJobFailureMessage(jobInfo.type, jobInfo.fileName),
              duration: 10000,
            });

            return; // Stop polling

          } else if (job.status === 'processing') {
            consecutiveProcessingCount++;

            let nextInterval = 2000; // Standard 2 Sekunden

            if (consecutiveProcessingCount > 10) {
              // Nach 10 processing-Checks (ca. 20 Sekunden), alle 1 Sekunde prüfen
              nextInterval = 1000;
            } else if (consecutiveProcessingCount > 5) {
              // Nach 5 processing-Checks, alle 1.5 Sekunden prüfen
              nextInterval = 1500;
            }

            const nextPollTimeout = setTimeout(pollJob, nextInterval);
            jobMonitoringIntervals.current.set(jobId, nextPollTimeout);

          } else {
            const nextPollTimeout = setTimeout(pollJob, 3000);
            jobMonitoringIntervals.current.set(jobId, nextPollTimeout);
          }

        } else {
          // API error - retry with exponential backoff
          const retryInterval = Math.min(10000, 2000 * Math.pow(1.5, pollCount - 1));
          const retryTimeout = setTimeout(pollJob, retryInterval);
          jobMonitoringIntervals.current.set(jobId, retryTimeout);
        }
      } catch (error) {
        // Retry with exponential backoff on error
        const retryInterval = Math.min(10000, 2000 * Math.pow(1.5, pollCount - 1));
        const retryTimeout = setTimeout(pollJob, retryInterval);
        jobMonitoringIntervals.current.set(jobId, retryTimeout);
      }
    };

    // Start polling immediately
    pollJob();
  }, [getJobStatus, toast, getJobCompletionMessage, getJobFailureMessage]);

  const checkForActiveJobs = useCallback(async () => {
    if (!isAuthenticated) return;

    const now = Date.now();

    // Throttle API calls - don't check more than once every 5 seconds
    if (now - lastCheckRef.current < 1000) {
      return;
    }

    lastCheckRef.current = now;

    try {
      // If we have active jobs being individually monitored, reduce global polling frequency
      const hasActiveMonitoring = jobMonitoringIntervals.current.size > 0;

      // Skip global check if we have recent individual monitoring and it's been less than 30 seconds
      if (hasActiveMonitoring && activeJobs.size > 0) {
        const recentActivity = Array.from(activeJobs.values()).some(job => 
          job.lastPollTime && (now - job.lastPollTime) < 30000
        );
        if (recentActivity) {
          return; // Skip this global check
        }
      }

      // Get user's recent jobs
      const result = await getUserJobs(20, 0);

      if (result.success && result.data?.jobs) {
        const jobs = result.data.jobs;
        const newActiveJobs = new Map<string, ActiveJob>();
        let hasNewJobs = false;

        // Find jobs that are still pending or processing
        for (const job of jobs) {
          if (job.status === 'pending' || job.status === 'processing') {
            const activeJob: ActiveJob = {
              jobId: job.jobId,
              type: job.type,
              documentId: job.data?.documentId,
              fileName: job.data?.fileName,
              startTime: new Date(job.createdAt).getTime(),
              pollCount: activeJobs.get(job.jobId)?.pollCount || 0,
              lastPollTime: activeJobs.get(job.jobId)?.lastPollTime
            };

            newActiveJobs.set(job.jobId, activeJob);

            // If this is a new job we haven't seen before, start monitoring it
            if (!activeJobs.has(job.jobId)) {
              hasNewJobs = true;
              monitorJob(job.jobId, activeJob);
            }
          }
        }

        // Preserve manually added jobs that might not be in API response yet
        // (jobs added via startJobMonitoring that are too new to appear in API)
        const preservedJobs = new Map<string, ActiveJob>();
        activeJobs.forEach((job, jobId) => {
          // Preserve jobs that are very recent (less than 30 seconds old)
          // and are being individually monitored
          const isRecentJob = (Date.now() - job.startTime) < 30000;
          const isBeingMonitored = jobMonitoringIntervals.current.has(jobId);

          if (isRecentJob && isBeingMonitored && !newActiveJobs.has(jobId)) {
            preservedJobs.set(jobId, job);
          }
        });

        // Merge API jobs with preserved jobs
        const finalActiveJobs = new Map([...newActiveJobs, ...preservedJobs]);

        // Only update state if there are actual changes
        const currentJobIds = new Set(activeJobs.keys());
        const finalJobIds = new Set(finalActiveJobs.keys());
        const hasChanges = hasNewJobs ||
          currentJobIds.size !== finalJobIds.size ||
          Array.from(currentJobIds).some(id => !finalJobIds.has(id)) ||
          Array.from(finalJobIds).some(id => !currentJobIds.has(id));

        if (hasChanges) {
          setActiveJobs(finalActiveJobs);

          // Clean up monitoring for jobs that are no longer active and not preserved
          currentJobIds.forEach(jobId => {
            if (!finalJobIds.has(jobId)) {
              const interval = jobMonitoringIntervals.current.get(jobId);
              if (interval) {
                clearTimeout(interval);
                jobMonitoringIntervals.current.delete(jobId);
              }
            }
          });
        }
      }
    } catch (error) {
      console.error('Error checking for active jobs:', error);
    }
  }, [isAuthenticated, getUserJobs, activeJobs, monitorJob]);

  // Function to immediately start monitoring a specific job
  const startJobMonitoring = useCallback((jobId: string, jobType: string, documentId?: string, fileName?: string) => {
    const activeJob: ActiveJob = {
      jobId,
      type: jobType,
      documentId,
      fileName,
      startTime: Date.now(),
      pollCount: 0
    };

    // Add to active jobs immediately
    setActiveJobs(prev => {
      const newMap = new Map(prev);
      newMap.set(jobId, activeJob);
      return newMap;
    });

    // Start monitoring immediately
    monitorJob(jobId, activeJob);
  }, [monitorJob]);

  return {
    activeJobs: Array.from(activeJobs.values()),
    hasActiveJobs: activeJobs.size > 0,
    checkForActiveJobs,
    startJobMonitoring
  };
}
