import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import {
  DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
  DEVICE_REVOKED,
  EMAIL_TAKEN,
  INVALID_CREDENTIALS,
  TOO_MANY_REQUESTS,
} from '../src/auth/auth.constants.js';
import { DeviceSessionService } from '../src/auth/device-session.service.js';
import { PrismaRefreshTokenStore } from '../src/auth/prisma-refresh-token.store.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PASSWORD = 'correct-horse-battery';

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
  return `stage2-${randomUUID()}@example.com`;
}

function device(installId = randomUUID()) {
  return {
    installId,
    displayName: 'Pixel',
    platform: 'android' as const,
    appVersion: '1.0.0',
  };
}

function tokenId(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('base64url');
}

function claims(accessToken: string): { exp: number; iat: number; did: string; sid: string } {
  const segment = accessToken.split('.')[1];
  if (!segment) {
    throw new Error('Access token is missing a payload');
  }
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as {
    exp: number;
    iat: number;
    did: string;
    sid: string;
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

describe('authentication core', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl('vexravpn_test');
    process.env.ACCESS_TOKEN_KEY = 'test-access-token-key-at-least-32-bytes';
    process.env.ACCESS_TOKEN_TTL = '15m';
    process.env.THROTTLE_REGISTER_LIMIT = '10000';
    process.env.THROTTLE_LOGIN_LIMIT = '10000';
    process.env.THROTTLE_REFRESH_LIMIT = '10000';
    process.env.THROTTLE_REFRESH_TOKEN_LIMIT = '10000';
    process.env.THROTTLE_LOGOUT_LIMIT = '10000';
    delete process.env.LOGIN_RISK_FREE_ATTEMPTS;
    delete process.env.LOGIN_RISK_STEP_MS;
    delete process.env.LOGIN_RISK_MAX_DELAY_MS;
    app = await createApp();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email: { startsWith: 'stage2-' } } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: { startsWith: 'stage2-' } } });
      await prisma.$executeRaw`
        DELETE FROM "revoked_refresh_families" AS marker
        WHERE NOT EXISTS (
          SELECT 1 FROM "refresh_tokens" AS token
          WHERE token."family_id" = marker."family_id"
        )
      `;
    }
    await app?.close();
  });

  it('registers a lowercase email and returns a bearer pair without the password', async () => {
    const address = `  Stage2-${randomUUID()}@Example.COM `;
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: address, password: PASSWORD, device: device() })
      .expect(201);
    expect(response.body.user.email).toBe(address.trim().toLowerCase());
    expect(response.body.user.emailVerified).toBe(false);
    expect(response.body.tokenType).toBe('Bearer');
    expect(response.body.expiresIn).toBe(DEFAULT_ACCESS_TOKEN_TTL_SECONDS);
    expect(response.body.device.platform).toBe('android');
    expect(JSON.stringify(response.body)).not.toContain(PASSWORD);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');

    const session = await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${response.body.accessToken}`)
      .expect(200);
    expect(session.body).toEqual({
      userId: response.body.user.id,
      deviceId: response.body.device.id,
      sessionId: claims(response.body.accessToken).sid,
    });
  });

  it('rejects a duplicate email and a short password without echoing the password', async () => {
    const address = emailAddress();
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: address, password: PASSWORD, device: device() })
      .expect(201);
    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: address.toUpperCase(), password: PASSWORD, device: device() })
      .expect(409);
    expect(duplicate.body.message).toBe(EMAIL_TAKEN);

    const rejected = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: emailAddress(), password: 'too-short', device: device() })
      .expect(400);
    expect(JSON.stringify(rejected.body)).not.toContain('too-short');
    expect(JSON.stringify(rejected.body)).toContain('Invalid value');
  });

  it('uses the same error for an unknown email, a wrong password, and a disabled account', async () => {
    const address = emailAddress();
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: address, password: PASSWORD, device: device() })
      .expect(201);
    await prisma.user.update({
      where: { id: registered.body.user.id },
      data: { status: 'disabled' },
    });

    const disabled = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: address, password: PASSWORD, device: device() })
      .expect(401);
    const unknown = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: emailAddress(), password: PASSWORD, device: device() })
      .expect(401);
    const wrong = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: emailAddress(), password: 'another-valid-password', device: device() })
      .expect(401);
    expect(disabled.body.message).toBe(INVALID_CREDENTIALS);
    expect(unknown.body.message).toBe(INVALID_CREDENTIALS);
    expect(wrong.body.message).toBe(INVALID_CREDENTIALS);
  });

  it('logs in, rotates a refresh token, and keeps the previous access token after logout', async () => {
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: emailAddress(), password: PASSWORD, device: device() })
      .expect(201);
    const loggedIn = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: registered.body.user.email,
        password: PASSWORD,
        device: device(registered.body.device.installId),
      })
      .expect(200);
    const payload = claims(loggedIn.body.accessToken);
    expect(loggedIn.body.expiresIn).toBe(DEFAULT_ACCESS_TOKEN_TTL_SECONDS);
    expect(payload.exp - payload.iat).toBe(DEFAULT_ACCESS_TOKEN_TTL_SECONDS);

    const rotated = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: loggedIn.body.refreshToken })
      .expect(200);
    expect(rotated.body.refreshToken).not.toBe(loggedIn.body.refreshToken);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: loggedIn.body.refreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: randomBytes(32).toString('base64url') })
      .expect(204);
    const refused = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(401);
    expect(JSON.stringify(refused.body)).not.toContain(rotated.body.refreshToken);
    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${loggedIn.body.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${rotated.body.accessToken}`)
      .expect(200);
  });

  it('records both concurrent refresh responses and leaves every returned refresh token unusable', async () => {
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: emailAddress(), password: PASSWORD, device: device() })
      .expect(201);
    const refreshToken = registered.body.refreshToken as string;
    const server = app.getHttpServer();
    const [first, second] = await Promise.all([
      request(server).post('/api/v1/auth/refresh').send({ refreshToken }),
      request(server).post('/api/v1/auth/refresh').send({ refreshToken }),
    ]);

    expect(new Set([first.status, second.status])).toEqual(new Set([200, 401]));
    const succeeded = [first, second].filter((response) => response.status === 200);
    const failed = [first, second].filter((response) => response.status === 401);
    expect(JSON.stringify(failed[0]?.body)).not.toContain(refreshToken);

    const refreshTokens = [
      refreshToken,
      ...succeeded.map((response) => response.body.refreshToken as string),
    ];
    for (const candidate of refreshTokens) {
      const followUp = await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: candidate });
      expect(followUp.status).toBe(401);
      expect(JSON.stringify(followUp.body)).not.toContain(candidate);
    }

    const accessTokens = [
      registered.body.accessToken as string,
      ...succeeded.map((response) => response.body.accessToken as string),
    ];
    for (const accessToken of accessTokens) {
      await request(server)
        .get('/api/v1/auth/session')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(claims(accessToken).exp - claims(accessToken).iat).toBe(
        DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
      );
    }
  });

  it('lets exactly one conditional refresh-token update win', async () => {
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: emailAddress(), password: PASSWORD, device: device() })
      .expect(201);
    const store = app.get(PrismaRefreshTokenStore);
    const id = tokenId(registered.body.refreshToken as string);
    const at = new Date();
    const results = await Promise.all([
      store.markRefreshTokenUsed(id, at),
      store.markRefreshTokenUsed(id, at),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await store.markRefreshTokenUsed(id, new Date())).toBe(false);
    const stored = await store.getRefreshToken(id);
    expect(stored?.usedAt).toBeInstanceOf(Date);
  });

  it('rejects refresh tokens after the device is revoked and rejects that installation on login', async () => {
    const installId = randomUUID();
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: emailAddress(), password: PASSWORD, device: device(installId) })
      .expect(201);
    const revoked = await app
      .get(DeviceSessionService)
      .revokeDevice(registered.body.user.id, registered.body.device.id);
    expect(revoked).toBe(true);

    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${registered.body.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: registered.body.refreshToken })
      .expect(401);

    const sameInstall = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: registered.body.user.email,
        password: PASSWORD,
        device: device(installId),
      })
      .expect(403);
    expect(sameInstall.body.message).toBe(DEVICE_REVOKED);

    const otherInstall = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: registered.body.user.email,
        password: PASSWORD,
        device: device(),
      })
      .expect(200);
    expect(otherInstall.body.device.id).not.toBe(registered.body.device.id);
  });

  it('still accepts a refresh token after the same account signs in with another installId', async () => {
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: emailAddress(), password: PASSWORD, device: device() })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: registered.body.user.email,
        password: PASSWORD,
        device: device(),
      })
      .expect(200);
    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: registered.body.refreshToken })
      .expect(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));
  });

  it('rejects an email that is not stored in lowercase', async () => {
    const id = '00000000-0000-4000-8000-000000000099';
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "users" ("id", "email", "password_hash", "status", "updated_at")
         VALUES ($1::uuid, $2, $3, 'enabled', NOW())`,
        id,
        'Stage2-Not-Lower@example.com',
        'not-a-real-hash',
      ),
    ).rejects.toThrow();
    await prisma.$executeRawUnsafe(`DELETE FROM "users" WHERE "id" = $1::uuid`, id);
  });

  it('returns a generic 429 when the login IP limit is exceeded', async () => {
    process.env.THROTTLE_LOGIN_LIMIT = '2';
    const limited = await createApp();
    try {
      const body = {
        email: emailAddress(),
        password: 'another-valid-password',
        device: device(),
      };
      await request(limited.getHttpServer()).post('/api/v1/auth/login').send(body).expect(401);
      await request(limited.getHttpServer()).post('/api/v1/auth/login').send(body).expect(401);
      const blocked = await request(limited.getHttpServer())
        .post('/api/v1/auth/login')
        .send(body)
        .expect(429);
      expect(blocked.body.message).toBe(TOO_MANY_REQUESTS);
      const serialized = JSON.stringify(blocked.body);
      expect(serialized).not.toContain(body.email);
      expect(serialized).not.toContain(body.password);
      expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
      expect(blocked.headers['retry-after-login']).toBeUndefined();
    } finally {
      process.env.THROTTLE_LOGIN_LIMIT = '10000';
      await limited.close();
    }
  });

  it('delays a failed login and still returns the generic credential error', async () => {
    process.env.LOGIN_RISK_FREE_ATTEMPTS = '0';
    process.env.LOGIN_RISK_STEP_MS = '250';
    process.env.LOGIN_RISK_MAX_DELAY_MS = '250';
    const delayed = await createApp();
    try {
      const started = Date.now();
      const response = await request(delayed.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: emailAddress(),
          password: 'another-valid-password',
          device: device(),
        })
        .expect(401);
      expect(Date.now() - started).toBeGreaterThanOrEqual(250);
      expect(response.body.message).toBe(INVALID_CREDENTIALS);
      expect(JSON.stringify(response.body)).not.toContain('another-valid-password');
    } finally {
      delete process.env.LOGIN_RISK_FREE_ATTEMPTS;
      delete process.env.LOGIN_RISK_STEP_MS;
      delete process.env.LOGIN_RISK_MAX_DELAY_MS;
      await delayed.close();
    }
  });
});
