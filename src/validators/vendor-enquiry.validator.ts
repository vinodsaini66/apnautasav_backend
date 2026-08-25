import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const createVendorEnquirySchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    businessName: z.string().trim().min(2).max(150),
    email: z.string().trim().email(),
    phoneNumber: z.string().trim().min(7).max(20),
    categoryId: z.string().regex(objectIdRegex, 'Invalid category'),
    city: z.string().trim().max(100).optional(),
    message: z.string().trim().min(10).max(1000),
  }),
});

export const updateVendorEnquiryStatusSchema = z.object({
  body: z.object({
    status: z.enum(['new', 'contacted', 'closed']),
  }),
});
