import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { CurrentSession, CurrentUser, Public, TokenService } from '@nestjs/authentication';
import type { JwtClaims } from '@nestjs/authentication';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';

import {
  credentialsSchema,
  refreshSchema,
  type CredentialsBody,
  type RefreshBody,
} from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import type { AuthPrincipal } from './auth.types.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Public()
  @SkipThrottle({
    default: true,
    login: true,
    refresh: true,
    'refresh-token': true,
    logout: true,
  })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body({ schema: credentialsSchema }) body: CredentialsBody) {
    return this.auth.register(body);
  }

  @Public()
  @SkipThrottle({
    default: true,
    register: true,
    refresh: true,
    'refresh-token': true,
    logout: true,
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body({ schema: credentialsSchema }) body: CredentialsBody, @Req() request: Request) {
    return this.auth.login(body, this.clientIp(request));
  }

  @Public()
  @SkipThrottle({ default: true, register: true, login: true, logout: true })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body({ schema: refreshSchema }) body: RefreshBody) {
    const issued = await this.tokens.refresh(body.refreshToken);
    return {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      expiresIn: issued.expiresIn,
      tokenType: 'Bearer' as const,
    };
  }

  @Public()
  @SkipThrottle({
    default: true,
    register: true,
    login: true,
    refresh: true,
    'refresh-token': true,
  })
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body({ schema: refreshSchema }) body: RefreshBody): Promise<void> {
    await this.tokens.revoke(body.refreshToken);
  }

  @SkipThrottle({
    register: true,
    login: true,
    refresh: true,
    'refresh-token': true,
    logout: true,
  })
  @Get('session')
  session(@CurrentUser() user: AuthPrincipal, @CurrentSession() session: JwtClaims | null) {
    return {
      userId: user.id,
      deviceId: typeof session?.did === 'string' ? session.did : '',
      sessionId: typeof session?.sid === 'string' ? session.sid : '',
    };
  }

  private clientIp(request: Request): string {
    return request.ip && request.ip.length > 0 ? request.ip : 'unknown';
  }
}
