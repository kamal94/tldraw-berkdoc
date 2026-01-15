import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AvatarsService } from './avatars.service';
import { AvatarsController } from './avatars.controller';
import { DatabaseBlobAdapter } from './storage/database-blob.adapter';

@Module({
  imports: [DatabaseModule],
  controllers: [AvatarsController],
  providers: [
    AvatarsService,
    DatabaseBlobAdapter,
    {
      provide: 'AvatarStorageAdapter',
      useClass: DatabaseBlobAdapter,
    },
  ],
  exports: [AvatarsService],
})
export class AvatarsModule {}
