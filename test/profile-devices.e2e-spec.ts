import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { DEVICE_REVOKED } from '../src/auth/auth.constants.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PASSWORD = 'correct-horse-battery';
const PROFILE_KEYS = ['displayName', 'email', 'emailVerified', 'id', 'status'];
const DEVICE_KEYS = ['appVersion', 'createdAt', 'displayName', 'id', 'platform', 'status'];

function databaseUrl(databaseName: string): string {
  const text = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const line = text.split(/\r?\n/).find((entry) => entry.startsWith('DATABASE_URL='));
  if (!line) {
    throw new Error('DATABASE_URL is missing from .env');
  }
  let raw = line.slice('DATABASE_URL='.length).trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    raw = raw.slice(1, -1);
  }
  const url = new URL(raw);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function emailAddress(): string {
  return `stage3-${randomUUID()}@example.com`;
}

function device(installId = randomUUID(), displayName = 'Pixel') {
  return {
    installId,
    displayName,
    platform: 'android' as const,
    appVersion: '1.0.0',
  };
}

async function createApp(): Promise<INestApplication<App>> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const application = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(application);
  await application.init();
  return application;
}

describe('profile and devices', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl('vexravpn_test');
    process.env.ACCESS_TOKEN_KEY = 'test-access-token-key-at-least-32-bytes';
    process.env.THROTTLE_REGISTER_LIMIT = '10000';
    process.env.THROTTLE_LOGIN_LIMIT = '10000';
    app = await createApp();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email: { startsWith: 'stage3-' } } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: { startsWith: 'stage3-' } } });
    }
    await app?.close();
  });

  async function registerAccount(installId = randomUUID()) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: emailAddress(), password: PASSWORD, device: device(installId) })
      .expect(201);
    return response.body as {
      user: { id: string; email: string; displayName: string | null };
      device: { id: string; installId: string };
      accessToken: string;
      refreshToken: string;
    };
  }

  it('returns the public profile and updates only displayName', async () => {
    const account = await registerAccount();
    const server = app.getHttpServer();
    const profile = await request(server)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${account.accessToken}`)
      .expect(200);
    expect(Object.keys(profile.body).sort()).toEqual(PROFILE_KEYS);
    expect(profile.body).toMatchObject({
      id: account.user.id,
      email: account.user.email,
      displayName: 'Pixel',
      status: 'enabled',
      emailVerified: false,
    });
    expect(JSON.stringify(profile.body)).not.toContain('passwordHash');

    const renamed = await request(server)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${account.accessToken}`)
      .send({ displayName: '  Renamed User  ' })
      .expect(200);
    expect(renamed.body.displayName).toBe('Renamed User');
    expect(renamed.body.email).toBe(account.user.email);
    expect(Object.keys(renamed.body).sort()).toEqual(PROFILE_KEYS);

    const before = await prisma.user.findUniqueOrThrow({
      where: { id: account.user.id },
      select: { email: true, status: true, passwordHash: true },
    });
    const rejected = await request(server)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${account.accessToken}`)
      .send({
        displayName: 'Hijacked',
        email: 'other@example.com',
        status: 'disabled',
        passwordHash: 'replacement-hash-value',
        userId: randomUUID(),
      })
      .expect(400);
    expect(JSON.stringify(rejected.body)).not.toContain('replacement-hash-value');
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: account.user.id },
      select: { email: true, status: true, passwordHash: true, displayName: true },
    });
    expect(after).toEqual({ ...before, displayName: 'Renamed User' });

    await request(server).get('/api/v1/users/me').expect(401);
  });

  it('registers a device for the signed-in user and keeps a repeated installId on that user', async () => {
    const account = await registerAccount();
    const server = app.getHttpServer();
    const installId = randomUUID();
    const created = await request(server)
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${account.accessToken}`)
      .send(device(installId, 'Tablet'))
      .expect(200);
    expect(Object.keys(created.body).sort()).toEqual(DEVICE_KEYS);
    expect(created.body).toMatchObject({
      displayName: 'Tablet',
      platform: 'android',
      appVersion: '1.0.0',
      status: 'registered',
    });
    expect(JSON.stringify(created.body)).not.toContain('refresh');
    expect(JSON.stringify(created.body)).not.toContain('wireguard');

    const repeated = await request(server)
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${account.accessToken}`)
      .send({ ...device(installId, 'Tablet renamed'), appVersion: '1.1.0' })
      .expect(200);
    expect(repeated.body.id).toBe(created.body.id);
    expect(repeated.body.displayName).toBe('Tablet renamed');
    expect(repeated.body.appVersion).toBe('1.1.0');
    expect(repeated.body.status).toBe('registered');

    const stored = await prisma.device.findMany({
      where: { installId, userId: account.user.id },
    });
    expect(stored).toHaveLength(1);

    await request(server)
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${account.accessToken}`)
      .send({ ...device(), platform: 'ios' })
      .expect(400);
  });

  it('lists and revokes only the signed-in user devices', async () => {
    const firstInstall = randomUUID();
    const owner = await registerAccount(firstInstall);
    const other = await registerAccount();
    const server = app.getHttpServer();
    const secondInstall = randomUUID();
    const second = await request(server)
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send(device(secondInstall, 'Second phone'))
      .expect(200);
    const secondLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({
        email: owner.user.email,
        password: PASSWORD,
        device: device(secondInstall, 'Second phone'),
      })
      .expect(200);

    const listed = await request(server)
      .get('/api/v1/devices')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(listed.body.map((item: { id: string }) => item.id)).toEqual([
      owner.device.id,
      second.body.id,
    ]);
    for (const item of listed.body as Array<Record<string, unknown>>) {
      expect(Object.keys(item).sort()).toEqual(DEVICE_KEYS);
    }
    expect(JSON.stringify(listed.body)).not.toContain(owner.refreshToken);
    expect(JSON.stringify(listed.body)).not.toContain('passwordHash');

    const foreignList = await request(server)
      .get('/api/v1/devices')
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(200);
    expect(foreignList.body.map((item: { id: string }) => item.id)).toEqual([other.device.id]);

    await request(server)
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${other.accessToken}`)
      .send(device(firstInstall, 'Stolen name'))
      .expect(200);
    const ownerDevice = await prisma.device.findFirstOrThrow({
      where: { id: owner.device.id, userId: owner.user.id },
    });
    expect(ownerDevice.displayName).toBe('Pixel');
    expect(ownerDevice.userId).toBe(owner.user.id);

    await request(server)
      .delete(`/api/v1/devices/${owner.device.id}`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(404);
    await request(server)
      .delete(`/api/v1/devices/${randomUUID()}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(404);
    expect(
      (
        await prisma.device.findUniqueOrThrow({ where: { id: owner.device.id } })
      ).status,
    ).toBe('registered');

    await request(server)
      .delete(`/api/v1/devices/${owner.device.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(204);
    const revoked = await prisma.device.findUniqueOrThrow({ where: { id: owner.device.id } });
    expect(revoked.status).toBe('revoked');
    expect(revoked.userId).toBe(owner.user.id);

    await request(server)
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(401);
    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: owner.refreshToken })
      .expect(401);
    const sameInstall = await request(server)
      .post('/api/v1/auth/login')
      .send({
        email: owner.user.email,
        password: PASSWORD,
        device: device(firstInstall),
      })
      .expect(403);
    expect(sameInstall.body.message).toBe(DEVICE_REVOKED);
    const resurrect = await request(server)
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${secondLogin.body.accessToken}`)
      .send(device(firstInstall, 'Restored'))
      .expect(403);
    expect(resurrect.body.message).toBe(DEVICE_REVOKED);

    await request(server)
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${secondLogin.body.accessToken}`)
      .expect(200);
    const rotated = await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: secondLogin.body.refreshToken })
      .expect(200);
    expect(rotated.body.accessToken).toEqual(expect.any(String));

    const remaining = await request(server)
      .get('/api/v1/devices')
      .set('Authorization', `Bearer ${rotated.body.accessToken}`)
      .expect(200);
    expect(remaining.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: owner.device.id, status: 'revoked' }),
        expect.objectContaining({ id: second.body.id, status: 'registered' }),
      ]),
    );
  });
});
