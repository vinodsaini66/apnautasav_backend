import { Router } from 'express';
import { CommentController } from '../controllers/comment.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess } from '../middleware/authorization.middleware';

const router :Router= Router();

router.use(authMiddleware);

router.post('/:weddingId/comments', checkWeddingAccess, CommentController.createComment);
router.get('/:entityType/:entityId/comments', authMiddleware, CommentController.getComments);
router.put('/:commentId', CommentController.updateComment);
router.delete('/:commentId', CommentController.deleteComment);
router.post('/:commentId/like', CommentController.likeComment);

export default router;