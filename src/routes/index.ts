import { Router } from 'express';
import authRoutes from './auth.routes';
import rsvpRoutes from './rsvp.routes';
import weddingRoutes from './wedding.routes';
import guestRoutes from './guest.routes';
import taskRoutes from './task.routes';
import budgetRoutes from './budget.routes';
import giftRoutes from './gift.routes';
import vendorRoutes from './vendor.routes';
import eventRoutes from './event.routes';
import collaboratorRoutes from './collaborator.routes';
import activityRoutes from './activity.routes';
import notificationRoutes from './notification.routes';
import commentRoutes from './comment.routes';
import noteRoutes from './note.routes';
import userRoutes from './user.routes';
import weddingVendorRoutes from './wedding-vendor.routes';
import vendorAlbumRoutes from './vendor-album.routes';
import vendorMediaRoutes from './vendor-media.routes';
import vendorCategoryMappingRoutes from './vendor-category-mapping.routes';
import vendorCategoryRoutes from './vendor-category.routes';
import bannerRoutes from './banner.routes';
import planRoutes from './plan.routes';
import purchaseRoutes from './purchase.routes';
import vendorEnquiryRoutes from './vendor-enquiry.routes';
import aiRoutes from './ai.routes';

const router: Router = Router();

router.use('/auth', authRoutes);
// Public guest-facing RSVP loop (Phase 2) — own top-level mount, never
// nested inside any auth-gated router (e.g. guestRoutes below, which
// applies authMiddleware to everything it exports).
router.use('/rsvp', rsvpRoutes);
router.use('/me', userRoutes);
router.use('/weddings', weddingRoutes);
router.use('/weddings', guestRoutes);
router.use('/weddings', taskRoutes);
router.use('/weddings', budgetRoutes);
router.use('/weddings', giftRoutes);
router.use('/weddings', vendorRoutes);
router.use('/weddings', eventRoutes);
router.use('/weddings', collaboratorRoutes);
router.use('/weddings', activityRoutes);
router.use('/notifications', notificationRoutes);
router.use('/weddings', commentRoutes);
router.use('/weddings', noteRoutes);
router.use('/wedding-vendors', weddingVendorRoutes);
router.use('/wedding-vendors', vendorAlbumRoutes);
router.use('/wedding-vendors', vendorMediaRoutes);
router.use('/wedding-vendors', vendorCategoryMappingRoutes);
router.use('/vendor-categories', vendorCategoryRoutes);
router.use('/banners', bannerRoutes);
router.use('/plans', planRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/vendor-enquiries', vendorEnquiryRoutes);
router.use('/weddings', aiRoutes);


export default router;