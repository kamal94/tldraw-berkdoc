/**
 * DTOs for onboarding API endpoints
 */

export type OnboardingStep = 'connect' | 'review' | 'prepare' | 'processing' | 'complete';

export interface FileTypeBreakdown {
  [mimeType: string]: {
    count: number;
    sizeBytes: number;
    displayName: string;
    classification: 'supported' | 'future' | 'ignored';
  };
}

export interface ProcessingOptions {
  prioritizeShared?: boolean;
  prioritizeRecent?: boolean;
  skipDrafts?: boolean;
}

export interface DriveMetadataSnapshot {
  totalFileCount: number;
  totalSizeBytes: number;
  folderCount: number;
  supportedFileCount: number;
  supportedSizeBytes: number;
  unsupportedFileCount: number;
  sharedDocCount: number;
  uniqueCollaboratorCount: number;
  fileTypeBreakdown: FileTypeBreakdown;
}

export interface ProcessingProgress {
  filesProcessed: number;
  filesTotal: number;
  percentComplete: number;
  isComplete: boolean;
  startedAt: string | null;
  completedAt: string | null;
}

export interface PlanLimitCheck {
  withinLimits: boolean;
  maxDocuments: number;
  currentDocuments: number;
  documentsOverLimit: number;
  maxSizeGb: number;
  currentSizeGb: number;
  sizeOverLimitGb: number;
}

// Response DTOs

export interface OnboardingStatusResponseDto {
  step: OnboardingStep;
  driveConnectedAt: string | null;
  metadataScanStartedAt: string | null;
  metadataScanCompletedAt: string | null;
  processingConfirmedAt: string | null;
  processingStartedAt: string | null;
  processingCompletedAt: string | null;
  hasSnapshot: boolean;
  isScanning: boolean;
  isProcessing: boolean;
}

export interface DriveSnapshotResponseDto {
  snapshot: DriveMetadataSnapshot;
  planLimits: PlanLimitCheck;
  scannedAt: string;
}

export interface ProcessingProgressResponseDto {
  progress: ProcessingProgress;
}

export interface MetadataScanProgress {
  filesScanned: number;
  isComplete: boolean;
}

export interface MetadataScanProgressResponseDto {
  progress: MetadataScanProgress;
}

// Request DTOs

export interface ConfirmProcessingRequestDto {
  options?: ProcessingOptions;
}

export interface StartMetadataScanResponseDto {
  message: string;
  scanId: string;
}

export interface ConfirmProcessingResponseDto {
  message: string;
  processingStartedAt: string;
}
