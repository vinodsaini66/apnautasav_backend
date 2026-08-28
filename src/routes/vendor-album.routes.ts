import { Router } from 'express';
import { VendorAlbumController } from '../controllers/vendor-album.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/authorization.middleware';

const router: Router = Router();

/**
 * GET /:vendorId/albums, GET /:vendorId/albums/:albumId
 * Public — albums are part of the public vendor profile, same reasoning as
 * vendor-media.routes.ts's GET routes.
 */
router.get(
  '/:vendorId/albums',
  VendorAlbumController.getAlbums
);

router.get(
  '/:vendorId/albums/:albumId',
  VendorAlbumController.getAlbumById
);

// Admin-only write routes — auth attached per-route rather than via a
// blanket router.use(...); see wedding-vendor.routes.ts's comment for why
// (this router shares the /wedding-vendors prefix with siblings whose
// public GETs a router-wide auth check here would otherwise intercept).
router.post(
  '/:vendorId/albums',
  authMiddleware,
  requireAdmin,
  VendorAlbumController.createAlbum
);

router.put(
  '/:vendorId/albums/:albumId',
  authMiddleware,
  requireAdmin,
  VendorAlbumController.updateAlbum
);

router.delete(
  '/:vendorId/albums/:albumId',
  authMiddleware,
  requireAdmin,
  VendorAlbumController.deleteAlbum
);

export default router;