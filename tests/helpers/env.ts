// Runs before any test module is imported (jest `setupFiles`), so code that
// reads env at import time sees test values. dotenv never overrides a var
// that's already set, so the empty strings below keep the developer's real
// .env keys (email, SMS, push, Redis, S3) from being picked up — tests must
// never send real email/SMS or touch real infra.
Object.assign(process.env, {
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://unused-in-tests',
  JWT_SECRET: 'test-jwt-secret-at-least-32-characters-long',
  JWT_REFRESH_SECRET: 'test-jwt-refresh-secret-at-least-32-chars',
  FRONTEND_URL: 'http://localhost:3000',
  BREVO_API_KEY: '',
  SMTP_HOST: '',
  SMTP_USER: '',
  SMTP_PASS: '',
  REDIS_URL: '',
  TWILIO_ACCOUNT_SID: '',
  TWILIO_AUTH_TOKEN: '',
  FIREBASE_PROJECT_ID: '',
  FIREBASE_PRIVATE_KEY: '',
  FIREBASE_CLIENT_EMAIL: '',
  AWS_ACCESS_KEY_ID: '',
  AWS_SECRET_ACCESS_KEY: '',
  ANTHROPIC_API_KEY: '',
});
