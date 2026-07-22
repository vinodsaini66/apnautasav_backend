import { Router } from 'express';
import { WeddingVendorController } from '../controllers/wedding-vendor.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router: Router = Router();

router.use(authMiddleware);

/**
 * Create Wedding Vendor
 */
router.post(
  '/',
  WeddingVendorController.createVendor
);

/**
 * Get Wedding Vendors - Paginated
 */
router.get(
  '/',
  WeddingVendorController.getVendors
);

/**
 * Get Wedding Vendor By ID
 */
router.get(
  '/:vendorId',
  WeddingVendorController.getVendorById
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