import { Router } from 'express';
import { BannerController } from '../controllers/banner.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/authorization.middleware';
import { validate } from '../middleware/validation.middleware';
import { imageUpload } from '../middleware/upload.middleware';
import { createBannerSchema, updateBannerSchema } from '../validators/banner.validator';

const router: Router = Router();

router.use(authMiddleware);

/**
 * GET /banners/active
 * What the dashboard banner carousel renders. Any logged-in user.
 */
router.get('/active', BannerController.getActiveBanners);

/**
 * POST /banners/:bannerId/click
 * Fired by the frontend right before following a banner's redirectUrl.
 * Any logged-in user (not admin-only, unlike everything else below).
 */
router.post('/:bannerId/click', BannerController.trackClick);

// Everything below is admin-only: uploading and managing sponsor banners.
router.use(requireAdmin);

/**
 * POST /banners/upload
 * multipart/form-data, field name "image". Returns { url }, which is then
 * sent as `imageUrl` when creating/updating a banner below.
 */
router.post('/upload', imageUpload.single('image'), BannerController.uploadImage);

router.post('/', validate(createBannerSchema), BannerController.createBanner);
router.get('/', BannerController.getAllBanners);
router.get('/:bannerId', BannerController.getBannerById);
router.put('/:bannerId', validate(updateBannerSchema), BannerController.updateBanner);
router.delete('/:bannerId', BannerController.deleteBanner);

export default router;
