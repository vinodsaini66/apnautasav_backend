import { Router } from 'express';
import { ActivityController } from '../controllers/activity.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess } from '../middleware/authorization.middleware';

const router:Router = Router();

router.use(authMiddleware);

router.get('/:weddingId/activities', checkWeddingAccess, ActivityController.getActivities);

export default router;