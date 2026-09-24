import { Router } from 'express';
import authRoutes from './auth.routes';
import adminRoutes from './admin.routes';
import panelRoutes from './panel.routes';
import { familyRouter, publicRouter } from './public.routes';

// Vendor OS — mounted at /api/v1/vendor-os (routes/index.ts).
//   /auth    vendor phone-OTP login + onboarding (own JWT, separate from /auth)
//   /public  no-login family-facing endpoints (availability, quote links)
//   /family  family-app JWT: my quotes, my vendor bookings, bulk enquiry
//   /admin   family-app admin role: approve/verify/plan/categories
//   /*       the vendor panel itself (vendorAuth)
// Order matters: the panel router applies vendorAuth to everything it
// sees, so it must come last.
const router: Router = Router();

router.use('/auth', authRoutes);
router.use('/public', publicRouter);
router.use('/family', familyRouter);
router.use('/admin', adminRoutes);
router.use('/', panelRoutes);

export default router;
