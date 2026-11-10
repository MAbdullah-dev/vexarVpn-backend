import { Injectable } from '@nestjs/common';
import { AuthenticationRegistry, JwtBearerProvider, type JwtClaims } from '@nestjs/authentication';

import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthPrincipal } from './auth.types.js';

@Injectable()
export class JwtAuth extends JwtBearerProvider<AuthPrincipal> {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerProvider(this);
  }

  protected async validate(claims: JwtClaims): Promise<AuthPrincipal | null> {
    const userId = typeof claims.sub === 'string' ? claims.sub : undefined;
    const deviceId = typeof claims.did === 'string' ? claims.did : undefined;
    if (!userId || !deviceId) {
      return null;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, status: true },
    });
    if (!user || user.status !== 'enabled') {
      return null;
    }
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { id: true, userId: true, status: true },
    });
    if (!device || device.userId !== user.id || device.status !== 'registered') {
      return null;
    }
    return user;
  }
}
