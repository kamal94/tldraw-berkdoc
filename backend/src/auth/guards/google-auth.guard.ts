import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  override getAuthenticateOptions(_context: ExecutionContext) {
    return {
      accessType: 'offline',
      prompt: 'consent',
    };
  }
}

