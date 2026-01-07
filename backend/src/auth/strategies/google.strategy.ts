import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import type { User } from '../entities/user.entity';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID') || '',
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') || '',
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL') || 'http://localhost:3000/auth/google/callback',
      scope: ['email', 'profile', 'https://www.googleapis.com/auth/drive.readonly'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
  ): Promise<User> {
    try {
      this.logger.log("accessToken:", accessToken)
      this.logger.log("refreshToken:", refreshToken)
      this.logger.log("profile:", profile)
      // Note: params (containing expires_in) is not passed by default in this strategy's signature.
      // To get it, we would need to set passReqToCallback: true in the constructor.
      const user = await this.authService.findOrCreateGoogleUser(profile, {
        accessToken,
        refreshToken,
        expiresIn: 3600, // Defaulting to 1 hour as we don't have the params here
      });
      return user;
    } catch (error) {
      this.logger.error(`Google strategy validation error: ${error}`);
      throw new UnauthorizedException(error instanceof Error ? error.message : 'Failed to authenticate with Google');
    }
  }
}

