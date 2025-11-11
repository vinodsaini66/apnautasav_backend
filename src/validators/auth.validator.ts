import { z } from 'zod';

export const sendOtpSchema = z.object({
  body: z.object({
    phoneNumber: z.string()
      .regex(/^[0-9]{10,15}$/, 'Invalid phone number format')
      .min(10, 'Phone number must be at least 10 digits')
      .max(15, 'Phone number cannot exceed 15 digits')
  })
});

export const verifyOtpSchema = z.object({
  body: z.object({
    phoneNumber: z.string()
      .regex(/^[0-9]{10,15}$/, 'Invalid phone number format'),
    otp: z.string()
      .length(6, 'OTP must be 6 digits'),
    fullName: z.string()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name cannot exceed 100 characters')
      .optional(),
    email: z.string()
      .email('Invalid email format')
      .optional()
  })
});