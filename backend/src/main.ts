import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { Server } from 'http';
import { AppModule } from './app.module';
import { AppGateway } from './app/app.gateway';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);

  // Cloud mode: the app-notifications WebSocket shares the main HTTP port via
  // APP_WS_PATH so it is reachable through the Container front Worker.
  if (process.env.APP_WS_PATH) {
    app.get(AppGateway).attachToServer(app.getHttpServer() as Server);
  }

  console.log(`🚀 Application is running on: http://localhost:${port}`);
}

bootstrap();

