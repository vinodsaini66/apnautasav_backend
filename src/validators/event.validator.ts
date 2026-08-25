import { z } from 'zod';

const eventTypeEnum = z.enum([
  'ceremony',
  'reception',
  'mehendi',
  'sangeet',
  'haldi',
  'engagement',
  'cocktail',
  'other'
]);

const locationSchema = z.object({
  venueName: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  mapUrl: z.string().url().optional()
});

// startDateTime/endDateTime are deliberately optional here — a couple often
// knows they're doing a Sangeet before they've picked a date. The
// start-before-end check itself only runs in the controller, once both
// values are actually present.
export const createEventSchema = z.object({
  body: z.object({
    title: z.string()
      .min(3, 'Title must be at least 3 characters')
      .max(200, 'Title cannot exceed 200 characters'),
    description: z.string()
      .max(1000, 'Description cannot exceed 1000 characters')
      .optional(),
    eventType: eventTypeEnum,
    startDateTime: z.string().datetime().optional(),
    endDateTime: z.string().datetime().optional(),
    location: locationSchema.optional(),
    dressCode: z.string().max(100).optional(),
    status: z.enum(['planning', 'confirmed', 'completed', 'cancelled']).optional(),
    isPublic: z.boolean().optional(),
    estimatedBudget: z.number().min(0).optional(),
    imageUrl: z.string().url().optional()
  })
});

export const updateEventSchema = z.object({
  body: z.object({
    title: z.string()
      .min(3, 'Title must be at least 3 characters')
      .max(200, 'Title cannot exceed 200 characters')
      .optional(),
    description: z.string()
      .max(1000, 'Description cannot exceed 1000 characters')
      .optional(),
    eventType: eventTypeEnum.optional(),
    startDateTime: z.string().datetime().optional(),
    endDateTime: z.string().datetime().optional(),
    location: locationSchema.optional(),
    dressCode: z.string().max(100).optional(),
    status: z.enum(['planning', 'confirmed', 'completed', 'cancelled']).optional(),
    isPublic: z.boolean().optional(),
    estimatedBudget: z.number().min(0).optional(),
    imageUrl: z.string().url().optional()
  })
});

export const addGuestsToEventSchema = z.object({
  body: z.object({
    guestIds: z.array(z.string()).min(1, 'At least one guest ID is required')
  })
});
