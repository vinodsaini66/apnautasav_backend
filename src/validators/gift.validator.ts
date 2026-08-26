import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const createGiftSchema = z.object({
  body: z.object({
    guestId: z.string().regex(objectIdRegex, 'Invalid guest id').optional(),
    giverName: z.string().min(2).max(200),
    amount: z.number().positive(),
    currency: z.string().optional(),
    eventId: z.string().regex(objectIdRegex, 'Invalid event id').optional(),
    receivedDate: z.coerce.date().optional(),
    notes: z.string().optional()
  })
});

export const updateGiftSchema = z.object({
  body: z.object({
    guestId: z.string().regex(objectIdRegex, 'Invalid guest id').optional(),
    giverName: z.string().min(2).max(200).optional(),
    amount: z.number().positive().optional(),
    currency: z.string().optional(),
    eventId: z.string().regex(objectIdRegex, 'Invalid event id').optional(),
    receivedDate: z.coerce.date().optional(),
    notes: z.string().optional()
  })
});
