import { Router } from 'express';
import { CommentController } from '../controllers/comment.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess } from '../middleware/authorization.middleware';
import { validate } from '../middleware/validation.middleware';
import { createCommentSchema, updateCommentSchema } from '../validators/comment.validator';

const router: Router = Router();

router.use(authMiddleware);

router.post('/:weddingId/comments', checkWeddingAccess, validate(createCommentSchema), CommentController.createComment);
router.get('/:weddingId/comments/:entityType/:entityId', checkWeddingAccess, CommentController.getComments);
router.put('/:weddingId/comments/:commentId', checkWeddingAccess, validate(updateCommentSchema), CommentController.updateComment);
router.delete('/:weddingId/comments/:commentId', checkWeddingAccess, CommentController.deleteComment);
router.post('/:weddingId/comments/:commentId/like', checkWeddingAccess, CommentController.likeComment);

export default router;
