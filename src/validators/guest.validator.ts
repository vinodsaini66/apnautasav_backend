import { z } from 'zod';

// Optional per-guest travel/stay details (destination/guest-house weddings).
// Every level optional — a normal wedding simply never sends this at all.
// Admin/collaborator-entered only via create/update, never part of
// rsvpSubmitSchema below (the guest's own self-service submission stays
// deliberately narrow).
const guestLogisticsSchema = z.object({
  accommodation: z.object({
    roomLabel: z.string().optional(),
    checkIn: z.string().optional(),
    checkOut: z.string().optional(),
    notes: z.string().optional(),
  }).optional(),
  transport: z.object({
    pickupLocation: z.string().optional(),
    pickupTime: z.string().optional(),
    vehicleLabel: z.string().optional(),
    notes: z.string().optional(),
  }).optional(),
  meal: z.object({
    preference: z.enum(['veg', 'non-veg', 'jain', 'vegan', 'other']).optional(),
    notes: z.string().optional(),
  }).optional(),
}).optional();

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
    logistics: guestLogisticsSchema,
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
    logistics: guestLogisticsSchema,
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

// POST /rsvp/:token/note (public, unauthenticated) — a guest leaving a
// note for the couple. Deliberately narrow, same spirit as
// rsvpSubmitSchema above.
export const submitGuestNoteSchema = z.object({
  body: z.object({
    message: z.string().trim().min(2, 'Message must be at least 2 characters').max(1000, 'Message cannot exceed 1000 characters'),
  })
});

// POST /:weddingId/guests/bulk-import — CSV/bulk guest import. Deliberately
// loose (every field optional, no enum/email format enforcement here): a
// real CSV a family exports from Excel/Google Contacts is messy (a
// "Category" column with "Family " or blank, a phone number with dashes),
// and one bad row shouldn't zod-reject the whole batch before the
// controller even gets a chance to sanitize row-by-row and report which
// specific rows failed. GuestController.bulkImportGuests does the real
// per-row validation/defaulting.
export const bulkImportGuestsSchema = z.object({
  body: z.object({
    guests: z
      .array(z.record(z.string(), z.any()))
      .min(1, 'At least one guest row is required')
      .max(500, 'A single import is limited to 500 guests at a time'),
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