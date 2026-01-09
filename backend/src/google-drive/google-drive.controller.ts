import { Controller, Post, UseGuards } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '../auth/entities/user.entity';
import { GoogleDriveSyncRequestedEvent } from './events/google-drive.events';

@Controller('google-drive')
@UseGuards(JwtAuthGuard)
export class GoogleDriveController {
  constructor(private eventEmitter: EventEmitter2) {}

  @Post('sync')
  async sync(@CurrentUser() user: User) {
    this.eventEmitter.emit(
      'google.drive.sync.requested',
      new GoogleDriveSyncRequestedEvent(user.id),
    );
    return { message: 'Sync process initiated' };
  }
}

