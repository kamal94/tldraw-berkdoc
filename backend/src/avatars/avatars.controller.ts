import { Controller, Get, Param, Res, NotFoundException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { AvatarsService } from './avatars.service';

@Controller('avatars')
export class AvatarsController {
  private readonly logger = new Logger(AvatarsController.name);

  constructor(private readonly avatarsService: AvatarsService) {}

  @Public()
  @Get(':hash')
  async getAvatar(
    @Param('hash') hash: string,
    @Res() res: Response,
  ) {
    const googleUrl = res.req.query.url as string;

    if (!googleUrl) {
      throw new NotFoundException('Avatar URL not provided');
    }

    // Verify hash matches (optional security check)
    const expectedHash = this.avatarsService.generateHash(googleUrl);
    if (hash !== expectedHash) {
      this.logger.warn(
        `Hash mismatch: expected ${expectedHash}, got ${hash}`,
      );
    }

    try {
      const cached = await this.avatarsService.getCachedAvatar(googleUrl);

      if (!cached) {
        throw new NotFoundException('Avatar not found');
      }

      // Set headers for caching
      res.set({
        'Content-Type': cached.contentType,
        'Cache-Control': 'public, max-age=31536000', // 1 year
      });

      res.send(cached.buffer);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error serving avatar: ${error}`);
      throw new NotFoundException('Avatar not found');
    }
  }
}
