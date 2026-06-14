import { Logger, Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/database.service';
import { AvatarsService } from './avatars.service';
import { AvatarsController } from './avatars.controller';
import { DatabaseBlobAdapter } from './storage/database-blob.adapter';
import { createAvatarStorageAdapter } from './storage';

@Module({
  imports: [DatabaseModule],
  controllers: [AvatarsController],
  providers: [
    AvatarsService,
    DatabaseBlobAdapter,
    {
      provide: 'AvatarStorageAdapter',
      useFactory: (databaseService: DatabaseService) =>
        createAvatarStorageAdapter(
          databaseService,
          new Logger('AvatarStorage'),
        ),
      inject: [DatabaseService],
    },
  ],
  exports: [AvatarsService],
})
export class AvatarsModule {}
