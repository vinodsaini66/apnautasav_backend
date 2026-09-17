import { z } from 'zod';

export const sendOtpSchema = z.object({
  body: z.object({
    phoneNumber: z.string()
      .regex(/^[0-9]{10,15}$/, 'Invalid phone number format')
      .min(10, 'Phone number must be at least 10 digits')
      .max(15, 'Phone number cannot exceed 15 digits').optional(),
      email: z.string()
      .email('Invalid email format'),
  })
});

export const verifyOtpSchema = z.object({
  body: z.object({
    phoneNumber: z.string()
      .regex(/^[0-9]{10,15}$/, 'Invalid phone number format').optional(),
    otp: z.string()
      .length(6, 'OTP must be 6 digits'),
    fullName: z.string()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name cannot exceed 100 characters')
      .optional(),
    email: z.string()
      .email('Invalid email format'),
    fcm_token: z.string()
      .max(500, 'FCM token is too long')
      .optional()
  })
});

// Email + password auth (new flow, alongside the OTP flow above).
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long');

export const signupSchema = z.object({
  body: z.object({
    fullName: z.string()
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name cannot exceed 100 characters'),
    email: z.string()
      .email('Invalid email format'),
    password: passwordSchema
  })
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string()
      .email('Invalid email format'),
    password: z.string()
      .min(1, 'Password is required')
  })
});

export const verifyEmailSchema = z.object({
  body: z.object({
    token: z.string()
      .min(1, 'Verification token is required')
  })
});

export const resendVerificationSchema = z.object({
  body: z.object({
    email: z.string()
      .email('Invalid email format')
  })
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string()
      .email('Invalid email format')
  })
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string()
      .min(1, 'Reset token is required'),
    password: passwordSchema
  })
});