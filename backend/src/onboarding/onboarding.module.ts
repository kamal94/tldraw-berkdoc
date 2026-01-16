import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { OnboardingListener } from './onboarding.listener';
import { DatabaseModule } from '../database/database.module';
import { GoogleDriveModule } from '../google-drive/google-drive.module';

@Module({
  imports: [DatabaseModule, GoogleDriveModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, OnboardingListener],
  exports: [OnboardingService],
})
export class OnboardingModule {}
