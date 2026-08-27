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

// POST /rsvp/:token (public, unauthenticated) — the guest's own
// self-service submission. Deliberately narrow: only the fields a guest is
// allowed to set about themselves. 'pending' is intentionally excluded —
// a guest only ever actively confirms or declines here.
export const rsvpSubmitSchema = z.object({
  body: z.object({
    rsvpStatus: z.enum(['confirmed', 'declined']),
    plusOne: z.number().min(0).optional(),
    dietaryRestrictions: z.string().optional(),
    notes: z.string().optional(),
  })
});

// POST /:weddingId/guests/compose — digital invitations + guest
// communication (#2 + #7).
export const composeGuestsSchema = z.object({
  body: z.object({
    guestIds: z.array(z.string()).min(1, 'At least one guest is required'),
    channel: z.enum(['sms', 'email']),
    message: z.string().min(1, 'Message is required').max(2000),
  })
});