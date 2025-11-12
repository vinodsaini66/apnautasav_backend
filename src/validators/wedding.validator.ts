import { z } from 'zod';

export const createWeddingSchema = z.object({
  body: z.object({
    brideName: z.string().min(2).max(100),
    groomName: z.string().min(2).max(100),
    weddingDate: z.string().date(),
    name: z.string().min(2).max(200),
    location: z.string().min(2).max(200),
    totalBudget: z.number().positive(),
    currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).optional(),
    description: z.string().max(500).optional(),
    imageUrl: z.string().url().optional()
  })
});

export const updateWeddingSchema = z.object({
  body: z.object({
    brideName: z.string().min(2).max(100),
    groomName: z.string().min(2).max(100),
    weddingDate: z.string().date(),
    name: z.string().min(2).max(200),
    location: z.string().min(2).max(200),
    totalBudget: z.number().positive(),
    currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).optional(),
    status: z.enum(['planning', 'ongoing', 'completed']).optional(),
    description: z.string().max(500).optional(),
    imageUrl: z.string().url().optional()
  })
});

export const joinWeddingSchema = z.object({
  body: z.object({
    weddingCode: z.string().length(6, 'Wedding code must be 6 characters')
  })
});