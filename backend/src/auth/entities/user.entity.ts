export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  provider: 'local' | 'google';
  providerId?: string;
  passwordHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface JwtPayload {
  sub: string; // user id
  email: string;
  name: string;
}

