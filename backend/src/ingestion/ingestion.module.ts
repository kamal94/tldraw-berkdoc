import { Module } from '@nestjs/common';
import { IngestionListener } from './ingestion.listener';

@Module({
  providers: [IngestionListener],
})
export class IngestionModule {}

