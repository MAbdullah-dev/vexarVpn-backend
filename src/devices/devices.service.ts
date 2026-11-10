import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { DEVICE_REVOKED } from '../auth/auth.constants.js';
import { DeviceSessionService } from '../auth/device-session.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RegisterDeviceBody } from './devices.schemas.js';

export interface PublicDevice {
  id: string;
  displayName: string | null;
  platform: 'android';
  appVersion: string | null;
  status: 'registered' | 'revoked';
  createdAt: Date;
}

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: DeviceSessionService,
  ) {}

  async list(userId: string): Promise<PublicDevice[]> {
    const devices = await this.prisma.device.findMany({
      where: { userId },
      select: {
        id: true,
        displayName: true,
        platform: true,
        appVersion: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return devices;
  }

  async register(userId: string, input: RegisterDeviceBody): Promise<{ device: PublicDevice }> {
    const existing = await this.prisma.device.findUnique({
      where: { userId_installId: { userId, installId: input.installId } },
      select: { id: true, status: true },
    });
    if (existing?.status === 'revoked') {
      throw new ForbiddenException(DEVICE_REVOKED);
    }
    if (existing) {
      await this.updateOwnedDevice(userId, existing.id, input);
      return { device: await this.getOwnedDevice(userId, existing.id) };
    }
    try {
      const created = await this.prisma.device.create({
        data: {
          userId,
          installId: input.installId,
          displayName: input.displayName,
          platform: input.platform,
          appVersion: input.appVersion,
        },
        select: this.publicSelect(),
      });
      return { device: created };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      const raced = await this.prisma.device.findUnique({
        where: { userId_installId: { userId, installId: input.installId } },
        select: { id: true, status: true },
      });
      if (!raced) {
        throw error;
      }
      if (raced.status === 'revoked') {
        throw new ForbiddenException(DEVICE_REVOKED);
      }
      await this.updateOwnedDevice(userId, raced.id, input);
      return { device: await this.getOwnedDevice(userId, raced.id) };
    }
  }

  async revoke(userId: string, deviceId: string): Promise<void> {
    const revoked = await this.sessions.revokeDevice(userId, deviceId);
    if (!revoked) {
      throw new NotFoundException('Device not found');
    }
  }

  private async updateOwnedDevice(
    userId: string,
    deviceId: string,
    input: RegisterDeviceBody,
  ): Promise<void> {
    const updated = await this.prisma.device.updateMany({
      where: { id: deviceId, userId, status: 'registered' },
      data: {
        displayName: input.displayName,
        platform: input.platform,
        appVersion: input.appVersion,
      },
    });
    if (updated.count !== 1) {
      throw new ForbiddenException(DEVICE_REVOKED);
    }
  }

  private async getOwnedDevice(userId: string, deviceId: string): Promise<PublicDevice> {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
      select: this.publicSelect(),
    });
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    return device;
  }

  private publicSelect() {
    return {
      id: true,
      displayName: true,
      platform: true,
      appVersion: true,
      status: true,
      createdAt: true,
    } as const;
  }
}
