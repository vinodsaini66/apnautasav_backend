import { Router } from 'express';
import { VendorController } from '../controllers/vendor.controller';
import { VendorReviewController } from '../controllers/vendor-review.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, checkPermission } from '../middleware/authorization.middleware';
import { checkResourceLimit } from '../middleware/planLimit.middleware';
import { validate } from '../middleware/validation.middleware';
import { documentUpload } from '../middleware/upload.middleware';
import { createVendorSchema, updateVendorSchema } from '../validators/vendor.validator';
import { createVendorReviewSchema } from '../validators/vendor-review.validator';
import { CollaboratorRole } from '../types';

const router :Router= Router();

router.use(authMiddleware);

// Note: registered ahead of '/:weddingId/vendors/:vendorId' — not that it
// would collide (the extra literal 'from-marketplace' segment makes them
// structurally distinct paths), but this keeps the "marketplace bridge"
// endpoints grouped with create.
router.post('/:weddingId/vendors/from-marketplace/:weddingVendorId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), checkResourceLimit('vendors'), VendorController.addFromMarketplace);

router.post('/:weddingId/vendors', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), checkResourceLimit('vendors'), validate(createVendorSchema), VendorController.createVendor);
router.get('/:weddingId/vendors', checkWeddingAccess, VendorController.getVendors);
router.put('/:weddingId/vendors/:vendorId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), validate(updateVendorSchema), VendorController.updateVendor);
router.delete('/:weddingId/vendors/:vendorId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), VendorController.deleteVendor);

// Contract/invoice documents
router.post('/:weddingId/vendors/:vendorId/contracts', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), documentUpload.array('files', 5), VendorController.uploadContracts);
router.delete('/:weddingId/vendors/:vendorId/contracts/:documentId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), VendorController.deleteContract);

// Reviews
router.post('/:weddingId/vendors/:vendorId/reviews', checkWeddingAccess, validate(createVendorReviewSchema), VendorReviewController.submitReview);
router.get('/:weddingId/vendors/:vendorId/reviews', checkWeddingAccess, VendorReviewController.getReviews);
router.delete('/:weddingId/vendors/:vendorId/reviews/:reviewId', checkWeddingAccess, VendorReviewController.deleteReview);

export default router;
