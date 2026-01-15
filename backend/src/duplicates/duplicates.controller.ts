import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { DuplicatesService } from './duplicates.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type CurrentUserData } from '../auth/decorators/current-user.decorator';
import type {
  DuplicateResponseDto,
  DetectDuplicatesResponseDto,
} from './dto/duplicate.dto';

@Controller('duplicates')
@UseGuards(JwtAuthGuard)
export class DuplicatesController {
  constructor(private duplicatesService: DuplicatesService) { }

  private readonly logger = new Logger(DuplicatesController.name);

  @Post('detect/:userId')
  @HttpCode(HttpStatus.ACCEPTED)
  async detectDuplicates(
    @CurrentUser() user: CurrentUserData,
    @Param('userId') userId: string,
  ): Promise<DetectDuplicatesResponseDto> {
    if (user.id !== userId) {
      this.logger.error('Unauthorized: Can only detect duplicates for your own documents', {
        userId,
        currentUserId: user.id,
      });
      throw new ForbiddenException('Can only detect duplicates for your own documents');
    }

    // Trigger detection asynchronously
    this.duplicatesService
      .detectAllDuplicates(userId)
      .then((result) => {
        this.logger.log(
          `Duplicate detection completed for user ${userId}: ${result.chunkDuplicates} chunk duplicates, ${result.documentDuplicates} document duplicates`,
        );
      })
      .catch((error) => {
        this.logger.error(`Failed to detect duplicates for user ${userId}`, error);
      });

    return {
      message: 'Duplicate detection job queued successfully',
    };
  }

  @Get('document/:documentId')
  async getDuplicatesForDocument(
    @CurrentUser() user: CurrentUserData,
    @Param('documentId') documentId: string,
  ): Promise<DuplicateResponseDto[]> {
    return this.duplicatesService.findDuplicatesForDocument(user.id, documentId);
  }

  @Get('user/:userId')
  async getDuplicatesForUser(
    @CurrentUser() user: CurrentUserData,
    @Param('userId') userId: string,
  ): Promise<DuplicateResponseDto[]> {
    if (user.id !== userId) {
      throw new ForbiddenException('Can only view duplicates for your own documents');
    }

    return this.duplicatesService.findDuplicatesForUser(userId);
  }

  @Delete('user/:userId')
  @HttpCode(HttpStatus.OK)
  async clearDuplicatesForUser(
    @CurrentUser() user: CurrentUserData,
    @Param('userId') userId: string,
  ): Promise<{ message: string; deletedCount: number }> {
    if (user.id !== userId) {
      this.logger.error('Unauthorized: Can only clear duplicates for your own documents', {
        userId,
        currentUserId: user.id,
      });
      throw new ForbiddenException('Can only clear duplicates for your own documents');
    }

    const deletedCount = await this.duplicatesService.clearDuplicatesForUser(userId);
    return {
      message: `Successfully cleared ${deletedCount} duplicate records`,
      deletedCount,
    };
  }
}
