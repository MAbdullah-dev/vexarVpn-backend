import { z } from 'zod';

import { isAsciiEmail, normalizeEmail } from './email.js';

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine(isAsciiEmail, 'Invalid email');

const deviceSchema = z
  .object({
    installId: z.string().uuid(),
    displayName: z.string().trim().min(1).max(80),
    platform: z.literal('android'),
    appVersion: z.string().trim().min(1).max(32),
  })
  .strict();

export const credentialsSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(12).max(128),
    device: deviceSchema,
  })
  .strict();

export const refreshSchema = z
  .object({
    refreshToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid value'),
  })
  .strict();

export type CredentialsBody = z.infer<typeof credentialsSchema>;
export type RefreshBody = z.infer<typeof refreshSchema>;

export function normalizedCredentials(body: CredentialsBody): CredentialsBody {
  return { ...body, email: normalizeEmail(body.email) };
}
