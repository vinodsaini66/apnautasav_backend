import { z } from 'zod';

// The wedding-creation flow's optional "which functions are you planning?"
// step — bulk-creates the corresponding Events alongside the wedding in one
// request. Dates are optional here too: a couple may know they're doing a
// Mehendi before they've picked when.
const weddingFunctionSchema = z.object({
  eventType: z.enum(['ceremony', 'reception', 'mehendi', 'sangeet', 'haldi', 'engagement', 'cocktail', 'other']),
  title: z.string().min(3).max(200).optional(),
  startDateTime: z.string().datetime().optional()
});

export const createWeddingSchema = z.object({
  body: z.object({
    brideName: z.string().min(2).max(100),
    groomName: z.string().min(2).max(100),
    weddingDate: z.string().date(),
    name: z.string().min(2).max(200),
    location: z.string().min(2).max(200),
    totalBudget: z.number().positive(),
    currency: z.enum(['INR', 'USD', 'GBP', 'EUR', 'CAD', 'AUD', 'AED']).optional(),
    description: z.string().max(500).optional(),
    imageUrl: z.string().url().optional(),
    functions: z.array(weddingFunctionSchema).optional()
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
    currency: z.enum(['INR', 'USD', 'GBP', 'EUR', 'CAD', 'AUD', 'AED']).optional(),
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

// Public wedding website toggle (#29). publicSlug is optional — when
// enabling for the first time without one, the controller auto-generates
// it from bride+groom names. The four guest-facing info fields below
// (redesign) are independently optional — only whichever are present in
// the request body get updated, the rest are left untouched.
export const updatePublicSettingsSchema = z.object({
  body: z.object({
    isPublic: z.boolean(),
    publicSlug: z
      .string()
      .min(3, 'Custom link must be at least 3 characters')
      .max(120)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Custom link may only contain lowercase letters, numbers, and hyphens')
      .optional(),
    venueAddress: z.string().max(500, 'Venue address cannot exceed 500 characters').optional(),
    accommodationInfo: z.string().max(2000, 'Accommodation info cannot exceed 2000 characters').optional(),
    pickupInfo: z.string().max(2000, 'Pickup info cannot exceed 2000 characters').optional(),
    giftPolicy: z.string().max(2000, 'Gift policy cannot exceed 2000 characters').optional()
  })
});