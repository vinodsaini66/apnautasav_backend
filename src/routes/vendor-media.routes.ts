import { Router } from 'express';
import { VendorMediaController } from '../controllers/vendor-media.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/authorization.middleware';

const router: Router = Router();

/**
 * GET /:vendorId/media, GET /:vendorId/media/:mediaId
 * Public — portfolio photos/videos are part of the public vendor profile
 * (like the listing itself), not private data. Mirrors
 * wedding-vendor.routes.ts's GET routes sitting ahead of authMiddleware.
 */
router.get(
    '/:vendorId/media',
    VendorMediaController.getMedia
);

router.get(
    '/:vendorId/media/:mediaId',
    VendorMediaController.getMediaById
);

/**
 * Create/update/delete portfolio media — platform-level content curated by
 * the team, not by the wedding-owner submitting it, so admin-only (same
 * reasoning as wedding-vendor.routes.ts's write routes). Auth is attached
 * per-route rather than via a blanket router.use(...) — see
 * wedding-vendor.routes.ts's comment for why (this router shares the
 * /wedding-vendors prefix with siblings whose public GETs a router-wide
 * auth check here would otherwise intercept).
 *
 * {
 *   "albumId": "album_id",
 *   "type": "image",
 *   "url": "https://cdn.example.com/wedding.jpg",
 *   "thumbnailUrl": "https://cdn.example.com/thumb.jpg",
 *   "title": "Bride Entry",
 *   "description": "Bride entry photography",
 *   "isFeatured": true,
 *   "sortOrder": 1
 * }
 */
router.post(
    '/:vendorId/media',
    authMiddleware,
    requireAdmin,
    VendorMediaController.createMedia
);

router.put(
    '/:vendorId/media/:mediaId',
    authMiddleware,
    requireAdmin,
    VendorMediaController.updateMedia
);

router.delete(
    '/:vendorId/media/:mediaId',
    authMiddleware,
    requireAdmin,
    VendorMediaController.deleteMedia
);

export default router;