import { Router } from 'express';
import { NoteController } from '../controllers/note.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, checkPermission } from '../middleware/authorization.middleware';
import { CollaboratorRole } from '../types';

const router: Router = Router();

router.use(authMiddleware);

router.post('/:weddingId/notes', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), NoteController.createNote);
router.get('/:weddingId/notes', checkWeddingAccess, NoteController.getNotes);
router.put('/:weddingId/notes/:noteId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), NoteController.updateNote);
router.delete('/:weddingId/notes/:noteId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), NoteController.deleteNote);

export default router;