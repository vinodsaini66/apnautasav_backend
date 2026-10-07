import { Router } from 'express';
import { GuestController } from '../controllers/guest.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, requirePermission } from '../middleware/authorization.middleware';
import { checkResourceLimit } from '../middleware/planLimit.middleware';
import { validate } from '../middleware/validation.middleware';
import { createGuestSchema, updateGuestSchema, composeGuestsSchema, bulkImportGuestsSchema } from '../validators/guest.validator';

const router: Router = Router();

router.use(authMiddleware);

router.post('/:weddingId/guests', checkWeddingAccess, requirePermission('guests.manage'), checkResourceLimit('guests'), validate(createGuestSchema), GuestController.createGuest);
router.get('/:weddingId/guests', checkWeddingAccess, requirePermission('guests.view'), GuestController.getGuests);
router.put('/:weddingId/guests/:guestId', checkWeddingAccess, requirePermission('guests.manage'), validate(updateGuestSchema), GuestController.updateGuest);
router.delete('/:weddingId/guests/:guestId', checkWeddingAccess, requirePermission('guests.manage'), GuestController.deleteGuest);
router.get('/:weddingId/guests/stats', checkWeddingAccess, requirePermission('guests.view'), GuestController.getGuestStats);
router.get('/:weddingId/guests/export', checkWeddingAccess, requirePermission('guests.view'), GuestController.exportGuests);
// Digital invitations + guest communication (#2 + #7) — one compose & send
// system, covers both SMS and email.
router.post('/:weddingId/guests/compose', checkWeddingAccess, requirePermission('guests.manage'), validate(composeGuestsSchema), GuestController.composeAndSend);
// Bulk CSV import — no checkResourceLimit here (that middleware only knows
// how to gate a single-row create); the controller itself enforces the
// plan's guest limit across the whole batch.
router.post('/:weddingId/guests/bulk-import', checkWeddingAccess, requirePermission('guests.manage'), validate(bulkImportGuestsSchema), GuestController.bulkImportGuests);
// Single-guest fetch (dedicated Edit Guest page). Registered after
// /stats and /export above — those are more specific literal paths that
// must be matched first, or this `:guestId` wildcard would swallow them.
router.get('/:weddingId/guests/:guestId', checkWeddingAccess, requirePermission('guests.view'), GuestController.getGuestById);

export default router;