import { createContext } from 'react';
import type {
  OnboardingStep,
  OnboardingStatus,
  DriveMetadataSnapshot,
  ProcessingProgress,
  MetadataScanProgress,
  PlanLimitCheck,
  ProcessingOptions,
} from '../api/onboarding';

export interface OnboardingContextType {
  // State
  needsOnboarding: boolean;
  isLoading: boolean;
  step: OnboardingStep;
  status: OnboardingStatus | null;
  snapshot: DriveMetadataSnapshot | null;
  planLimits: PlanLimitCheck | null;
  progress: ProcessingProgress | null;
  scanProgress: MetadataScanProgress | null;
  error: string | null;

  // Computed
  isScanning: boolean;
  isProcessing: boolean;

  // Actions
  checkOnboarding: () => Promise<void>;
  startMetadataScan: () => Promise<void>;
  refreshSnapshot: () => Promise<void>;
  completeReview: () => Promise<void>;
  confirmProcessing: (options?: ProcessingOptions) => Promise<void>;
  refreshProgress: () => Promise<void>;
  dismissOnboarding: () => void;
}

export const OnboardingContext = createContext<OnboardingContextType | null>(null);
