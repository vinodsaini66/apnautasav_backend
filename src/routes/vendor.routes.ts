import { Router } from 'express';
import { VendorController } from '../controllers/vendor.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, checkPermission } from '../middleware/authorization.middleware';
import { checkResourceLimit } from '../middleware/planLimit.middleware';
import { validate } from '../middleware/validation.middleware';
import { createVendorSchema, updateVendorSchema } from '../validators/vendor.validator';
import { CollaboratorRole } from '../types';

const router :Router= Router();

router.use(authMiddleware);

router.post('/:weddingId/vendors', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), checkResourceLimit('vendors'), validate(createVendorSchema), VendorController.createVendor);
router.get('/:weddingId/vendors', checkWeddingAccess, VendorController.getVendors);
router.put('/:weddingId/vendors/:vendorId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), validate(updateVendorSchema), VendorController.updateVendor);
router.delete('/:weddingId/vendors/:vendorId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), VendorController.deleteVendor);

export default router;