import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { DocumentsModule } from './documents/documents.module';
import { WeaviateModule } from './weaviate/weaviate.module';
import { EmbeddingModule } from './embedding/embedding.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { GoogleDriveModule } from './google-drive/google-drive.module';
import { LlmModule } from './llm/llm.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    AuthModule,
    DocumentsModule,
    WeaviateModule,
    EmbeddingModule,
    IngestionModule,
    GoogleDriveModule,
    LlmModule,
  ],
})
export class AppModule {}

