import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5000'),
  MONGODB_URI: z.string(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  OTP_EXPIRY_MINUTES: z.string().default('10'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_S3_BUCKET: z.string().optional(),
  // Cloudflare R2 (S3-compatible, free egress). Used instead of AWS S3 for
  // uploads once all four are set — see config/s3.ts.
  CLOUDFLARE_ACCESS_KEY_ID: z.string().optional(),
  CLOUDFLARE_SECRET_ACCESS_KEY: z.string().optional(),
  CLOUDFLARE_BUCKET: z.string().optional(),
  CLOUDFLARE_S3_ENDPOINT: z.string().optional(),
  // Public base URL the files are served from: the bucket's r2.dev URL for
  // now, a custom domain (e.g. https://media.apnautsav.com) later.
  CLOUDFLARE_PUBLIC_URL: z.string().optional(),
  // AI Assistant (services/ai.service.ts). The key is optional: without it
  // the AI routes answer 503 and the rest of the API works as usual.
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-haiku-5-5'),
  // AI calls (voice extract + chat) allowed per day (IST): each person on a
  // wedding gets their own share, and the wedding as a whole has a cap.
  AI_USER_DAILY_LIMIT: z.coerce.number().int().positive().default(20),
  AI_WEDDING_DAILY_LIMIT: z.coerce.number().int().positive().default(60),
});

type EnvConfig = z.infer<typeof envSchema>;

const validateEnv = (): EnvConfig => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error('❌ Invalid environment variables:', error);
    process.exit(1);
  }
};

export const env = validateEnv();