import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

export interface PublicProfile {
  id: string;
  email: string;
  displayName: string | null;
  status: 'enabled' | 'disabled';
  emailVerified: boolean;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<PublicProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        emailVerifiedAt: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.toPublic(user);
  }

  async updateDisplayName(userId: string, displayName: string): Promise<PublicProfile> {
    const updated = await this.prisma.user.updateMany({
      where: { id: userId },
      data: { displayName },
    });
    if (updated.count !== 1) {
      throw new UnauthorizedException();
    }
    return this.getProfile(userId);
  }

  private toPublic(user: {
    id: string;
    email: string;
    displayName: string | null;
    status: 'enabled' | 'disabled';
    emailVerifiedAt: Date | null;
  }): PublicProfile {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      emailVerified: user.emailVerifiedAt !== null,
    };
  }
}
