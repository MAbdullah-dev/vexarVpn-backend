import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import type { CredentialsBody } from './auth.schemas.js';
import { PrismaRefreshTokenStore } from './prisma-refresh-token.store.js';

export type DeviceInput = CredentialsBody['device'];

type DeviceRecord = Prisma.DeviceGetPayload<Record<string, never>>;

/**
 * `installId` is the identifier the client sends for this installation.
 * It is not cryptographic proof of a device. A refresh token copied to
 * another client remains usable until its family is revoked.
 *
 * Revoking a device revokes that device's refresh-token families. The
 * authentication guard then rejects access tokens whose `did` is this
 * device, including tokens that have not reached `exp`.
 */
@Injectable()
export class DeviceSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refreshTokens: PrismaRefreshTokenStore,
  ) {}

  async createForRegistration(
    tx: Prisma.TransactionClient,
    userId: string,
    device: DeviceInput,
  ): Promise<DeviceRecord> {
    return tx.device.create({
      data: {
        userId,
        installId: device.installId,
        displayName: device.displayName,
        platform: device.platform,
        appVersion: device.appVersion,
      },
    });
  }

  async upsertForLogin(userId: string, device: DeviceInput): Promise<DeviceRecord> {
    const existing = await this.prisma.device.findUnique({
      where: { userId_installId: { userId, installId: device.installId } },
    });
    if (existing?.status === 'revoked') {
      return existing;
    }
    if (existing) {
      return this.prisma.device.update({
        where: { id: existing.id },
        data: {
          displayName: device.displayName,
          appVersion: device.appVersion,
          platform: device.platform,
        },
      });
    }
    try {
      return await this.prisma.device.create({
        data: {
          userId,
          installId: device.installId,
          displayName: device.displayName,
          platform: device.platform,
          appVersion: device.appVersion,
        },
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) {
        throw error;
      }
      const raced = await this.prisma.device.findUnique({
        where: { userId_installId: { userId, installId: device.installId } },
      });
      if (!raced) {
        throw error;
      }
      if (raced.status === 'revoked') {
        return raced;
      }
      return this.prisma.device.update({
        where: { id: raced.id },
        data: {
          displayName: device.displayName,
          appVersion: device.appVersion,
          platform: device.platform,
        },
      });
    }
  }

  /**
   * Revokes one device owned by `userId`. The lookup includes `userId`, so a
   * foreign device id is left unchanged. Records stay in the table.
   */
  async revokeDevice(userId: string, deviceId: string): Promise<boolean> {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
      select: { id: true },
    });
    if (!device) {
      return false;
    }
    await this.prisma.device.update({
      where: { id: device.id },
      data: { status: 'revoked' },
    });
    const families = await this.prisma.refreshToken.findMany({
      where: { deviceId: device.id },
      select: { familyId: true },
      distinct: ['familyId'],
    });
    for (const family of families) {
      await this.refreshTokens.revokeRefreshTokenFamily(family.familyId);
    }
    await this.prisma.refreshToken.updateMany({
      where: { deviceId: device.id, revoked: false },
      data: { revoked: true },
    });
    return true;
  }

  private isUniqueConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
