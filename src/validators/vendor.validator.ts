import { z } from 'zod';

export const createVendorSchema = z.object({
  body: z.object({
    vendorName: z.string().min(2).max(100),
    category: z.enum(['catering', 'photography', 'decoration', 'music', 'venue', 'invitations', 'logistics', 'other']),
    contactPerson: z.string().optional(),
    email: z.string().email().optional(),
    phoneNumber: z.string().min(10),
    website: z.string().url().optional(),
    estimatedCost: z.number().positive(),
    actualCost: z.number().positive().optional(),
    bookingStatus: z.enum(['inquiry', 'negotiating', 'booked', 'confirmed', 'cancelled']).optional(),
    negotiationNotes: z.string().optional(),
    contractUrl: z.string().url().optional(),
    paymentTerms: z.string().optional(),
    rating: z.number().min(0).max(5).optional(),
    reviews: z.string().optional()
  })
});

export const updateVendorSchema = z.object({
  body: z.object({
    vendorName: z.string().min(2).max(100).optional(),
    category: z.enum(['catering', 'photography', 'decoration', 'music', 'venue', 'invitations', 'logistics', 'other']).optional(),
    contactPerson: z.string().optional(),
    email: z.string().email().optional(),
    phoneNumber: z.string().min(10).optional(),
    website: z.string().url().optional(),
    estimatedCost: z.number().positive().optional(),
    actualCost: z.number().positive().optional(),
    bookingStatus: z.enum(['inquiry', 'negotiating', 'booked', 'confirmed', 'cancelled']).optional(),
    negotiationNotes: z.string().optional(),
    contractUrl: z.string().url().optional(),
    paymentTerms: z.string().optional(),
    rating: z.number().min(0).max(5).optional(),
    reviews: z.string().optional()
  })
});