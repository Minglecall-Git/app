import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const optionalRewardDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const targetUserIdSchema = z.object({
  targetUserId: z.string().min(1),
});

export const toggleFavoriteSchema = z.object({
  targetUserId: z.string().min(1),
});

export const likePassSchema = z.object({
  targetUserId: z.string().min(1),
});

export const friendRequestSchema = z.object({
  targetUserId: z.string().min(1),
});

export const reportCreateSchema = z.object({
  targetUserId: z.string().min(1),
  reason: z.string().min(1).max(2000),
  details: z.string().max(5000).optional(),
});

export function zodErrorMessage(err: z.ZodError): string {
  return err.issues.map((i) => i.message).join('; ') || 'Invalid request';
}
