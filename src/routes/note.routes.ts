import { Router } from 'express';
import { NoteController } from '../controllers/note.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, requirePermission } from '../middleware/authorization.middleware';

const router: Router = Router();

router.use(authMiddleware);

router.post('/:weddingId/notes', checkWeddingAccess, requirePermission('notes.manage'), NoteController.createNote);
router.get('/:weddingId/notes', checkWeddingAccess, NoteController.getNotes);
router.put('/:weddingId/notes/:noteId', checkWeddingAccess, requirePermission('notes.manage'), NoteController.updateNote);
router.delete('/:weddingId/notes/:noteId', checkWeddingAccess, requirePermission('notes.manage'), NoteController.deleteNote);

export default router;