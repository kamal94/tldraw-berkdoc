import { Module } from '@nestjs/common';
import { DuplicatesService } from './duplicates.service';
import { DuplicatesController } from './duplicates.controller';
import { DuplicatesListener } from './duplicates.listener';
import { DatabaseModule } from '../database/database.module';
import { WeaviateModule } from '../weaviate/weaviate.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [DatabaseModule, WeaviateModule, QueueModule],
  controllers: [DuplicatesController],
  providers: [DuplicatesService, DuplicatesListener],
  exports: [DuplicatesService],
})
export class DuplicatesModule {}
