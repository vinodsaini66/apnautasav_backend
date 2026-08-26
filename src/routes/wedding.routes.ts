import { Router } from 'express';
import { WeddingController } from '../controllers/wedding.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, checkPermission } from '../middleware/authorization.middleware';
import { checkWeddingCreationLimit } from '../middleware/planLimit.middleware';
import { validate } from '../middleware/validation.middleware';
import { createWeddingSchema, updateWeddingSchema, joinWeddingSchema } from '../validators/wedding.validator';
import { CollaboratorRole } from '../types';

const router: Router = Router();

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

export default router;