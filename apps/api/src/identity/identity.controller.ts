import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { loginInputSchema, registerInputSchema } from '@marxmatrix/contracts';
import { createZodDto } from '../common/zod-validation.pipe.js';
import { AuthGuard } from './auth.guard.js';
import { CurrentUser } from './current-user.decorator.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { IdentityService } from './identity.service.js';
import { ConfigService } from '@nestjs/config';

class RegisterBody extends createZodDto(registerInputSchema) {}
class LoginBody extends createZodDto(loginInputSchema) {}
@Controller('auth')
export class IdentityController {
  public constructor(
    private readonly identity: IdentityService,
    private readonly config: ConfigService
  ) {}
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() body: RegisterBody, @Res({ passthrough: true }) response: Response) {
    return this.withCookie(await this.identity.register(body), response);
  }
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() body: LoginBody, @Res({ passthrough: true }) response: Response) {
    return this.withCookie(await this.identity.login(body), response);
  }
  @Post('refresh') async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.withCookie(await this.identity.refresh(this.refreshCookie(request)), response);
  }
  @Post('logout') async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    await this.identity.logout(this.refreshCookie(request));
    response.clearCookie(this.cookieName(), this.cookieOptions());
    return { ok: true };
  }
  @Get('me') @UseGuards(AuthGuard) async me(@CurrentUser() user: AuthenticatedUser) {
    return { user: await this.identity.me(user.id) };
  }
  private withCookie(result: Awaited<ReturnType<IdentityService['login']>>, response: Response) {
    response.cookie(this.cookieName(), result.refreshToken, this.cookieOptions());
    return { accessToken: result.accessToken, user: result.user };
  }
  private cookieName(): string {
    return this.config.getOrThrow<string>('AUTH_COOKIE_NAME');
  }
  private refreshCookie(request: Request): string | undefined {
    const cookie: unknown = request.cookies?.[this.cookieName()];
    return typeof cookie === 'string' ? cookie : undefined;
  }
  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.getOrThrow<boolean>('COOKIE_SECURE'),
      sameSite: this.config.getOrThrow<'lax' | 'strict' | 'none'>('AUTH_COOKIE_SAME_SITE'),
      path: '/api/v1/auth',
      maxAge: this.config.getOrThrow<number>('JWT_REFRESH_MAX_AGE_MS')
    };
  }
}
