import { z } from 'zod';

export const createVendorReviewSchema = z.object({
  body: z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(1000).optional()
  })
});
