'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useToast } from './use-toast';
import { useDocuments } from './useApi';
import { useAuthStore } from '../stores/authStore';

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

      const interval = getGlobalPollInterval();
      pollIntervalRef.current = setInterval(() => {
        checkForActiveJobs();
        // Restart with new interval if it changed
        if (getGlobalPollInterval() !== interval) {
          setupGlobalPolling();
        }
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
      case 'swiss-obligation-analysis':
        return fileName 
          ? `Schweizer Obligationenrecht-Analyse für "${fileName}" wurde erfolgreich abgeschlossen.`
          : 'Schweizer Obligationenrecht-Analyse wurde erfolgreich abgeschlossen.';
      default:
        return fileName
          ? `Analyse für "${fileName}" wurde erfolgreich abgeschlossen.`
          : 'Analyse wurde erfolgreich abgeschlossen.';
    }
  };

  const getJobFailureMessage = (jobType: string, fileName?: string): string => {
    switch (jobType) {
      case 'swiss-obligation-analysis':
        return fileName
          ? `Schweizer Obligationenrecht-Analyse für "${fileName}" ist fehlgeschlagen.`
          : 'Schweizer Obligationenrecht-Analyse ist fehlgeschlagen.';
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
    let timeoutId: NodeJS.Timeout;

    const pollJob = async () => {
      try {
        pollCount++;

        // Update job with poll count for adaptive intervals
        setActiveJobs(prev => {
          const newMap = new Map(prev);
          const job = newMap.get(jobId);
          if (job) {
            newMap.set(jobId, { 
              ...job, 
              pollCount, 
              lastPollTime: Date.now() 
            });
          }
          return newMap;
        });

        const statusResult = await getJobStatus(jobId);

        if (statusResult.success && statusResult.data) {
          const job = statusResult.data;

          if (job.status === 'completed') {
            // Job completed successfully - cleanup and notify
            cleanupJobMonitoring(jobId);

            setActiveJobs(prev => {
              const newMap = new Map(prev);
              newMap.delete(jobId);
              return newMap;
            });

            // Show success notification
            toast({
              title: "Analyse abgeschlossen",
              description: getJobCompletionMessage(jobInfo.type, jobInfo.fileName),
              duration: 8000,
            });

            // If it's a Swiss obligation analysis, trigger a refresh of analyses
            if (jobInfo.type === 'swiss-obligation-analysis' && jobInfo.documentId) {
              try {
                await getSwissObligationAnalysesByDocumentId(jobInfo.documentId);
              } catch (error) {
                console.error('Error refreshing analyses:', error);
              }
            }
            return; // Stop polling

          } else if (job.status === 'failed') {
            // Job failed - cleanup and notify
            cleanupJobMonitoring(jobId);

            setActiveJobs(prev => {
              const newMap = new Map(prev);
              newMap.delete(jobId);
              return newMap;
            });

            // Show error notification
            toast({
              variant: "destructive",
              title: "Analyse fehlgeschlagen",
              description: job.error || getJobFailureMessage(jobInfo.type, jobInfo.fileName),
              duration: 10000,
            });
            return; // Stop polling
          }

          // Job still pending/processing - schedule next poll with adaptive interval
          const currentJob = { ...jobInfo, pollCount, lastPollTime: Date.now() };
          const nextInterval = getJobPollInterval(currentJob);

          const nextPollTimeout = setTimeout(pollJob, nextInterval);
          jobMonitoringIntervals.current.set(jobId, nextPollTimeout);
        } else {
          // API error - retry with exponential backoff
          const retryInterval = Math.min(30000, 5000 * Math.pow(1.5, pollCount - 1));
          const retryTimeout = setTimeout(pollJob, retryInterval);
          jobMonitoringIntervals.current.set(jobId, retryTimeout);
        }
      } catch (error) {
        console.error('Error monitoring job:', jobId, error);
        // Retry with exponential backoff on error
        const retryInterval = Math.min(30000, 5000 * Math.pow(1.5, pollCount - 1));
        const retryTimeout = setTimeout(pollJob, retryInterval);
        jobMonitoringIntervals.current.set(jobId, retryTimeout);
      }
    };

    const cleanupJobMonitoring = (jobId: string) => {
      const interval = jobMonitoringIntervals.current.get(jobId);
      if (interval) {
        clearTimeout(interval);
        jobMonitoringIntervals.current.delete(jobId);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };

    // Start polling immediately
    pollJob();

    // Set up timeout to stop polling after 15 minutes
    timeoutId = setTimeout(() => {
      cleanupJobMonitoring(jobId);

      setActiveJobs(prev => {
        const newMap = new Map(prev);
        if (newMap.has(jobId)) {
          newMap.delete(jobId);
          // Show timeout notification
          toast({
            variant: "destructive",
            title: "Analyse-Timeout",
            description: "Die Analyse dauert länger als erwartet. Bitte überprüfen Sie später den Status.",
            duration: 10000,
          });
        }
        return newMap;
      });
    }, 15 * 60 * 1000); // 15 minutes
  }, [getJobStatus, getJobPollInterval, getJobCompletionMessage, getJobFailureMessage, getSwissObligationAnalysesByDocumentId, toast]);

  const checkForActiveJobs = useCallback(async () => {
    if (!isAuthenticated) return;

    const now = Date.now();

    // Throttle API calls - don't check more than once every 5 seconds
    if (now - lastCheckRef.current < 5000) {
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

        // Only update state if there are actual changes
        const currentJobIds = new Set(activeJobs.keys());
        const newJobIds = new Set(newActiveJobs.keys());
        const hasChanges = hasNewJobs || 
          currentJobIds.size !== newJobIds.size || 
          Array.from(currentJobIds).some(id => !newJobIds.has(id));

        if (hasChanges) {
          setActiveJobs(newActiveJobs);

          // Clean up monitoring for jobs that are no longer active
          currentJobIds.forEach(jobId => {
            if (!newJobIds.has(jobId)) {
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
