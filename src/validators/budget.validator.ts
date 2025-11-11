import { z } from 'zod';

export const createBudgetSchema = z.object({
  body: z.object({
    category: z.enum(['venue', 'catering', 'decoration', 'photography', 'music', 'invitations', 'logistics', 'other']),
    description: z.string().min(3).max(200),
    estimatedCost: z.number().positive(),
    actualCost: z.number().positive().optional(),
    vendor: z.string().optional(),
    status: z.enum(['estimated', 'approved', 'paid', 'pending']).optional(),
    paymentDate: z.string().datetime().optional(),
    currency: z.string().optional(),
    notes: z.string().optional()
  })
});

export const updateBudgetSchema = z.object({
  body: z.object({
    category: z.enum(['venue', 'catering', 'decoration', 'photography', 'music', 'invitations', 'logistics', 'other']).optional(),
    description: z.string().min(3).max(200).optional(),
    estimatedCost: z.number().positive().optional(),
    actualCost: z.number().positive().optional(),
    vendor: z.string().optional(),
    status: z.enum(['estimated', 'approved', 'paid', 'pending']).optional(),
    paymentDate: z.string().datetime().optional(),
    currency: z.string().optional(),
    notes: z.string().optional()
  })
});