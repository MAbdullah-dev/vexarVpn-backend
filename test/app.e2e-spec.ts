import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const databaseUrl =
  'postgresql://vexar:vexar@127.0.0.1:5432/vexar_vpn?schema=public';

async function createApp(query: () => Promise<unknown>): Promise<INestApplication<App>> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue({
      $queryRaw: query,
      $disconnect: async () => undefined,
    })
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return app;
}

describe('application startup and health', () => {
  let app: INestApplication<App>;

  afterEach(async () => {
    await app?.close();
  });

  it('starts and serves GET /api/v1/health when the database probe succeeds', async () => {
    process.env.DATABASE_URL = databaseUrl;
    app = await createApp(async () => [{ ok: 1 }]);
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.details.application.status).toBe('up');
    expect(response.body.details.database.status).toBe('up');
    expect(JSON.stringify(response.body)).not.toContain('postgresql://');
  });

  it('keeps the application up and reports the database down', async () => {
    process.env.DATABASE_URL = databaseUrl;
    app = await createApp(async () => {
      throw new Error(`${databaseUrl} password authentication failed`);
    });
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(503);
    expect(response.body.status).toBe('error');
    expect(response.body.info.application.status).toBe('up');
    expect(response.body.error.database.status).toBe('down');
    expect(response.body.error.database.message).toBe('Database check failed');
    expect(JSON.stringify(response.body)).not.toContain('postgresql://');
    expect(JSON.stringify(response.body)).not.toContain('password');
  });
});
