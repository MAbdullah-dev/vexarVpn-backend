import { createHash } from 'node:crypto';

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticationModule } from '@nestjs/authentication';

import type { AppEnv } from '../config/env.schema.js';
import { AUTH_AUDIENCE, AUTH_ISSUER } from './auth.constants.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { DeviceSessionService } from './device-session.service.js';
import { JwtAuth } from './jwt-auth.js';
import { LoginRiskThrottle, type LoginRiskOptions } from './login-risk.throttle.js';
import { PasswordService } from './password.service.js';
import { PrismaRefreshTokenStore } from './prisma-refresh-token.store.js';

const FIFTEEN_MINUTES_MS = 900_000;

export function throttleLimit(envName: string, fallback: number): () => number {
  return () => {
    const raw = process.env[envName];
    if (raw === undefined || raw.trim().length === 0) {
      return fallback;
    }
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  };
}

function riskNumber(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (raw === undefined || raw.trim().length === 0) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

@Module({
  imports: [
    AuthenticationModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) => ({
        accessToken: {
          key: config.get('ACCESS_TOKEN_KEY', { infer: true }),
          issuer: AUTH_ISSUER,
          audience: AUTH_AUDIENCE,
          ttl: config.get('ACCESS_TOKEN_TTL', { infer: true }),
        },
        refreshToken: {
          ttl: config.get('REFRESH_TOKEN_TTL', { infer: true }),
          absoluteTtl: config.get('REFRESH_TOKEN_ABSOLUTE_TTL', { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    PrismaRefreshTokenStore,
    PasswordService,
    DeviceSessionService,
    AuthService,
    JwtAuth,
    {
      provide: LoginRiskThrottle,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) =>
        new LoginRiskThrottle({
          get freeAttempts() {
            return riskNumber(
              'LOGIN_RISK_FREE_ATTEMPTS',
              config.get('LOGIN_RISK_FREE_ATTEMPTS', { infer: true }),
            );
          },
          get stepMs() {
            return riskNumber('LOGIN_RISK_STEP_MS', config.get('LOGIN_RISK_STEP_MS', { infer: true }));
          },
          get maxDelayMs() {
            return riskNumber(
              'LOGIN_RISK_MAX_DELAY_MS',
              config.get('LOGIN_RISK_MAX_DELAY_MS', { infer: true }),
            );
          },
          get windowMs() {
            return Math.max(
              1,
              riskNumber('LOGIN_RISK_WINDOW_MS', config.get('LOGIN_RISK_WINDOW_MS', { infer: true })),
            );
          },
        } satisfies LoginRiskOptions),
    },
  ],
  exports: [DeviceSessionService, PrismaRefreshTokenStore],
})
export class AuthModule {}

export function refreshTokenTracker(request: Record<string, unknown>): string {
  const body = request.body;
  const token =
    typeof body === 'object' && body !== null && 'refreshToken' in body
      ? (body as { refreshToken?: unknown }).refreshToken
      : undefined;
  return createHash('sha256')
    .update(typeof token === 'string' ? token : '')
    .digest('hex');
}

export const AUTH_ROUTE_THROTTLE_TTL_MS = FIFTEEN_MINUTES_MS;
