import { z } from 'zod';

export const createBannerSchema = z.object({
  body: z.object({
    title: z.string().min(2).max(120),
    imageUrl: z.string().url(),
    redirectUrl: z.string().url(),
    altText: z.string().max(160).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
});

export const updateBannerSchema = z.object({
  body: z.object({
    title: z.string().min(2).max(120).optional(),
    imageUrl: z.string().url().optional(),
    redirectUrl: z.string().url().optional(),
    altText: z.string().max(160).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().optional(),
    startDate: z.string().datetime().nullable().optional(),
    endDate: z.string().datetime().nullable().optional(),
  }),
});
