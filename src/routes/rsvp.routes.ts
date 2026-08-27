import { Router } from 'express';
import { RsvpController } from '../controllers/rsvp.controller';
import { rsvpRateLimiter } from '../middleware/rateLimit.middleware';
import { validate } from '../middleware/validation.middleware';
import { rsvpSubmitSchema } from '../validators/guest.validator';

/**
 * GET /rsvp/:token, POST /rsvp/:token
 * The guest-facing public RSVP loop (#1) — deliberately unauthenticated
 * (no authMiddleware, own top-level file, NOT nested inside
 * guest.routes.ts's auth-gated router), reached only via the long random
 * rsvpToken mailed/texted to one guest — never the wedding's short 6-char
 * weddingCode. Mirrors wedding.routes.ts's `/public/:slug` public-route
 * precedent from Phase 8. Both routes carry their own scoped rsvpRateLimiter
 * (~20 req/15min/IP) — generous enough for a real guest submitting once,
 * tight enough to block automated hammering of the token space. This does
 * NOT touch the app-wide rateLimitMiddleware, which stays commented out in
 * server.ts.
 */
const router: Router = Router();

router.get('/:token', rsvpRateLimiter, RsvpController.getRsvp);
router.post('/:token', rsvpRateLimiter, validate(rsvpSubmitSchema), RsvpController.submitRsvp);

export default router;
