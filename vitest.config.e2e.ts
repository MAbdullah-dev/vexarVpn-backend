import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    env: {
      NODE_ENV: 'test',
      PORT: '3000',
      DATABASE_URL:
        'postgresql://vexar:vexar@127.0.0.1:5432/vexar_vpn?schema=public',
      CORS_ORIGINS: 'http://localhost:8081',
      LOG_LEVEL: 'log',
      ACCESS_TOKEN_KEY: 'test-access-token-key-at-least-32-bytes',
      ACCESS_TOKEN_TTL: '15m',
      REFRESH_TOKEN_TTL: '30d',
      REFRESH_TOKEN_ABSOLUTE_TTL: '90d',
      THROTTLE_REGISTER_LIMIT: '10000',
      THROTTLE_LOGIN_LIMIT: '10000',
      THROTTLE_REFRESH_LIMIT: '10000',
      THROTTLE_REFRESH_TOKEN_LIMIT: '10000',
      THROTTLE_LOGOUT_LIMIT: '10000',
    },
  },
});
