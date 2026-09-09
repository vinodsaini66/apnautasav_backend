import { z } from 'zod';
import { VENDOR_CATEGORIES } from '../models/vendor.model';

export const createVendorSchema = z.object({
  body: z.object({
    vendorName: z.string().min(2).max(100),
    category: z.enum(VENDOR_CATEGORIES),
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
    category: z.enum(VENDOR_CATEGORIES).optional(),
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
