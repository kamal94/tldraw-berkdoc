import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { BoardsService } from './boards.service';
import { BoardsRoomManager } from './boards.room-manager';
import { BoardsGateway } from './boards.gateway';
import { BoardsListener } from './boards.listener';
import { BoardsController } from './boards.controller';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'default-secret',
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [BoardsController],
  providers: [BoardsRoomManager, BoardsService, BoardsGateway, BoardsListener],
  exports: [BoardsService, BoardsRoomManager],
})
export class BoardsModule {}
