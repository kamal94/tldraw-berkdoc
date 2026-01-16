import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService, type OnboardingRow } from '../database/database.service';
import { checkPlanLimits } from './plan-limits';
import {
  MetadataScanRequestedEvent,
  ProcessingConfirmedEvent,
} from './events/onboarding.events';
import type {
  OnboardingStep,
  OnboardingStatusResponseDto,
  DriveSnapshotResponseDto,
  ProcessingProgressResponseDto,
  MetadataScanProgressResponseDto,
  ProcessingOptions,
  DriveMetadataSnapshot,
  // FileTypeBreakdown,
} from './dto/onboarding.dto';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private databaseService: DatabaseService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Get or create onboarding record for a user
   */
  getOrCreateOnboarding(userId: string): OnboardingRow {
    let onboarding = this.databaseService.findOnboardingByUserId(userId);

    if (!onboarding) {
      const id = `onboard_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      this.databaseService.createOnboarding({
        id,
        userId,
        driveConnectedAt: new Date().toISOString(),
      });
      onboarding = this.databaseService.findOnboardingByUserId(userId)!;
      this.logger.log(`Created onboarding record for user ${userId}`);
    }

    return onboarding;
  }

  /**
   * Get onboarding record by user ID
   */
  findByUserId(userId: string): OnboardingRow | null {
    return this.databaseService.findOnboardingByUserId(userId);
  }

  /**
   * Determine the current onboarding step based on state
   */
  determineStep(onboarding: OnboardingRow): OnboardingStep {
    // If processing is complete, user is done
    if (onboarding.processing_completed_at) {
      return 'complete';
    }

    // If processing has started, user is in processing step
    if (onboarding.processing_started_at) {
      return 'processing';
    }

    // If user has confirmed processing, move to processing
    if (onboarding.processing_confirmed_at) {
      return 'processing';
    }

    // If metadata scan is complete AND user has reviewed, user is in prepare step
    if (onboarding.metadata_scan_completed_at && onboarding.review_completed_at) {
      return 'prepare';
    }

    // If metadata scan is complete but user hasn't reviewed yet, stay in review step
    // OR if metadata scan has started but not complete, user is in review step
    if (onboarding.metadata_scan_started_at) {
      return 'review';
    }

    // If drive is connected but no scan started, user is in connect step
    // (they need to start the scan)
    return 'connect';
  }

  /**
   * Get full onboarding status for a user
   */
  getStatus(userId: string): OnboardingStatusResponseDto {
    const onboarding = this.getOrCreateOnboarding(userId);
    const step = this.determineStep(onboarding);

    const isScanning = !!(
      onboarding.metadata_scan_started_at &&
      !onboarding.metadata_scan_completed_at
    );

    const isProcessing = !!(
      onboarding.processing_started_at &&
      !onboarding.processing_completed_at
    );

    return {
      step,
      driveConnectedAt: onboarding.drive_connected_at,
      metadataScanStartedAt: onboarding.metadata_scan_started_at,
      metadataScanCompletedAt: onboarding.metadata_scan_completed_at,
      processingConfirmedAt: onboarding.processing_confirmed_at,
      processingStartedAt: onboarding.processing_started_at,
      processingCompletedAt: onboarding.processing_completed_at,
      hasSnapshot: !!onboarding.metadata_scan_completed_at,
      isScanning,
      isProcessing,
    };
  }

  /**
   * Start metadata scan for a user's Drive
   */
  async startMetadataScan(userId: string): Promise<string> {
    const onboarding = this.getOrCreateOnboarding(userId);

    // Don't allow re-scanning if already processing
    if (onboarding.processing_confirmed_at) {
      throw new BadRequestException('Cannot rescan after processing has been confirmed');
    }

    const scanId = `scan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    // Mark scan as started
    this.databaseService.updateOnboarding(userId, {
      metadataScanStartedAt: now,
    });

    // Emit event to trigger the scan
    this.eventEmitter.emit(
      'onboarding.metadata.scan.requested',
      new MetadataScanRequestedEvent(userId, scanId),
    );

    this.logger.log(`Started metadata scan ${scanId} for user ${userId}`);
    return scanId;
  }

  /**
   * Update onboarding with metadata scan results
   * @param isComplete - If true, marks the scan as completed. Should only be true on final update.
   * Note: fileTypeBreakdown is now computed from documents table, not stored
   */
  updateMetadataSnapshot(
    userId: string,
    snapshot: {
      totalFileCount: number;
      totalSizeBytes: number;
      folderCount: number;
      supportedFileCount: number;
      supportedSizeBytes: number;
      unsupportedFileCount: number;
      sharedDocCount: number;
      uniqueCollaboratorCount: number;
    },
    isComplete = false,
  ): void {
    const updateData: Parameters<typeof this.databaseService.updateOnboarding>[1] = {
      totalFileCount: snapshot.totalFileCount,
      totalSizeBytes: snapshot.totalSizeBytes,
      folderCount: snapshot.folderCount,
      supportedFileCount: snapshot.supportedFileCount,
      supportedSizeBytes: snapshot.supportedSizeBytes,
      unsupportedFileCount: snapshot.unsupportedFileCount,
      sharedDocCount: snapshot.sharedDocCount,
      uniqueCollaboratorCount: snapshot.uniqueCollaboratorCount,
    };

    // Only set completion timestamp when scan is actually complete
    if (isComplete) {
      const now = new Date().toISOString();
      updateData.metadataScanCompletedAt = now;
    }

    this.databaseService.updateOnboarding(userId, updateData);

    this.logger.log(
      `Updated metadata snapshot for user ${userId}: ${snapshot.supportedFileCount} supported files${isComplete ? ' (scan complete)' : ''}`,
    );
  }

  /**
   * Get the drive snapshot for a user
   * Works during scanning (returns partial data) or after completion
   * File type breakdown is now computed from documents table
   */
  getDriveSnapshot(userId: string): DriveSnapshotResponseDto {
    const onboarding = this.databaseService.findOnboardingByUserId(userId);

    if (!onboarding) {
      throw new NotFoundException('Onboarding not found');
    }

    // Allow getting snapshot even during scanning for live updates
    if (!onboarding.metadata_scan_started_at) {
      throw new BadRequestException('Metadata scan has not been started');
    }

    // Compute file type breakdown from documents table
    const fileTypeBreakdown = this.databaseService.computeFileTypeBreakdown(userId);

    const snapshot: DriveMetadataSnapshot = {
      totalFileCount: onboarding.total_file_count || 0,
      totalSizeBytes: onboarding.total_size_bytes || 0,
      folderCount: onboarding.folder_count || 0,
      supportedFileCount: onboarding.supported_file_count || 0,
      supportedSizeBytes: onboarding.supported_size_bytes || 0,
      unsupportedFileCount: onboarding.unsupported_file_count || 0,
      sharedDocCount: onboarding.shared_doc_count || 0,
      uniqueCollaboratorCount: onboarding.unique_collaborator_count || 0,
      fileTypeBreakdown,
    };

    const planLimits = checkPlanLimits(
      snapshot.supportedFileCount,
      snapshot.supportedSizeBytes,
    );

    return {
      snapshot,
      planLimits,
      scannedAt: onboarding.metadata_scan_completed_at || onboarding.metadata_scan_started_at || new Date().toISOString(),
    };
  }

  /**
   * Mark review as completed - moves user from step 2 to step 3
   */
  completeReview(userId: string): void {
    const onboarding = this.databaseService.findOnboardingByUserId(userId);

    if (!onboarding) {
      throw new NotFoundException('Onboarding not found');
    }

    if (!onboarding.metadata_scan_completed_at) {
      throw new BadRequestException('Cannot complete review before metadata scan is complete');
    }

    if (onboarding.review_completed_at) {
      // Already completed, no-op
      return;
    }

    const now = new Date().toISOString();
    this.databaseService.updateOnboarding(userId, {
      reviewCompletedAt: now,
    });
  }

  /**
   * Confirm processing - this is the critical gate before content processing begins
   */
  async confirmProcessing(userId: string, options?: ProcessingOptions): Promise<string> {
    const onboarding = this.databaseService.findOnboardingByUserId(userId);

    if (!onboarding) {
      throw new NotFoundException('Onboarding not found');
    }

    if (!onboarding.metadata_scan_completed_at) {
      throw new BadRequestException('Metadata scan must be completed before confirming processing');
    }

    if (onboarding.processing_confirmed_at) {
      throw new BadRequestException('Processing has already been confirmed');
    }

    const now = new Date().toISOString();

    // Update onboarding with confirmation
    this.databaseService.updateOnboarding(userId, {
      processingConfirmedAt: now,
      processingStartedAt: now,
      processingOptions: options || {},
      filesTotal: onboarding.supported_file_count || 0,
      filesProcessed: 0,
    });

    // Emit event to start processing
    this.eventEmitter.emit(
      'onboarding.processing.confirmed',
      new ProcessingConfirmedEvent(userId, options || {}),
    );

    this.logger.log(`Processing confirmed for user ${userId}`);
    return now;
  }

  /**
   * Get processing progress for a user
   */
  getProgress(userId: string): ProcessingProgressResponseDto {
    let onboarding = this.databaseService.findOnboardingByUserId(userId);

    if (!onboarding) {
      throw new NotFoundException('Onboarding not found');
    }

    const filesProcessed = onboarding.files_processed || 0;
    const filesTotal = onboarding.files_total || 0;
    const percentComplete = filesTotal > 0 ? Math.round((filesProcessed / filesTotal) * 100) : 0;
    let isComplete = !!onboarding.processing_completed_at;

    const AUTO_COMPLETE_THRESHOLD = 0.99;
    if (!isComplete && filesTotal > 0) {
      const actualPercent = filesProcessed / filesTotal;
      if (actualPercent >= AUTO_COMPLETE_THRESHOLD) {
        this.logger.log(
          `Auto-completing onboarding for user ${userId}: ${filesProcessed}/${filesTotal} (${(actualPercent * 100).toFixed(2)}%)`,
        );
        this.markProcessingComplete(userId);
        onboarding = this.databaseService.findOnboardingByUserId(userId);
        isComplete = true;
      }
    }

    return {
      progress: {
        filesProcessed,
        filesTotal,
        percentComplete,
        isComplete,
        startedAt: onboarding.processing_started_at,
        completedAt: onboarding.processing_completed_at,
      },
    };
  }

  /**
   * Get metadata scan progress for a user
   */
  getMetadataScanProgress(userId: string): MetadataScanProgressResponseDto {
    const onboarding = this.databaseService.findOnboardingByUserId(userId);

    if (!onboarding) {
      throw new NotFoundException('Onboarding not found');
    }

    // Get actual count from documents table
    const filesScanned = this.databaseService.countDocumentsWithMetadata(userId);
    const isComplete = !!onboarding.metadata_scan_completed_at;

    return {
      progress: {
        filesScanned,
        isComplete,
      },
    };
  }

  /**
   * Get live scan stats from onboarding table (for real-time updates during scanning)
   */
  getLiveScanStats(userId: string): {
    filesScanned: number;
    supportedCount: number;
    unsupportedCount: number;
    sharedCount: number;
    collaboratorCount: number;
    totalSizeBytes: number;
  } {
    const onboarding = this.databaseService.findOnboardingByUserId(userId);
    
    if (!onboarding) {
      return {
        filesScanned: 0,
        supportedCount: 0,
        unsupportedCount: 0,
        sharedCount: 0,
        collaboratorCount: 0,
        totalSizeBytes: 0,
      };
    }

    // Get actual count from documents table
    const filesScanned = this.databaseService.countDocumentsWithMetadata(userId);

    // Use aggregated counts from onboarding table (updated incrementally)
    return {
      filesScanned,
      supportedCount: onboarding.supported_file_count || 0,
      unsupportedCount: onboarding.unsupported_file_count || 0,
      sharedCount: onboarding.shared_doc_count || 0,
      collaboratorCount: onboarding.unique_collaborator_count || 0,
      totalSizeBytes: onboarding.total_size_bytes || 0,
    };
  }

  /**
   * Mark a file as processed and update progress
   */
  markFileProcessed(userId: string): void {
    this.databaseService.incrementFilesProcessed(userId);
  }

  /**
   * Mark processing as complete
   */
  markProcessingComplete(userId: string): void {
    const now = new Date().toISOString();
    this.databaseService.updateOnboarding(userId, {
      processingCompletedAt: now,
    });
    this.logger.log(`Processing completed for user ${userId}`);
  }

  /**
   * Check if user has confirmed processing (used as gate check)
   */
  hasConfirmedProcessing(userId: string): boolean {
    const onboarding = this.databaseService.findOnboardingByUserId(userId);
    return !!onboarding?.processing_confirmed_at;
  }

  /**
   * Check if user needs onboarding (new user check)
   */
  needsOnboarding(userId: string): boolean {
    const onboarding = this.databaseService.findOnboardingByUserId(userId);

    if (!onboarding) {
      const existingDocs = this.databaseService.findDocumentsByUserId(userId);
      return existingDocs.length === 0;
    }

    return !onboarding.processing_completed_at;
  }

  // ============================================
  // TELEMETRY & COST ESTIMATION
  // ============================================

  /**
   * Cost estimation constants (approximate)
   * These are rough estimates for planning purposes
   */
  private static readonly COST_PER_EMBEDDING = 0.0001; // ~$0.0001 per embedding (1536 dims)
  private static readonly COST_PER_LLM_CALL = 0.002; // ~$0.002 per tags/summary call
  private static readonly AVG_CHUNKS_PER_DOC = 5; // Average number of chunks per document
  private static readonly LLM_CALLS_PER_DOC = 2; // tags + summary

  /**
   * Estimate processing cost for a user based on their snapshot
   */
  estimateProcessingCost(supportedFileCount: number): number {
    const embeddingCost =
      OnboardingService.COST_PER_EMBEDDING *
      OnboardingService.AVG_CHUNKS_PER_DOC *
      supportedFileCount;
    const llmCost =
      OnboardingService.COST_PER_LLM_CALL *
      supportedFileCount *
      OnboardingService.LLM_CALLS_PER_DOC;

    return embeddingCost + llmCost;
  }

  /**
   * Update estimated cost after metadata scan
   */
  updateEstimatedCost(userId: string, supportedFileCount: number): void {
    const estimatedCost = this.estimateProcessingCost(supportedFileCount);
    this.databaseService.updateOnboarding(userId, {
      estimatedCostUsd: estimatedCost,
    });
  }

  /**
   * Get telemetry data for a single user
   */
  getTelemetryForUser(userId: string): UserTelemetry | null {
    const onboarding = this.databaseService.findOnboardingByUserId(userId);
    if (!onboarding) return null;

    const sharedDocRatio =
      onboarding.supported_file_count && onboarding.shared_doc_count
        ? onboarding.shared_doc_count / onboarding.supported_file_count
        : 0;

    return {
      userId,
      totalFiles: onboarding.total_file_count || 0,
      processableFileCount: onboarding.supported_file_count || 0,
      processableSizeGb: (onboarding.supported_size_bytes || 0) / (1024 * 1024 * 1024),
      sharedDocRatio,
      collaboratorCount: onboarding.unique_collaborator_count || 0,
      estimatedCostUsd: onboarding.estimated_cost_usd || 0,
      actualCostUsd: onboarding.actual_cost_usd || 0,
      currentStep: this.determineStep(onboarding),
      droppedOff: this.didDropOff(onboarding),
      dropOffStep: this.getDropOffStep(onboarding),
      createdAt: onboarding.created_at,
      updatedAt: onboarding.updated_at,
    };
  }

  /**
   * Check if user dropped off during onboarding
   */
  private didDropOff(onboarding: OnboardingRow): boolean {
    if (onboarding.processing_completed_at) {
      return false;
    }

    const DROP_OFF_DAYS = 7;
    const dropOffThreshold = new Date(Date.now() - DROP_OFF_DAYS * 24 * 60 * 60 * 1000).toISOString();

    if (
      onboarding.metadata_scan_completed_at &&
      !onboarding.processing_confirmed_at &&
      onboarding.metadata_scan_completed_at < dropOffThreshold
    ) {
      return true;
    }

    return false;
  }

  /**
   * Get the step where user dropped off
   */
  private getDropOffStep(onboarding: OnboardingRow): OnboardingStep | null {
    if (!this.didDropOff(onboarding)) {
      return null;
    }

    if (onboarding.metadata_scan_completed_at && !onboarding.processing_confirmed_at) {
      return 'prepare';
    }

    if (onboarding.metadata_scan_started_at && !onboarding.metadata_scan_completed_at) {
      return 'review';
    }

    return 'connect';
  }

  /**
   * Get aggregate telemetry stats (for founders)
   */
  getAggregateTelemetry(): AggregateTelemetry {
    const db = this.databaseService.getDatabase();
    const allOnboarding = db.query('SELECT * FROM onboarding').all() as OnboardingRow[];

    if (allOnboarding.length === 0) {
      return this.createEmptyTelemetry();
    }

    const userCounts = this.calculateUserCounts(allOnboarding);
    const dropOffRate = this.calculateDropOffRate(userCounts.usersWithScan, userCounts.usersConfirmed);
    const averages = this.calculateAverages(allOnboarding);
    const costs = this.calculateTotalCosts(allOnboarding);

    return {
      totalUsers: allOnboarding.length,
      ...userCounts,
      dropOffRate,
      ...averages,
      ...costs,
    };
  }

  private createEmptyTelemetry(): AggregateTelemetry {
    return {
      totalUsers: 0,
      usersWithScan: 0,
      usersConfirmed: 0,
      usersCompleted: 0,
      dropOffRate: 0,
      avgProcessableFiles: 0,
      avgProcessableSizeGb: 0,
      avgCollaborators: 0,
      totalEstimatedCostUsd: 0,
      totalActualCostUsd: 0,
    };
  }

  private calculateUserCounts(onboarding: OnboardingRow[]): {
    usersWithScan: number;
    usersConfirmed: number;
    usersCompleted: number;
  } {
    return {
      usersWithScan: onboarding.filter((o) => o.metadata_scan_completed_at).length,
      usersConfirmed: onboarding.filter((o) => o.processing_confirmed_at).length,
      usersCompleted: onboarding.filter((o) => o.processing_completed_at).length,
    };
  }

  private calculateDropOffRate(usersWithScan: number, usersConfirmed: number): number {
    if (usersWithScan === 0) return 0;
    return (usersWithScan - usersConfirmed) / usersWithScan;
  }

  private calculateAverages(onboarding: OnboardingRow[]): {
    avgProcessableFiles: number;
    avgProcessableSizeGb: number;
    avgCollaborators: number;
  } {
    const withSnapshotData = onboarding.filter((o) => o.supported_file_count);
    if (withSnapshotData.length === 0) {
      return {
        avgProcessableFiles: 0,
        avgProcessableSizeGb: 0,
        avgCollaborators: 0,
      };
    }

    const BYTES_PER_GB = 1024 * 1024 * 1024;

    return {
      avgProcessableFiles:
        withSnapshotData.reduce((sum, o) => sum + (o.supported_file_count || 0), 0) /
        withSnapshotData.length,
      avgProcessableSizeGb:
        withSnapshotData.reduce((sum, o) => sum + (o.supported_size_bytes || 0) / BYTES_PER_GB, 0) /
        withSnapshotData.length,
      avgCollaborators:
        withSnapshotData.reduce((sum, o) => sum + (o.unique_collaborator_count || 0), 0) /
        withSnapshotData.length,
    };
  }

  private calculateTotalCosts(onboarding: OnboardingRow[]): {
    totalEstimatedCostUsd: number;
    totalActualCostUsd: number;
  } {
    return {
      totalEstimatedCostUsd: onboarding.reduce((sum, o) => sum + (o.estimated_cost_usd || 0), 0),
      totalActualCostUsd: onboarding.reduce((sum, o) => sum + (o.actual_cost_usd || 0), 0),
    };
  }
}

// Telemetry types
export interface UserTelemetry {
  userId: string;
  totalFiles: number;
  processableFileCount: number;
  processableSizeGb: number;
  sharedDocRatio: number;
  collaboratorCount: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  currentStep: OnboardingStep;
  droppedOff: boolean;
  dropOffStep: OnboardingStep | null;
  createdAt: string;
  updatedAt: string;
}

export interface AggregateTelemetry {
  totalUsers: number;
  usersWithScan: number;
  usersConfirmed: number;
  usersCompleted: number;
  dropOffRate: number;
  avgProcessableFiles: number;
  avgProcessableSizeGb: number;
  avgCollaborators: number;
  totalEstimatedCostUsd: number;
  totalActualCostUsd: number;
}
