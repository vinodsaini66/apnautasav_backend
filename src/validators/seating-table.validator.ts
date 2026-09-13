import { z } from 'zod';

export const createSeatingTableSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Table name is required').max(100),
    capacity: z.number().int().min(1, 'Capacity must be at least 1').max(100),
    eventId: z.string().optional(),
    notes: z.string().max(300).optional()
  })
});

export const updateSeatingTableSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    capacity: z.number().int().min(1).max(100).optional(),
    eventId: z.string().nullable().optional(),
    notes: z.string().max(300).optional()
  })
});

export const assignGuestSchema = z.object({
  body: z.object({
    guestId: z.string().min(1, 'guestId is required')
  })
});
