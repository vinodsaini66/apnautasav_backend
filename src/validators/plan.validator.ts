import { z } from 'zod';

const limitsSchema = z.object({
  guests: z.number().int(),
  tasks: z.number().int(),
  vendors: z.number().int(),
  collaborators: z.number().int(),
});

export const createPlanSchema = z.object({
  body: z.object({
    key: z.string().min(2).max(60),
    name: z.string().min(2).max(120),
    description: z.string().max(500).optional(),
    type: z.enum(['free', 'one_time', 'subscription']),
    price: z.number().min(0),
    currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).optional(),
    billingPeriod: z.enum(['monthly', 'annual']).nullable().optional(),
    limits: limitsSchema,
    budgetEnabled: z.boolean().optional(),
    maxWeddings: z.number().int().nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().optional(),
  }),
});

export const updatePlanSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(120).optional(),
    description: z.string().max(500).optional(),
    price: z.number().min(0).optional(),
    currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).optional(),
    billingPeriod: z.enum(['monthly', 'annual']).nullable().optional(),
    limits: limitsSchema.optional(),
    budgetEnabled: z.boolean().optional(),
    maxWeddings: z.number().int().nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().optional(),
  }),
});
