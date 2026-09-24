import { Router } from 'express';
import { VendorOsAdminController as C } from '../../controllers/vendor-os/admin.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireAdmin } from '../../middleware/authorization.middleware';
import { validate } from '../../middleware/validation.middleware';
import {
  adminAssignOwnerSchema,
  adminPlanSchema,
  adminRejectSchema,
  adminSuspendSchema,
  adminVerificationSchema,
  createCategoryConfigSchema,
  updateCategoryConfigSchema,
} from '../../validators/vendor-os.validator';

// /vendor-os/admin — ApnaUtsav's internal console for Vendor OS. Uses the
// existing family-app admin role (a User with role 'admin').
const router: Router = Router();
router.use(authMiddleware, requireAdmin);

router.get('/vendors', C.listVendors);
router.get('/vendors/:vendorId', C.getVendor);
router.post('/vendors/:vendorId/approve', C.approve);
router.post('/vendors/:vendorId/reject', validate(adminRejectSchema), C.reject);
router.post('/vendors/:vendorId/suspend', validate(adminSuspendSchema), C.suspend);
router.patch('/vendors/:vendorId/verification', validate(adminVerificationSchema), C.verification);
router.patch('/vendors/:vendorId/plan', validate(adminPlanSchema), C.plan);
router.post('/vendors/:vendorId/assign-owner', validate(adminAssignOwnerSchema), C.assignOwner);

router.get('/categories', C.listCategories);
router.post('/categories', validate(createCategoryConfigSchema), C.createCategory);
router.patch('/categories/:key', validate(updateCategoryConfigSchema), C.updateCategory);

export default router;
