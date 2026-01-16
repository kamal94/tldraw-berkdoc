import { Module } from '@nestjs/common';
import { GoogleDriveService } from './google-drive.service';
import { GoogleDriveController } from './google-drive.controller';
import { GoogleDriveSyncListener } from './google-drive.listener';
import { DriveFileProcessorService } from './drive-file-processor.service';
import { DatabaseModule } from '../database/database.module';
import { DocumentsModule } from '../documents/documents.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [DatabaseModule, DocumentsModule, QueueModule],
  controllers: [GoogleDriveController],
  providers: [GoogleDriveService, GoogleDriveSyncListener, DriveFileProcessorService],
  exports: [GoogleDriveService, DriveFileProcessorService],
})
export class GoogleDriveModule {}

