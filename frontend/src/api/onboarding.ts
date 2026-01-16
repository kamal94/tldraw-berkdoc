const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Types matching backend DTOs
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

export interface OnboardingStatus {
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

export interface DriveSnapshotResponse {
  snapshot: DriveMetadataSnapshot;
  planLimits: PlanLimitCheck;
  scannedAt: string;
}

export interface ProcessingProgressResponse {
  progress: ProcessingProgress;
}

export interface MetadataScanProgress {
  filesScanned: number;
  isComplete: boolean;
}

export interface MetadataScanProgressResponse {
  progress: MetadataScanProgress;
}

class OnboardingApi {
  private getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const token = this.getToken();
    if (!token) throw new Error('Not authenticated');

    const headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || 'Request failed');
    }

    return response;
  }

  /**
   * Check if user needs to go through onboarding
   */
  async needsOnboarding(): Promise<boolean> {
    const response = await this.fetchWithAuth(`${API_URL}/onboarding/needs-onboarding`);
    const data = await response.json();
    return data.needsOnboarding;
  }

  /**
   * Get current onboarding status
   */
  async getStatus(): Promise<OnboardingStatus> {
    const response = await this.fetchWithAuth(`${API_URL}/onboarding/status`);
    return response.json();
  }

  /**
   * Start metadata-only scan of user's Google Drive
   * This does NOT read file contents - only metadata
   */
  async startMetadataScan(): Promise<{ message: string; scanId: string }> {
    const response = await this.fetchWithAuth(`${API_URL}/onboarding/metadata-scan`, {
      method: 'POST',
    });
    return response.json();
  }

  /**
   * Get metadata scan progress
   */
  async getMetadataScanProgress(): Promise<MetadataScanProgressResponse> {
    const response = await this.fetchWithAuth(`${API_URL}/onboarding/metadata-scan-progress`);
    return response.json();
  }

  /**
   * Get live scan stats (for real-time updates during scanning)
   */
  async getLiveScanStats(): Promise<{
    filesScanned: number;
    supportedCount: number;
    unsupportedCount: number;
    sharedCount: number;
    collaboratorCount: number;
    totalSizeBytes: number;
  }> {
    const response = await this.fetchWithAuth(`${API_URL}/onboarding/live-scan-stats`);
    return response.json();
  }

  /**
   * Get the drive snapshot (metadata scan results)
   */
  async getDriveSnapshot(): Promise<DriveSnapshotResponse> {
    const response = await this.fetchWithAuth(`${API_URL}/onboarding/drive-snapshot`);
    return response.json();
  }

  /**
   * Complete review - marks that user has reviewed scan results and moves to step 3
   */
  async completeReview(): Promise<{ message: string }> {
    const response = await this.fetchWithAuth(`${API_URL}/onboarding/complete-review`, {
      method: 'POST',
    });
    return response.json();
  }

  /**
   * Confirm processing - CRITICAL: After this, content processing begins
   */
  async confirmProcessing(options?: ProcessingOptions): Promise<{ message: string; processingStartedAt: string }> {
    const response = await this.fetchWithAuth(`${API_URL}/onboarding/confirm-processing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ options }),
    });
    return response.json();
  }

  /**
   * Get processing progress
   */
  async getProgress(): Promise<ProcessingProgressResponse> {
    const response = await this.fetchWithAuth(`${API_URL}/onboarding/progress`);
    return response.json();
  }
}

export const onboardingApi = new OnboardingApi();
