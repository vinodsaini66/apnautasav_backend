import { z } from 'zod';

// The wedding-creation flow's optional "which functions are you planning?"
// step — bulk-creates the corresponding Events alongside the wedding in one
// request. Dates are optional here too: a couple may know they're doing a
// Mehendi before they've picked when.
const weddingFunctionSchema = z.object({
  eventType: z.enum(['ceremony', 'reception', 'mehendi', 'sangeet', 'haldi', 'engagement', 'cocktail', 'baraat', 'other']),
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
    functions: z.array(weddingFunctionSchema).optional(),
    // Track C: create the wedding for a planner organization's client.
    organizationId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid organization').optional(),
    assignees: z.array(z.object({
      userId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid assignee'),
      isLead: z.boolean().optional()
    })).max(20).optional(),
    clientContact: z.object({
      name: z.string().trim().max(100).optional(),
      phone: z.string().trim().max(20).optional(),
      email: z.string().trim().email().max(200).optional().or(z.literal(''))
    }).optional()
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
const hexOrEmpty = z
  .string()
  .regex(/^(#[0-9a-fA-F]{6})?$/, 'Colour must be a hex value like #c2185b')
  .optional();

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
    giftPolicy: z.string().max(2000, 'Gift policy cannot exceed 2000 characters').optional(),
    // The couple's names as the invitation headlines them — edited from the
    // Invitation tab's "The couple" section (same fields as the wedding's own).
    groomName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
    brideName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
    // Invitation page design — see IWeddingInvitation. Colours are hex or
    // '' (clear the override and fall back to the palette).
    invitation: z
      .object({
        template: z.enum(['pastel-caricature', 'pastel-peaks', 'marigold-mela', 'shahi-raat', 'prem-patra']).optional(),
        // '' = back to the template's own default effect.
        effect: z.enum(['', 'confetti', 'colorful', 'hearts', 'stars', 'dots', 'petals', 'none']).optional(),
        palette: z.string().max(40).optional(),
        accentColor: hexOrEmpty,
        backgroundColor: hexOrEmpty,
        inkColor: hexOrEmpty,
        showInvocation: z.boolean().optional(),
        invocation: z.string().max(120).optional(),
        introLine: z.string().max(160).optional(),
        groomPhotoUrl: z.string().max(1000).optional(),
        bridePhotoUrl: z.string().max(1000).optional(),
        groomParents: z.string().max(160).optional(),
        brideParents: z.string().max(160).optional(),
        groomGrandparents: z.string().max(200).optional(),
        brideGrandparents: z.string().max(200).optional(),
        story: z.string().max(2000).optional(),
        storyQuote: z.string().max(300).optional(),
        gallery: z.array(z.string().max(1000)).max(24, 'Up to 24 gallery photos').optional(),
        musicUrl: z.string().max(1000).optional(),
        stayContacts: z
          .array(z.object({ name: z.string().min(1).max(80), role: z.string().max(80).optional(), phone: z.string().max(30).optional() }))
          .max(6)
          .optional(),
        texts: z
          .record(z.string().regex(/^[a-zA-Z]{2,40}$/, 'Invalid text key'), z.string().max(300, 'Each line can be up to 300 characters'))
          .refine((t) => Object.keys(t).length <= 60, 'Too many text overrides')
          .optional()
      })
      .optional()
  })
});