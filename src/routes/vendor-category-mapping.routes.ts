import { Router } from 'express';
import { VendorCategoryMappingController } from '../controllers/vendor-category-mapping.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router: Router = Router();

router.use(authMiddleware);

router.post('/:vendorId/categories', VendorCategoryMappingController.createMapping);

router.get('/:vendorId/categories', VendorCategoryMappingController.getVendorCategories);

router.put('/:vendorId/categories/:mappingId', VendorCategoryMappingController.updateMapping);

router.delete('/:vendorId/categories/:mappingId', VendorCategoryMappingController.deleteMapping);

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