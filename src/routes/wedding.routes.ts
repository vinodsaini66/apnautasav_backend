import { Router } from 'express';
import { WeddingController } from '../controllers/wedding.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, checkPermission } from '../middleware/authorization.middleware';
import { checkWeddingCreationLimit } from '../middleware/planLimit.middleware';
import { validate } from '../middleware/validation.middleware';
import { createWeddingSchema, updateWeddingSchema, joinWeddingSchema, updatePublicSettingsSchema } from '../validators/wedding.validator';
import { CollaboratorRole } from '../types';

const router: Router = Router();

/**
 * GET /weddings/public/:slug, GET /weddings/public/:slug/events
 * The wedding website (#29) — deliberately public (no authMiddleware),
 * mirroring GET /plans and GET /wedding-vendors' precedent for this app's
 * other unauthenticated, browsable pages. Both 404 generically for a
 * missing slug or a wedding that's toggled isPublic: false, never
 * distinguishing the two so a slug's existence can't be probed.
 */
router.get('/public/:slug', WeddingController.getPublicWeddingBySlug);
router.get('/public/:slug/events', WeddingController.getPublicWeddingEvents);

router.use(authMiddleware);

router.post('/', checkWeddingCreationLimit, validate(createWeddingSchema), WeddingController.createWedding);
router.get('/', WeddingController.getWeddings);
router.get('/invitations', WeddingController.getWeddingInvitation);
router.put('/invite/:inviteId', WeddingController.updateWeddingInvitation);
router.post('/join', validate(joinWeddingSchema), WeddingController.joinWedding);
router.get('/:weddingId', checkWeddingAccess, WeddingController.getWeddingById);
router.get('/:weddingId/plan', checkWeddingAccess, WeddingController.getWeddingPlan);
router.put('/:weddingId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), validate(updateWeddingSchema), WeddingController.updateWedding);
router.delete('/:weddingId', checkWeddingAccess, checkPermission(CollaboratorRole.ADMIN), WeddingController.deleteWedding);
router.get('/:weddingId/stats', checkWeddingAccess, WeddingController.getWeddingStats);
router.put('/:weddingId/public-settings', checkWeddingAccess, checkPermission(CollaboratorRole.ADMIN), validate(updatePublicSettingsSchema), WeddingController.updatePublicSettings);
router.get('/:weddingId/search', checkWeddingAccess, WeddingController.globalSearch);
router.get('/:weddingId/recommended-vendors', checkWeddingAccess, WeddingController.getRecommendedVendors);
router.get('/:weddingId/calendar.ics', checkWeddingAccess, WeddingController.getWeddingCalendar);

export default router;