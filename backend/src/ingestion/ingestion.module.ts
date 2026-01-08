import { Module } from '@nestjs/common';
import { IngestionListener } from './ingestion.listener';
import { EmbeddingModule } from '../embedding/embedding.module';
import { WeaviateModule } from '../weaviate/weaviate.module';
import { LlmModule } from '../llm/llm.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [EmbeddingModule, WeaviateModule, LlmModule, DatabaseModule],
  providers: [IngestionListener],
})
export class IngestionModule {}

