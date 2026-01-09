import { Module } from '@nestjs/common';
import { GoogleDriveService } from './google-drive.service';
import { GoogleDriveController } from './google-drive.controller';
import { GoogleDriveSyncListener } from './google-drive.listener';
import { DatabaseModule } from '../database/database.module';
import { DocumentsModule } from '../documents/documents.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [DatabaseModule, DocumentsModule, QueueModule],
  controllers: [GoogleDriveController],
  providers: [GoogleDriveService, GoogleDriveSyncListener],
  exports: [GoogleDriveService],
})
export class GoogleDriveModule {}

