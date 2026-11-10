import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { TokenService } from '@nestjs/authentication';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { DEVICE_REVOKED, EMAIL_TAKEN, INVALID_CREDENTIALS } from './auth.constants.js';
import type { CredentialsBody } from './auth.schemas.js';
import { DeviceSessionService } from './device-session.service.js';
import { LoginRiskThrottle } from './login-risk.throttle.js';
import { PasswordService } from './password.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly devices: DeviceSessionService,
    private readonly loginRisk: LoginRiskThrottle,
  ) {}

  async register(input: CredentialsBody) {
    const passwordHash = await this.passwords.hash(input.password);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            displayName: input.device.displayName,
          },
        });
        const device = await this.devices.createForRegistration(tx, user.id, input.device);
        return { user, device };
      });
      const issued = await this.issue(created.user.id, created.device.id);
      return this.authResponse(created.user, created.device, issued);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(EMAIL_TAKEN);
      }
      throw error;
    }
  }

  async login(input: CredentialsBody, ip: string) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const passwordMatches = user
      ? await this.passwords.verify(user.passwordHash, input.password)
      : await this.passwords.consumeUnknownPassword(input.password);
    if (!user || !passwordMatches || user.status !== 'enabled') {
      if (!user || !passwordMatches) {
        await this.loginRisk.penalize(ip, input.email);
      }
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const device = await this.devices.upsertForLogin(user.id, input.device);
    if (device.status === 'revoked') {
      this.loginRisk.clear(ip, input.email);
      throw new ForbiddenException(DEVICE_REVOKED);
    }
    this.loginRisk.clear(ip, input.email);
    const issued = await this.issue(user.id, device.id);
    return this.authResponse(user, device, issued);
  }

  private issue(userId: string, deviceId: string) {
    return this.tokens.issue(userId, {
      method: 'password',
      claims: { did: deviceId, sid: randomUUID() },
    });
  }

  private authResponse(
    user: {
      id: string;
      email: string;
      displayName: string | null;
      status: 'enabled' | 'disabled';
      emailVerifiedAt: Date | null;
    },
    device: {
      id: string;
      installId: string;
      displayName: string | null;
      platform: 'android';
      appVersion: string | null;
      status: 'registered' | 'revoked';
    },
    issued: { accessToken: string; refreshToken: string; expiresIn: number },
  ) {
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        status: user.status,
        emailVerified: user.emailVerifiedAt !== null,
      },
      device: {
        id: device.id,
        installId: device.installId,
        displayName: device.displayName,
        platform: device.platform,
        appVersion: device.appVersion,
        status: device.status,
      },
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      expiresIn: issued.expiresIn,
      tokenType: 'Bearer' as const,
    };
  }
}
