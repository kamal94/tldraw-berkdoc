import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '../auth/entities/user.entity';
import { OnboardingService, type AggregateTelemetry, type UserTelemetry } from './onboarding.service';
import type {
  OnboardingStatusResponseDto,
  DriveSnapshotResponseDto,
  ProcessingProgressResponseDto,
  MetadataScanProgressResponseDto,
  ConfirmProcessingRequestDto,
  StartMetadataScanResponseDto,
  ConfirmProcessingResponseDto,
} from './dto/onboarding.dto';

@Controller('onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private onboardingService: OnboardingService) {}

  /**
   * Get current onboarding status for the authenticated user
   */
  @Get('status')
  getStatus(@CurrentUser() user: User): OnboardingStatusResponseDto {
    return this.onboardingService.getStatus(user.id);
  }

  /**
   * Check if user needs onboarding
   */
  @Get('needs-onboarding')
  needsOnboarding(@CurrentUser() user: User): { needsOnboarding: boolean } {
    return {
      needsOnboarding: this.onboardingService.needsOnboarding(user.id),
    };
  }

  /**
   * Start metadata-only scan of user's Google Drive
   * This does NOT read file contents - only metadata
   */
  @Post('metadata-scan')
  async startMetadataScan(@CurrentUser() user: User): Promise<StartMetadataScanResponseDto> {
    const scanId = await this.onboardingService.startMetadataScan(user.id);
    return {
      message: 'Metadata scan started. This will scan file metadata only, not content.',
      scanId,
    };
  }

  /**
   * Get metadata scan progress
   */
  @Get('metadata-scan-progress')
  getMetadataScanProgress(@CurrentUser() user: User): MetadataScanProgressResponseDto {
    return this.onboardingService.getMetadataScanProgress(user.id);
  }

  /**
   * Get live scan stats (for real-time updates during scanning)
   */
  @Get('live-scan-stats')
  getLiveScanStats(@CurrentUser() user: User) {
    return this.onboardingService.getLiveScanStats(user.id);
  }

  /**
   * Get the drive snapshot (metadata scan results)
   */
  @Get('drive-snapshot')
  getDriveSnapshot(@CurrentUser() user: User): DriveSnapshotResponseDto {
    return this.onboardingService.getDriveSnapshot(user.id);
  }

  /**
   * Complete review - marks that user has reviewed scan results and moves to step 3
   */
  @Post('complete-review')
  completeReview(@CurrentUser() user: User): { message: string } {
    this.onboardingService.completeReview(user.id);
    return {
      message: 'Review completed. You can now proceed to prepare your documents.',
    };
  }

  /**
   * Confirm processing - this is the CRITICAL gate
   * After this, content processing (embeddings, LLM) will begin
   */
  @Post('confirm-processing')
  async confirmProcessing(
    @CurrentUser() user: User,
    @Body() body: ConfirmProcessingRequestDto,
  ): Promise<ConfirmProcessingResponseDto> {
    const startedAt = await this.onboardingService.confirmProcessing(user.id, body.options);
    return {
      message: 'Processing confirmed. Document content processing will now begin.',
      processingStartedAt: startedAt,
    };
  }

  /**
   * Get processing progress
   */
  @Get('progress')
  getProgress(@CurrentUser() user: User): ProcessingProgressResponseDto {
    return this.onboardingService.getProgress(user.id);
  }

  // ============================================
  // TELEMETRY ENDPOINTS (for founders/admins)
  // ============================================

  /**
   * Get telemetry data for the current user
   */
  @Get('telemetry/me')
  getMyTelemetry(@CurrentUser() user: User): UserTelemetry | null {
    return this.onboardingService.getTelemetryForUser(user.id);
  }

  /**
   * Get aggregate telemetry stats
   * Note: In production, this should be protected by admin-only guard
   */
  @Get('telemetry/aggregate')
  getAggregateTelemetry(): AggregateTelemetry {
    return this.onboardingService.getAggregateTelemetry();
  }
}
