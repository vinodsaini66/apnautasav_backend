import { Router } from 'express';
import { WeddingVendorController } from '../controllers/wedding-vendor.controller';
import { authMiddleware, optionalAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/authorization.middleware';

const router: Router = Router();

/**
 * GET /wedding-vendors, GET /wedding-vendors/:vendorId
 * Public — this is the public vendor directory (browsable by anyone, like
 * the blog), not the per-wedding vendor tracker. `optionalAuth` (not
 * `authMiddleware`) so the request never fails for an anonymous caller, but
 * `req.user` is populated when a valid token IS sent — the controller uses
 * that to decide whether to include contact details (phone/whatsapp/email)
 * in the response.
 */
router.get(
  '/',
  optionalAuth,
  WeddingVendorController.getVendors
);

router.get(
  '/:vendorId',
  optionalAuth,
  WeddingVendorController.getVendorById
);

/**
 * Create/update/delete a marketplace listing — platform-level content, not
 * scoped to any one wedding, so this is admin-only (mirrors banner.routes.ts
 * and plan.routes.ts's use of requireAdmin), not just "any logged-in user".
 *
 * `authMiddleware`/`requireAdmin` are attached per-route rather than via a
 * blanket `router.use(...)` deliberately: several sibling routers
 * (vendor-album/vendor-media/vendor-category-mapping.routes.ts) are mounted
 * on this same `/wedding-vendors` prefix. An unscoped `router.use(auth...)`
 * here would intercept — and 401 — any request for THEIR paths too whenever
 * it doesn't match this router's own `/` or `/:vendorId` patterns, since
 * Express only advances to the next mounted router once this one's stack
 * calls next() all the way through (which a blocking auth check never does
 * for an unauthenticated request). Keeping auth scoped to the exact routes
 * that need it avoids that whole class of cross-router bug.
 */
router.post(
  '/',
  authMiddleware,
  requireAdmin,
  WeddingVendorController.createVendor
);

router.put(
  '/:vendorId',
  authMiddleware,
  requireAdmin,
  WeddingVendorController.updateVendor
);

router.delete(
  '/:vendorId',
  authMiddleware,
  requireAdmin,
  WeddingVendorController.deleteVendor
);

export default router;
