import { validateEnv } from './env.schema.js';

describe('environment validation', () => {
  const databaseUrl = 'postgresql://vexar:vexar@127.0.0.1:5432/vexar_vpn?schema=public';
  const accessTokenKey = 'test-access-token-key-at-least-32-bytes';

  it('accepts a PostgreSQL URL and applies defaults', () => {
    const env = validateEnv({
      DATABASE_URL: databaseUrl,
      ACCESS_TOKEN_KEY: accessTokenKey,
    });
    expect(env.DATABASE_URL).toBe(databaseUrl);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('log');
    expect(env.CORS_ORIGINS).toBe('');
    expect(env.ACCESS_TOKEN_TTL).toBe('15m');
    expect(env.REFRESH_TOKEN_TTL).toBe('30d');
    expect(env.REFRESH_TOKEN_ABSOLUTE_TTL).toBe('90d');
    expect(env.THROTTLE_LOGIN_LIMIT).toBe(10);
    expect(env.LOGIN_RISK_FREE_ATTEMPTS).toBe(3);
  });

  it('rejects a missing or non-PostgreSQL database URL without echoing the value', () => {
    expect(() => validateEnv({ ACCESS_TOKEN_KEY: accessTokenKey })).toThrow(
      'Invalid environment configuration: DATABASE_URL',
    );
    expect(() =>
      validateEnv({
        DATABASE_URL: 'mysql://root:secret@localhost/app',
        ACCESS_TOKEN_KEY: accessTokenKey,
      }),
    ).toThrow('Invalid environment configuration: DATABASE_URL');
    try {
      validateEnv({
        DATABASE_URL: 'mysql://root:secret@localhost/app',
        ACCESS_TOKEN_KEY: accessTokenKey,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain('secret');
      expect((error as Error).message).not.toContain('mysql://');
    }
  });

  it('rejects an access-token key shorter than 32 characters', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: databaseUrl,
        ACCESS_TOKEN_KEY: 'too-short',
      }),
    ).toThrow('Invalid environment configuration: ACCESS_TOKEN_KEY');
  });
});
