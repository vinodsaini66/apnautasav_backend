import { z } from 'zod';

export const updateFcmTokenSchema = z.object({
  body: z.object({
    fcm_token: z.string().min(1, 'fcm_token is required')
  })
});
