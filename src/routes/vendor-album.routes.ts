import { Router } from 'express';
import { VendorAlbumController } from '../controllers/vendor-album.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router: Router = Router();

router.use(authMiddleware);

/**
 * Create Album For Vendor
 */
router.post(
  '/:vendorId/albums',
  VendorAlbumController.createAlbum
);

/**
 * Get Vendor Albums - Paginated
 */
router.get(
  '/:vendorId/albums',
  VendorAlbumController.getAlbums
);

/**
 * Get Album By ID
 */
router.get(
  '/:vendorId/albums/:albumId',
  VendorAlbumController.getAlbumById
);

/**
 * Update Album
 */
router.put(
  '/:vendorId/albums/:albumId',
  VendorAlbumController.updateAlbum
);

/**
 * Delete Album
 */
router.delete(
  '/:vendorId/albums/:albumId',
  VendorAlbumController.deleteAlbum
);

export default router;