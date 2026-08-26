import { z } from 'zod';

export const createBudgetInstallmentSchema = z.object({
  body: z.object({
    label: z.string().min(1).max(200),
    amount: z.number().positive(),
    dueDate: z.coerce.date().optional(),
    notes: z.string().optional()
  })
});

export const updateBudgetInstallmentSchema = z.object({
  body: z.object({
    label: z.string().min(1).max(200).optional(),
    amount: z.number().positive().optional(),
    dueDate: z.coerce.date().optional(),
    status: z.enum(['pending', 'paid']).optional(),
    paidDate: z.coerce.date().optional(),
    notes: z.string().optional()
  })
});
