import { Router } from 'express';
import { WeddingVendorController } from '../controllers/wedding-vendor.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router: Router = Router();

/**
 * GET /wedding-vendors, GET /wedding-vendors/:vendorId
 * Unauthenticated — this is the public vendor directory (browsable by
 * anyone, like the blog), not the per-wedding vendor tracker. Deliberately
 * ahead of authMiddleware below, mirroring GET /vendor-categories/public's
 * precedent for this same directory.
 */
router.get(
  '/',
  WeddingVendorController.getVendors
);

router.get(
  '/:vendorId',
  WeddingVendorController.getVendorById
);

router.use(authMiddleware);

/**
 * Create Wedding Vendor
 */
router.post(
  '/',
  WeddingVendorController.createVendor
);

/**
 * Update Wedding Vendor
 */
router.put(
  '/:vendorId',
  WeddingVendorController.updateVendor
);

/**
 * Delete Wedding Vendor
 */
router.delete(
  '/:vendorId',
  WeddingVendorController.deleteVendor
);

export default router;
