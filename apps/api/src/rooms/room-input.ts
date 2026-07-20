import { gameConfigSchema } from '@marxmatrix/contracts';
import { z } from 'zod';

export const createRoomInputSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100),
    config: z.object(gameConfigSchema.shape).partial().strict().optional()
  })
  .strict();

export const joinRoomInputSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100)
  })
  .strict();

export const roomVersionInputSchema = z
  .object({
    expectedStateVersion: z.number().int().min(0)
  })
  .strict();
