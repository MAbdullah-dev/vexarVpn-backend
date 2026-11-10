import { z } from 'zod';

export const registerDeviceSchema = z
  .object({
    installId: z.string().uuid(),
    displayName: z.string().trim().min(1).max(80),
    platform: z.literal('android'),
    appVersion: z.string().trim().min(1).max(32),
  })
  .strict();

export const deviceIdSchema = z.string().uuid();

export type RegisterDeviceBody = z.infer<typeof registerDeviceSchema>;
