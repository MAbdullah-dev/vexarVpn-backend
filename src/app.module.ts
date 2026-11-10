import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';
import { ThrottlerModule } from '@nestjs/throttler';

import { ApiThrottlerGuard } from './auth/api-throttler.guard.js';
import {
  AUTH_ROUTE_THROTTLE_TTL_MS,
  AuthModule,
  refreshTokenTracker,
  throttleLimit,
} from './auth/auth.module.js';
import { TOO_MANY_REQUESTS } from './auth/auth.constants.js';
import { validateEnv, type AppEnv } from './config/env.schema.js';
import { DevicesModule } from './devices/devices.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (config: Record<string, unknown>) => validateEnv(config),
    }),
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? '',
      appSecret: process.env.OBSERVE_APP_SECRET ?? '',
      serviceId: 'vexar-vpn-backend',
    }),
    PrismaModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) => ({
        errorMessage: TOO_MANY_REQUESTS,
        throttlers: [
          { name: 'default', ttl: 60_000, limit: 120 },
          {
            name: 'register',
            ttl: AUTH_ROUTE_THROTTLE_TTL_MS,
            limit: throttleLimit(
              'THROTTLE_REGISTER_LIMIT',
              config.get('THROTTLE_REGISTER_LIMIT', { infer: true }),
            ),
          },
          {
            name: 'login',
            ttl: AUTH_ROUTE_THROTTLE_TTL_MS,
            limit: throttleLimit(
              'THROTTLE_LOGIN_LIMIT',
              config.get('THROTTLE_LOGIN_LIMIT', { infer: true }),
            ),
          },
          {
            name: 'refresh',
            ttl: AUTH_ROUTE_THROTTLE_TTL_MS,
            limit: throttleLimit(
              'THROTTLE_REFRESH_LIMIT',
              config.get('THROTTLE_REFRESH_LIMIT', { infer: true }),
            ),
          },
          {
            name: 'refresh-token',
            ttl: AUTH_ROUTE_THROTTLE_TTL_MS,
            limit: throttleLimit(
              'THROTTLE_REFRESH_TOKEN_LIMIT',
              config.get('THROTTLE_REFRESH_TOKEN_LIMIT', { infer: true }),
            ),
            getTracker: refreshTokenTracker,
          },
          {
            name: 'logout',
            ttl: AUTH_ROUTE_THROTTLE_TTL_MS,
            limit: throttleLimit(
              'THROTTLE_LOGOUT_LIMIT',
              config.get('THROTTLE_LOGOUT_LIMIT', { infer: true }),
            ),
          },
        ],
      }),
    }),
    AuthModule,
    UsersModule,
    DevicesModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ApiThrottlerGuard }],
})
export class AppModule {}
