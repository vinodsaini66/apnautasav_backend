import { Router } from 'express';
import { VendorCategoryMappingController } from '../controllers/vendor-category-mapping.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router: Router = Router();

// Auth attached per-route rather than via a blanket router.use(...) — this
// router shares the /wedding-vendors prefix with siblings that have public
// GET routes (wedding-vendor/vendor-album/vendor-media.routes.ts); a
// router-wide auth check here would otherwise intercept requests meant for
// those, since it's mounted after them and Express only reaches this
// router once the earlier ones fall through. Behavior is unchanged — every
// route here still requires auth, just scoped explicitly instead of
// implicitly via .use().
router.post('/:vendorId/categories', authMiddleware, VendorCategoryMappingController.createMapping);

router.get('/:vendorId/categories', authMiddleware, VendorCategoryMappingController.getVendorCategories);

router.put('/:vendorId/categories/:mappingId', authMiddleware, VendorCategoryMappingController.updateMapping);

router.delete('/:vendorId/categories/:mappingId', authMiddleware, VendorCategoryMappingController.deleteMapping);

export default router;
/**
 * 
 * 
 *
POST   /api/wedding-vendors/:vendorId/categories
GET    /api/wedding-vendors/:vendorId/categories
PUT    /api/wedding-vendors/:vendorId/categories/:mappingId
DELETE /api/wedding-vendors/:vendorId/categories/:mappingId
 */