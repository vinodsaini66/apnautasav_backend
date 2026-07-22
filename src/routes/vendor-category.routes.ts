import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { VendorCategoryController } from '../controllers/vendor-category.controller';

const router: Router = Router();

router.use(authMiddleware);

router.post('/', VendorCategoryController.createCategory);

router.get('/',VendorCategoryController.getCategories);

router.get('/:id',VendorCategoryController.getCategoryById);

router.put('/:id', VendorCategoryController.updateCategory);

router.delete('/:id', VendorCategoryController.deleteCategory
);

export default router;