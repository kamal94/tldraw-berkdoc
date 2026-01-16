import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import {
  onboardingApi,
  type OnboardingStep,
  type OnboardingStatus,
  type DriveMetadataSnapshot,
  type ProcessingProgress,
  type MetadataScanProgress,
  type PlanLimitCheck,
  type ProcessingOptions,
} from '../api/onboarding';
import { OnboardingContext } from './OnboardingContext';
import { useAuth } from '../hooks/useAuth';

const PROGRESS_POLL_INTERVAL = 500; // 0.5 seconds

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();

  // Core state
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [snapshot, setSnapshot] = useState<DriveMetadataSnapshot | null>(null);
  const [planLimits, setPlanLimits] = useState<PlanLimitCheck | null>(null);
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [scanProgress, setScanProgress] = useState<MetadataScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Progress polling refs
  const progressPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanProgressPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Computed values
  const step: OnboardingStep = status?.step || 'connect';
  const isScanning = status?.isScanning || false;
  const isProcessing = status?.isProcessing || false;

  // Check if user needs onboarding
  const checkOnboarding = useCallback(async () => {
    if (!isAuthenticated) {
      setNeedsOnboarding(false);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const needs = await onboardingApi.needsOnboarding();
      setNeedsOnboarding(needs);

      if (needs) {
        // Fetch full status
        const statusData = await onboardingApi.getStatus();
        setStatus(statusData);

        // If we have a snapshot, fetch it
        if (statusData.hasSnapshot) {
          const snapshotData = await onboardingApi.getDriveSnapshot();
          setSnapshot(snapshotData.snapshot);
          setPlanLimits(snapshotData.planLimits);
        }

        // If processing, fetch progress
        if (statusData.isProcessing) {
          const progressData = await onboardingApi.getProgress();
          setProgress(progressData.progress);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check onboarding status');
      console.error('Failed to check onboarding:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Refresh scan progress
  const refreshScanProgress = useCallback(async () => {
    try {
      const progressData = await onboardingApi.getMetadataScanProgress();
      setScanProgress(progressData.progress);

      // Always try to fetch snapshot (works during scanning for live updates)
      try {
        const snapshotData = await onboardingApi.getDriveSnapshot();
        setSnapshot(snapshotData.snapshot);
        setPlanLimits(snapshotData.planLimits);
      } catch (err) {
        console.error('Failed to fetch snapshot:', err);
        // If snapshot not available, try live stats
        if (isScanning) {
          try {
            const liveStats = await onboardingApi.getLiveScanStats();
            // Create a partial snapshot from live stats
            setSnapshot({
              totalFileCount: liveStats.filesScanned,
              totalSizeBytes: liveStats.totalSizeBytes,
              folderCount: 0, // Will be updated when scan completes
              supportedFileCount: liveStats.supportedCount,
              supportedSizeBytes: 0, // Will be calculated
              unsupportedFileCount: liveStats.unsupportedCount,
              sharedDocCount: liveStats.sharedCount,
              uniqueCollaboratorCount: liveStats.collaboratorCount,
              fileTypeBreakdown: {},
            });
          } catch (liveErr) {
            // Ignore if live stats not available
            console.error('Failed to fetch live stats:', liveErr);
          }
        }
      }

      // If complete, update status
      if (progressData.progress.isComplete) {
        const statusData = await onboardingApi.getStatus();
        setStatus(statusData);
      }
    } catch (err) {
      console.error('Failed to fetch scan progress:', err);
    }
  }, [isScanning]);

  // Start metadata scan
  const startMetadataScan = useCallback(async () => {
    try {
      setError(null);
      await onboardingApi.startMetadataScan();

      // Update status to show scanning
      setStatus((prev) =>
        prev
          ? { ...prev, isScanning: true, metadataScanStartedAt: new Date().toISOString() }
          : null,
      );

      // Start polling for scan progress
      refreshScanProgress();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start metadata scan');
      console.error('Failed to start metadata scan:', err);
    }
  }, [refreshScanProgress]);

  // Refresh snapshot data
  const refreshSnapshot = useCallback(async () => {
    try {
      setError(null);
      const snapshotData = await onboardingApi.getDriveSnapshot();
      setSnapshot(snapshotData.snapshot);
      setPlanLimits(snapshotData.planLimits);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch drive snapshot');
      console.error('Failed to fetch snapshot:', err);
    }
  }, []);

  // Complete review - moves from step 2 to step 3
  const completeReview = useCallback(async () => {
    try {
      setError(null);
      await onboardingApi.completeReview();

      // Update status to reflect new step
      const statusData = await onboardingApi.getStatus();
      setStatus(statusData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete review');
      console.error('Failed to complete review:', err);
    }
  }, []);

  // Confirm processing - THE CRITICAL GATE
  const confirmProcessing = useCallback(async (options?: ProcessingOptions) => {
    try {
      setError(null);
      await onboardingApi.confirmProcessing(options);

      // Update status
      const statusData = await onboardingApi.getStatus();
      setStatus(statusData);

      // Start polling for progress
      const progressData = await onboardingApi.getProgress();
      setProgress(progressData.progress);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm processing');
      console.error('Failed to confirm processing:', err);
    }
  }, []);

  // Refresh progress
  const refreshProgress = useCallback(async () => {
    try {
      const progressData = await onboardingApi.getProgress();
      setProgress(progressData.progress);

      // If complete, update status and stop polling
      if (progressData.progress.isComplete) {
        const statusData = await onboardingApi.getStatus();
        setStatus(statusData);
        setNeedsOnboarding(false);
      }
    } catch (err) {
      console.error('Failed to fetch progress:', err);
    }
  }, []);

  // Dismiss onboarding (for users who want to skip)
  const dismissOnboarding = useCallback(() => {
    setNeedsOnboarding(false);
  }, []);

  // Check onboarding on mount and when auth changes
  useEffect(() => {
    checkOnboarding();
  }, [checkOnboarding]);

  // Poll for scan progress when scanning
  useEffect(() => {
    if (isScanning && !scanProgress?.isComplete) {
      scanProgressPollRef.current = setInterval(refreshScanProgress, PROGRESS_POLL_INTERVAL);
    }

    return () => {
      if (scanProgressPollRef.current) {
        clearInterval(scanProgressPollRef.current);
        scanProgressPollRef.current = null;
      }
    };
  }, [isScanning, scanProgress?.isComplete, refreshScanProgress]);

  // Poll for progress when processing
  useEffect(() => {
    if (isProcessing && !progress?.isComplete) {
      progressPollRef.current = setInterval(refreshProgress, PROGRESS_POLL_INTERVAL);
    }

    return () => {
      if (progressPollRef.current) {
        clearInterval(progressPollRef.current);
        progressPollRef.current = null;
      }
    };
  }, [isProcessing, progress?.isComplete, refreshProgress]);

  // Memoize context value
  const contextValue = useMemo(
    () => ({
      needsOnboarding,
      isLoading,
      step,
      status,
      snapshot,
      planLimits,
      progress,
      scanProgress,
      error,
      isScanning,
      isProcessing,
      checkOnboarding,
      startMetadataScan,
      refreshSnapshot,
      completeReview,
      confirmProcessing,
      refreshProgress,
      dismissOnboarding,
    }),
    [
      needsOnboarding,
      isLoading,
      step,
      status,
      snapshot,
      planLimits,
      progress,
      scanProgress,
      error,
      isScanning,
      isProcessing,
      checkOnboarding,
      startMetadataScan,
      refreshSnapshot,
      completeReview,
      confirmProcessing,
      refreshProgress,
      dismissOnboarding,
    ],
  );

  return <OnboardingContext.Provider value={contextValue}>{children}</OnboardingContext.Provider>;
}
