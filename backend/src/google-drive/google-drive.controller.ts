import { Controller, Post, UseGuards } from '@nestjs/common';
import { EventBusService } from '../events/event-bus.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '../auth/entities/user.entity';
import { GoogleDriveSyncRequestedEvent } from './events/google-drive.events';

@Controller('google-drive')
@UseGuards(JwtAuthGuard)
export class GoogleDriveController {
  constructor(private eventBus: EventBusService) {}

  @Post('sync')
  async sync(@CurrentUser() user: User) {
    await this.eventBus.publish(
      'google.drive.sync.requested',
      new GoogleDriveSyncRequestedEvent(user.id),
    );
    return { message: 'Sync process initiated' };
  }
}

