import { Test } from '@nestjs/testing';
import { HealthIndicatorService } from '@nestjs/terminus';

import { PrismaService } from '../prisma/prisma.service.js';
import { DatabaseHealthIndicator } from './database-health.indicator.js';

describe('DatabaseHealthIndicator', () => {
  async function indicatorWith(query: () => Promise<unknown>) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DatabaseHealthIndicator,
        HealthIndicatorService,
        {
          provide: PrismaService,
          useValue: { $queryRaw: query },
        },
      ],
    }).compile();
    return moduleRef.get(DatabaseHealthIndicator);
  }

  it('reports the database as up when the probe succeeds', async () => {
    const indicator = await indicatorWith(async () => [{ ok: 1 }]);
    const result = await indicator.isHealthy();
    expect(result.database.status).toBe('up');
  });

  it('reports the database as down without the driver error', async () => {
    const indicator = await indicatorWith(async () => {
      throw new Error('postgresql://vexar:secret@localhost:5432/vexar_vpn');
    });
    const result = await indicator.isHealthy();
    expect(result.database.status).toBe('down');
    expect(result.database.message).toBe('Database check failed');
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('postgresql://');
  });
});
