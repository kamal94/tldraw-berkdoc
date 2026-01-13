import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { EmbeddingModule } from '../embedding/embedding.module';
import { WeaviateModule } from '../weaviate/weaviate.module';
import { DocumentsModule } from '../documents/documents.module';
import { BoardsModule } from '../boards/boards.module';
import { AppGateway } from './app.gateway';
import { SmartExplorerService } from './smart-explorer.service';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    EmbeddingModule,
    WeaviateModule,
    DocumentsModule,
    BoardsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'default-secret',
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  providers: [AppGateway, SmartExplorerService],
  exports: [AppGateway],
})
export class AppModule {}
