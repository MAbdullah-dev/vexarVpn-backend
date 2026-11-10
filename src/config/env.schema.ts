import { z } from 'zod';

const logLevels = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'] as const;

const durationSchema = z
  .string()
  .regex(/^\d+[smhd]$/, 'must be a duration such as 15m, 30d, or 90d');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), {
      message: 'DATABASE_URL must be a PostgreSQL connection URL',
    }),
  CORS_ORIGINS: z.string().default(''),
  LOG_LEVEL: z.enum(logLevels).default('log'),
  ACCESS_TOKEN_KEY: z.string().min(32),
  ACCESS_TOKEN_TTL: durationSchema.default('15m'),
  REFRESH_TOKEN_TTL: durationSchema.default('30d'),
  REFRESH_TOKEN_ABSOLUTE_TTL: durationSchema.default('90d'),
  THROTTLE_REGISTER_LIMIT: z.coerce.number().int().positive().default(5),
  THROTTLE_LOGIN_LIMIT: z.coerce.number().int().positive().default(10),
  THROTTLE_REFRESH_LIMIT: z.coerce.number().int().positive().default(30),
  THROTTLE_REFRESH_TOKEN_LIMIT: z.coerce.number().int().positive().default(10),
  THROTTLE_LOGOUT_LIMIT: z.coerce.number().int().positive().default(10),
  LOGIN_RISK_FREE_ATTEMPTS: z.coerce.number().int().nonnegative().default(3),
  LOGIN_RISK_STEP_MS: z.coerce.number().int().positive().default(500),
  LOGIN_RISK_MAX_DELAY_MS: z.coerce.number().int().positive().default(8000),
  LOGIN_RISK_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) =>
      issue.path.length > 0 ? issue.path.join('.') : 'environment',
    );
    throw new Error(`Invalid environment configuration: ${[...new Set(fields)].join(', ')}`);
  }
  return parsed.data;
}

export function parseCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
