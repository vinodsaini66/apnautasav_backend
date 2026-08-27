import { Router } from 'express';
import { GuestController } from '../controllers/guest.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, checkPermission } from '../middleware/authorization.middleware';
import { checkResourceLimit } from '../middleware/planLimit.middleware';
import { validate } from '../middleware/validation.middleware';
import { createGuestSchema, updateGuestSchema, composeGuestsSchema } from '../validators/guest.validator';
import { CollaboratorRole } from '../types';

const router: Router = Router();

router.use(authMiddleware);

router.post('/:weddingId/guests', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), checkResourceLimit('guests'), validate(createGuestSchema), GuestController.createGuest);
router.get('/:weddingId/guests', checkWeddingAccess, GuestController.getGuests);
router.put('/:weddingId/guests/:guestId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), validate(updateGuestSchema), GuestController.updateGuest);
router.delete('/:weddingId/guests/:guestId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), GuestController.deleteGuest);
router.get('/:weddingId/guests/stats', checkWeddingAccess, GuestController.getGuestStats);
router.get('/:weddingId/guests/export', checkWeddingAccess, GuestController.exportGuests);
// Digital invitations + guest communication (#2 + #7) — one compose & send
// system, covers both SMS and email.
router.post('/:weddingId/guests/compose', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), validate(composeGuestsSchema), GuestController.composeAndSend);

export default router;