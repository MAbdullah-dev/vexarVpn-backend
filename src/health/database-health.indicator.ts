import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';

import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly prisma: PrismaService,
  ) {}

  isHealthy() {
    return this.healthIndicatorService.check('database').attempt(async () => {
      try {
        await this.prisma.$queryRaw`SELECT 1`;
      } catch {
        throw new Error('Database check failed');
      }
    });
  }
}
