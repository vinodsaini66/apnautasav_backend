import { z } from 'zod';

export const createGuestSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(50),
    phoneNumber: z.string().optional(),
    address: z.string().optional(),
    category: z.enum(['family', 'friends', 'colleagues', 'others']),
    rsvpStatus: z.enum(['pending', 'confirmed', 'declined']).optional(),
    notes: z.string().optional(),
    isVIP: z.boolean().optional(),
    email: z.string().email().optional(),
    plusOne: z.number().min(0).optional(),
    dietaryRestrictions: z.string().optional(),
    seatingPreference: z.string().optional(),
    eventIds: z.array(z.string()).optional(),
  })
});

export const updateGuestSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(50).optional(),
    phoneNumber: z.string().optional(),
    address: z.string().optional(),
    category: z.enum(['family', 'friends', 'colleagues', 'others']).optional(),
    rsvpStatus: z.enum(['pending', 'confirmed', 'declined']).optional(),
    notes: z.string().optional(),
    isVIP: z.boolean().optional(),
    email: z.string().email().optional(),
    plusOne: z.number().min(0).optional(),
    dietaryRestrictions: z.string().optional(),
    seatingPreference: z.string().optional(),
    eventIds: z.array(z.string()).optional(),
  })
});