import { Router } from 'express';
import { VendorController } from '../controllers/vendor.controller';
import { VendorReviewController } from '../controllers/vendor-review.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, requirePermission } from '../middleware/authorization.middleware';
import { checkResourceLimit } from '../middleware/planLimit.middleware';
import { validate } from '../middleware/validation.middleware';
import { documentUpload } from '../middleware/upload.middleware';
import { createVendorSchema, updateVendorSchema } from '../validators/vendor.validator';
import { createVendorReviewSchema } from '../validators/vendor-review.validator';

const router :Router= Router();

router.use(authMiddleware);

// Note: registered ahead of '/:weddingId/vendors/:vendorId' — not that it
// would collide (the extra literal 'from-marketplace' segment makes them
// structurally distinct paths), but this keeps the "marketplace bridge"
// endpoints grouped with create.
router.post('/:weddingId/vendors/from-marketplace/:weddingVendorId', checkWeddingAccess, requirePermission('vendors.manage'), checkResourceLimit('vendors'), VendorController.addFromMarketplace);

router.post('/:weddingId/vendors', checkWeddingAccess, requirePermission('vendors.manage'), checkResourceLimit('vendors'), validate(createVendorSchema), VendorController.createVendor);
router.post('/:weddingId/vendors/bulk-import', checkWeddingAccess, requirePermission('vendors.manage'), VendorController.bulkImportVendors);
router.get('/:weddingId/vendors', checkWeddingAccess, requirePermission('vendors.view'), VendorController.getVendors);
router.get('/:weddingId/vendors/export', checkWeddingAccess, requirePermission('vendors.details'), VendorController.exportVendors);
router.put('/:weddingId/vendors/:vendorId', checkWeddingAccess, requirePermission('vendors.manage'), validate(updateVendorSchema), VendorController.updateVendor);
router.delete('/:weddingId/vendors/:vendorId', checkWeddingAccess, requirePermission('vendors.manage'), VendorController.deleteVendor);

// Contract/invoice documents
router.post('/:weddingId/vendors/:vendorId/contracts', checkWeddingAccess, requirePermission('vendors.manage'), documentUpload.array('files', 5), VendorController.uploadContracts);
router.delete('/:weddingId/vendors/:vendorId/contracts/:documentId', checkWeddingAccess, requirePermission('vendors.manage'), VendorController.deleteContract);

// Reviews
router.post('/:weddingId/vendors/:vendorId/reviews', checkWeddingAccess, requirePermission('vendors.view'), validate(createVendorReviewSchema), VendorReviewController.submitReview);
router.get('/:weddingId/vendors/:vendorId/reviews', checkWeddingAccess, requirePermission('vendors.view'), VendorReviewController.getReviews);
router.delete('/:weddingId/vendors/:vendorId/reviews/:reviewId', checkWeddingAccess, VendorReviewController.deleteReview);

export default router;
