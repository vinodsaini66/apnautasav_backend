import { Router } from 'express';
import { VendorMediaController } from '../controllers/vendor-media.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router: Router = Router();

router.use(authMiddleware);

/**
 * Create Vendor Media
 */
router.post(
    '/:vendorId/media',
    VendorMediaController.createMedia
);

/** 
 * {
  "albumId": "album_id",
  "type": "image",
  "url": "https://cdn.example.com/wedding.jpg",
  "thumbnailUrl": "https://cdn.example.com/thumb.jpg",
  "title": "Bride Entry",
  "description": "Bride entry photography",
  "isFeatured": true,
  "sortOrder": 1
}
 * Get Vendor Media By ID
 */

/**
 * Get Vendor Media - Paginated
 */
router.get(
    '/:vendorId/media',
    VendorMediaController.getMedia
);

/**
 * Get Media By ID
 */
router.get(
    '/:vendorId/media/:mediaId',
    VendorMediaController.getMediaById
);

/**
 * Update Media
 */
router.put(
    '/:vendorId/media/:mediaId',
    VendorMediaController.updateMedia
);

/**
 * Delete Media
 */
router.delete(
    '/:vendorId/media/:mediaId',
    VendorMediaController.deleteMedia
);

export default router;