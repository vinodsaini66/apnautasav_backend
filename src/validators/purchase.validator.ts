import { z } from 'zod';

export const createPurchaseSchema = z.object({
  body: z.object({
    planKey: z.string().min(1),
    weddingId: z.string().optional(),
  }),
});
