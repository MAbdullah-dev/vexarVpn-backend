import { z } from 'zod';

export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80),
  })
  .strict();

export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;
