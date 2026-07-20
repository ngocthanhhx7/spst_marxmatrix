import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AuthenticatedUser } from './authenticated-user.js';

@Injectable()
export class AuthGuard implements CanActivate {
  public constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: { authorization?: string }; user?: AuthenticatedUser }>();
    const value = request.headers.authorization;
    if (value === undefined || !value.startsWith('Bearer '))
      throw new UnauthorizedException('Authentication is required.');
    try {
      request.user = await this.jwt.verifyAsync<AuthenticatedUser>(value.slice(7), {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET')
      });
      return true;
    } catch {
      throw new UnauthorizedException('Authentication is required.');
    }
  }
}
