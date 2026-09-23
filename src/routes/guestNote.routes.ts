import { Router } from 'express';
import { GuestNoteController } from '../controllers/guestNote.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess } from '../middleware/authorization.middleware';

/**
 * GET /:weddingId/guest-notes — owner/team-facing read of notes guests left
 * via the public POST /rsvp/:token/note route. Mounted under /weddings in
 * routes/index.ts, same pattern as note.routes.ts/activity.routes.ts.
 */
const router: Router = Router();

router.use(authMiddleware);

router.get('/:weddingId/guest-notes', checkWeddingAccess, GuestNoteController.getGuestNotes);

export default router;
