import { z } from 'zod';

export const createVendorSchema = z.object({
  body: z.object({
    vendorName: z.string().min(2).max(100),
    category: z.enum(['catering', 'photography', 'decoration', 'music', 'venue', 'invitations', 'logistics', 'others']),
    contactPerson: z.string().optional(),
    email: z.string().email().optional(),
    phoneNumber: z.string().min(10),
    website: z.string().url().optional(),
    estimatedCost: z.number().positive().optional(),
    actualCost: z.number().positive().optional(),
    bookingStatus: z.enum(['inquiry', 'negotiating', 'booked', 'confirmed', 'cancelled']).optional(),
    notes: z.string().optional(),
    paymentTerms: z.string().optional(),
    eventIds: z.array(z.string()).optional()
  })
});

export const updateVendorSchema = z.object({
  body: z.object({
    vendorName: z.string().min(2).max(100).optional(),
    category: z.enum(['catering', 'photography', 'decoration', 'music', 'venue', 'invitations', 'logistics', 'others']).optional(),
    contactPerson: z.string().optional(),
    email: z.string().email().optional(),
    phoneNumber: z.string().min(10).optional(),
    website: z.string().url().optional(),
    estimatedCost: z.number().positive().optional(),
    actualCost: z.number().positive().optional(),
    bookingStatus: z.enum(['inquiry', 'negotiating', 'booked', 'confirmed', 'cancelled']).optional(),
    negotiationNotes: z.string().optional(),
    notes: z.string().optional(),
    paymentTerms: z.string().optional(),
    eventIds: z.array(z.string()).optional()
  })
});
