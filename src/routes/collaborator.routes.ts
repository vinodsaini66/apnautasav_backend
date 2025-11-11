import { Router } from 'express';
import { CollaboratorController } from '../controllers/collaborator.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, checkPermission } from '../middleware/authorization.middleware';
import { CollaboratorRole } from '../types';

const router :Router = Router();

router.use(authMiddleware);

router.post('/:weddingId/collaborators/invite', checkWeddingAccess, checkPermission(CollaboratorRole.ADMIN), CollaboratorController.inviteCollaborator);
router.get('/:weddingId/collaborators', checkWeddingAccess, CollaboratorController.getCollaborators);
router.put('/:weddingId/collaborators/:collaboratorId', checkWeddingAccess, checkPermission(CollaboratorRole.ADMIN), CollaboratorController.updateCollaborator);
router.delete('/:weddingId/collaborators/:collaboratorId', checkWeddingAccess, checkPermission(CollaboratorRole.ADMIN), CollaboratorController.removeCollaborator);

export default router;