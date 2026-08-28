import { z } from 'zod';

export const updateFcmTokenSchema = z.object({
  body: z.object({
    fcm_token: z.string().min(1, 'fcm_token is required')
  })
});

export const updateProfileSchema = z.object({
  body: z.object({
    fullName: z.string().min(2, 'Name must be at least 2 characters long').max(100, 'Name cannot exceed 100 characters').optional(),
    phoneNumber: z.string().min(7, 'Phone number is too short').max(20, 'Phone number is too long').optional()
  }).refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' })
});

export const updatePreferencesSchema = z.object({
  body: z.object({
    language: z.enum(['en', 'hi'])
  })
});

export const updateNotificationSettingsSchema = z.object({
  body: z.object({
    pushEnabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
    taskReminders: z.boolean().optional(),
    rsvpUpdates: z.boolean().optional(),
    vendorMessages: z.boolean().optional(),
    budgetAlerts: z.boolean().optional()
  }).refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' })
});
