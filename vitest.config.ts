import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`. Requires Vite 8, which ships this option.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    env: {
      NODE_ENV: 'test',
      PORT: '3000',
      DATABASE_URL:
        'postgresql://vexar:vexar@127.0.0.1:5432/vexar_vpn?schema=public',
      CORS_ORIGINS: 'http://localhost:8081',
      LOG_LEVEL: 'log',
      ACCESS_TOKEN_KEY: 'test-access-token-key-at-least-32-bytes',
    },
  },
});
