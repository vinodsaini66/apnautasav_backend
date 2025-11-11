import { z } from 'zod';

export const createGuestSchema = z.object({
  body: z.object({
    firstName: z.string().min(2).max(50),
    lastName: z.string().min(2).max(50),
    email: z.string().email().optional(),
    phoneNumber: z.string().optional(),
    category: z.enum(['family', 'friends', 'colleagues', 'others']),
    plusOne: z.number().min(0).optional(),
    rsvpStatus: z.enum(['pending', 'confirmed', 'declined']).optional(),
    dietaryRestrictions: z.string().optional(),
    seatingPreference: z.string().optional(),
    notes: z.string().optional()
  })
});

export const updateGuestSchema = z.object({
  body: z.object({
    firstName: z.string().min(2).max(50).optional(),
    lastName: z.string().min(2).max(50).optional(),
    email: z.string().email().optional(),
    phoneNumber: z.string().optional(),
    category: z.enum(['family', 'friends', 'colleagues', 'others']).optional(),
    plusOne: z.number().min(0).optional(),
    rsvpStatus: z.enum(['pending', 'confirmed', 'declined']).optional(),
    dietaryRestrictions: z.string().optional(),
    seatingPreference: z.string().optional(),
    notes: z.string().optional()
  })
});