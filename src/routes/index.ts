import { Router } from 'express';
import authRoutes from './auth.routes';
import weddingRoutes from './wedding.routes';
import guestRoutes from './guest.routes';
import taskRoutes from './task.routes';
import budgetRoutes from './budget.routes';
import vendorRoutes from './vendor.routes';
import collaboratorRoutes from './collaborator.routes';
import activityRoutes from './activity.routes';
import notificationRoutes from './notification.routes';
import commentRoutes from './comment.routes';
import noteRoutes from './note.routes';
import userRoutes from './user.routes';
import weddingVendorRoutes from './wedding-vendor.routes';
import vendorAlbumRoutes from './vendor-album.routes';
import vendorCategoryMappingRoutes from './vendor-category-mapping.routes';
import vendorCategoryRoutes from './vendor-category.routes';

const router: Router = Router();

router.use('/auth', authRoutes);
router.use('/me', userRoutes);
router.use('/weddings', weddingRoutes);
router.use('/weddings', guestRoutes);
router.use('/weddings', taskRoutes);
router.use('/weddings', budgetRoutes);
router.use('/weddings', vendorRoutes);
router.use('/weddings', collaboratorRoutes);
router.use('/weddings', activityRoutes);
router.use('/notifications', notificationRoutes);
router.use('/comments', commentRoutes);
router.use('/weddings', noteRoutes);
router.use('/wedding-vendors', weddingVendorRoutes);
router.use('/wedding-vendors', vendorAlbumRoutes);
router.use('/wedding-vendors', vendorCategoryMappingRoutes);
router.use('/vendor-categories', vendorCategoryRoutes);


export default router;