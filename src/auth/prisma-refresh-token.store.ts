import { Injectable } from '@nestjs/common';
import { AuthenticationStorage, type RefreshTokenRecord } from '@nestjs/authentication';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';

const DEVICE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Prisma store for `@nestjs/authentication` refresh tokens.
 *
 * `markRefreshTokenUsed` is one conditional update. Concurrent refreshes of
 * the same token can both save a successor before that update; exactly one
 * update wins. The loser revokes the family, and this store records that
 * revocation so the winner's successor is revoked too, including a successor
 * whose insert commits after the revoking update.
 *
 * That leaves both presented refresh tokens unusable. Access tokens already
 * signed stay valid until `exp`. Revoking a device is a separate write: it
 * revokes that device's families and the guard rejects its access tokens.
 */
@Injectable()
export class PrismaRefreshTokenStore {
  constructor(
    private readonly prisma: PrismaService,
    storage: AuthenticationStorage,
  ) {
    storage.registerSource({ refreshTokens: this });
  }

  async getRefreshToken(id: string): Promise<RefreshTokenRecord | undefined> {
    const row = await this.prisma.refreshToken.findUnique({ where: { id } });
    if (!row) {
      return undefined;
    }
    const claims = this.claimsOf(row.claims);
    return {
      id: row.id,
      familyId: row.familyId,
      userId: row.userId,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      familyExpiresAt: row.familyExpiresAt,
      ...(row.usedAt ? { usedAt: row.usedAt } : {}),
      ...(claims ? { claims } : {}),
    };
  }

  async saveRefreshToken(record: RefreshTokenRecord): Promise<void> {
    const deviceId = this.deviceId(record.claims);
    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.create({
        data: {
          id: record.id,
          familyId: record.familyId,
          userId: record.userId,
          ...(deviceId ? { deviceId } : {}),
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
          familyExpiresAt: record.familyExpiresAt,
          usedAt: record.usedAt ?? null,
          revoked: false,
          ...(record.claims ? { claims: record.claims as Prisma.InputJsonValue } : {}),
        },
      });
      const marker = await tx.revokedRefreshFamily.findUnique({
        where: { familyId: record.familyId },
      });
      if (marker) {
        await tx.refreshToken.update({
          where: { id: record.id },
          data: { revoked: true },
        });
      }
      await tx.refreshToken.deleteMany({
        where: {
          familyExpiresAt: { lte: record.createdAt },
          id: { not: record.id },
        },
      });
      await tx.$executeRaw`
        DELETE FROM "revoked_refresh_families" AS marker
        WHERE NOT EXISTS (
          SELECT 1 FROM "refresh_tokens" AS token
          WHERE token."family_id" = marker."family_id"
        )
      `;
    });
  }

  async markRefreshTokenUsed(id: string, at: Date): Promise<boolean> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: at },
    });
    return result.count === 1;
  }

  async revokeRefreshTokenFamily(familyId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.revokedRefreshFamily.upsert({
        where: { familyId },
        create: { familyId },
        update: {},
      }),
      this.prisma.refreshToken.updateMany({
        where: { familyId },
        data: { revoked: true },
      }),
    ]);
  }

  async isRefreshTokenFamilyRevoked(familyId: string): Promise<boolean> {
    const marker = await this.prisma.revokedRefreshFamily.findUnique({
      where: { familyId },
    });
    if (marker) {
      return true;
    }
    const revoked = await this.prisma.refreshToken.findFirst({
      where: { familyId, revoked: true },
      select: { id: true },
    });
    return revoked !== null;
  }

  async revokeUserRefreshTokens(userId: string): Promise<void> {
    const families = await this.prisma.refreshToken.findMany({
      where: { userId },
      select: { familyId: true },
      distinct: ['familyId'],
    });
    for (const family of families) {
      await this.revokeRefreshTokenFamily(family.familyId);
    }
  }

  private deviceId(claims: Record<string, unknown> | undefined): string | undefined {
    const did = claims?.did;
    return typeof did === 'string' && DEVICE_UUID.test(did) ? did : undefined;
  }

  private claimsOf(value: Prisma.JsonValue | null): Record<string, unknown> | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return undefined;
    }
    return value;
  }
}
