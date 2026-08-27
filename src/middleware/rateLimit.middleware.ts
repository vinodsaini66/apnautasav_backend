import rateLimit from 'express-rate-limit';

export const rateLimitMiddleware = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5'),
  message: 'Too many authentication attempts, please try again later',
  skipSuccessfulRequests: true
});

// Public guest-facing RSVP form (src/routes/rsvp.routes.ts, Phase 2) — the
// app-wide rateLimitMiddleware above defaults to 100 req/15min, which is
// too loose for an unauthenticated route reachable by anyone holding (or
// guessing at) a token; this is generous enough for a real guest loading
// the page and submitting once, while still blocking rapid automated
// hammering of the token space.
export const rsvpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RSVP_RATE_LIMIT_MAX || '20'),
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});