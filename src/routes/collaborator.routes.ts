import { Router } from 'express';
import { CollaboratorController } from '../controllers/collaborator.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, requirePermission } from '../middleware/authorization.middleware';
import { checkResourceLimit } from '../middleware/planLimit.middleware';

const router :Router = Router();

router.use(authMiddleware);

router.post('/:weddingId/collaborators/invite', checkWeddingAccess, requirePermission('collaborators.manage'), checkResourceLimit('collaborators'), CollaboratorController.inviteCollaborator);
router.get('/:weddingId/collaborators', checkWeddingAccess, CollaboratorController.getCollaborators);
router.get('/:weddingId/collaborators/invitations', checkWeddingAccess, CollaboratorController.getInviteCollaborators);
router.put('/:weddingId/collaborators/:collaboratorId', checkWeddingAccess, requirePermission('collaborators.manage'), CollaboratorController.updateCollaborator);
router.delete('/:weddingId/collaborators/:collaboratorId', checkWeddingAccess, requirePermission('collaborators.manage'), CollaboratorController.removeCollaborator);

export default router;