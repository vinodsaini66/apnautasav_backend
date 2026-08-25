import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { VendorCategoryController } from '../controllers/vendor-category.controller';

const router: Router = Router();

/**
 * GET /vendor-categories/public
 * Unauthenticated — feeds the "Business/Service Category" dropdown on the
 * public landing-page vendor enquiry form. Deliberately ahead of
 * authMiddleware below, mirroring GET /plans's public-catalog precedent.
 */
router.get('/public', VendorCategoryController.getPublicCategories);

router.use(authMiddleware);

router.post('/', VendorCategoryController.createCategory);

router.get('/',VendorCategoryController.getCategories);

router.get('/:id',VendorCategoryController.getCategoryById);

router.put('/:id', VendorCategoryController.updateCategory);

router.delete('/:id', VendorCategoryController.deleteCategory
);

export default router;