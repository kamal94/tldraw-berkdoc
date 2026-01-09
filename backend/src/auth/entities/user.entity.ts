export class User {
  id!: string;
  email!: string;
  name!: string;
  avatarUrl?: string;
  provider!: 'local' | 'google';
  providerId?: string;
  passwordHash?: string;
  googleAccessToken?: string;
  googleRefreshToken?: string;
  googleTokenExpiry?: number;
  createdAt!: Date;
  updatedAt!: Date;
}

export interface JwtPayload {
  sub: string; // user id
  email: string;
  name: string;
}

