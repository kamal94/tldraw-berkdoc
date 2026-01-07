import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService, type UserRow } from '../database/database.service';
import type { User, JwtPayload } from './entities/user.entity';
import type { RegisterDto, LoginDto, AuthResponseDto } from './dto/auth.dto';
import type { Profile } from 'passport-google-oauth20';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private databaseService: DatabaseService,
  ) {}

  private readonly logger = new Logger(AuthService.name);
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    // Check if email already exists
    const existingUser = this.databaseService.findUserByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const passwordHash = await this.hashPassword(dto.password);

    const user: User = {
      id: this.generateId(),
      email: dto.email,
      name: dto.name,
      provider: 'local',
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.databaseService.createUser({
      id: user.id,
      email: user.email,
      name: user.name,
      provider: user.provider,
      passwordHash: user.passwordHash,
    });

    return this.generateAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const userRow = this.databaseService.findUserByEmail(dto.email);
    if (!userRow || !userRow.password_hash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await this.verifyPassword(dto.password, userRow.password_hash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = this.rowToUser(userRow);
    return this.generateAuthResponse(user);
  }

  async findOrCreateGoogleUser(
    profile: Profile,
    tokens?: { accessToken: string; refreshToken?: string; expiresIn?: number },
  ): Promise<User> {
    const googleId = profile.id;
    const email = profile.emails?.[0]?.value;

    if (!email) {
      throw new UnauthorizedException('No email provided by Google');
    }

    const tokenExpiry = tokens?.expiresIn ? Date.now() + tokens.expiresIn * 1000 : undefined;

    // Check if user exists by Google ID
    const existingGoogleUser = this.databaseService.findUserByProviderId(googleId);
    if (existingGoogleUser) {
      // Update tokens if provided
      if (tokens) {
        this.databaseService.updateUser(existingGoogleUser.id, {
          googleAccessToken: tokens.accessToken,
          googleRefreshToken: tokens.refreshToken,
          googleTokenExpiry: tokenExpiry,
        });
      }
      return this.rowToUser(this.databaseService.findUserByProviderId(googleId)!);
    }

    // Check if user exists by email
    const existingEmailUser = this.databaseService.findUserByEmail(email);
    if (existingEmailUser) {
      // Link Google account to existing user
      this.databaseService.updateUser(existingEmailUser.id, {
        providerId: googleId,
        provider: 'google',
        avatarUrl: profile.photos?.[0]?.value,
        googleAccessToken: tokens?.accessToken,
        googleRefreshToken: tokens?.refreshToken,
        googleTokenExpiry: tokenExpiry,
      });
      return this.rowToUser(this.databaseService.findUserById(existingEmailUser.id)!);
    }

    // Create new user
    const user: User = {
      id: this.generateId(),
      email,
      name: profile.displayName || email.split('@')[0] || 'User',
      avatarUrl: profile.photos?.[0]?.value,
      provider: 'google',
      providerId: googleId,
      googleAccessToken: tokens?.accessToken,
      googleRefreshToken: tokens?.refreshToken,
      googleTokenExpiry: tokenExpiry,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.databaseService.createUser({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      provider: user.provider,
      providerId: user.providerId,
      googleAccessToken: user.googleAccessToken,
      googleRefreshToken: user.googleRefreshToken,
      googleTokenExpiry: user.googleTokenExpiry,
    });

    return user;
  }

  async validateUserById(userId: string): Promise<User | null> {
    const userRow = this.databaseService.findUserById(userId);
    if (!userRow) return null;
    return this.rowToUser(userRow);
  }

  generateAuthResponse(user: User): AuthResponseDto {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  private rowToUser(row: UserRow): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatar_url || undefined,
      provider: row.provider as 'local' | 'google',
      providerId: row.provider_id || undefined,
      passwordHash: row.password_hash || undefined,
      googleAccessToken: row.google_access_token || undefined,
      googleRefreshToken: row.google_refresh_token || undefined,
      googleTokenExpiry: row.google_token_expiry || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private generateId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + this.configService.get('JWT_SECRET'));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    const computedHash = await this.hashPassword(password);
    return computedHash === hash;
  }
}
