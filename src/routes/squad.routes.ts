import { Router } from 'express';
import { SquadController } from '../controllers/squad.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, requirePermission } from '../middleware/authorization.middleware';
import { validate } from '../middleware/validation.middleware';
import { setupSquadsSchema, createSquadSchema, updateSquadSchema } from '../validators/squad.validator';

/**
 * Family squads — /weddings/:weddingId/squads. Seeing squads needs only
 * access to the wedding; setting them up needs collaborators.manage (the
 * family's admin, or agency staff who manage the client). Editing one is
 * also open to its captain, checked in the controller.
 */
const router: Router = Router();

router.use(authMiddleware);

router.get('/:weddingId/squads', checkWeddingAccess, SquadController.list);
router.get('/:weddingId/squads/digest', checkWeddingAccess, SquadController.digest);
router.post('/:weddingId/squads/setup', checkWeddingAccess, requirePermission('collaborators.manage'), validate(setupSquadsSchema), SquadController.setup);
router.post('/:weddingId/squads', checkWeddingAccess, requirePermission('collaborators.manage'), validate(createSquadSchema), SquadController.create);
router.patch('/:weddingId/squads/:squadId', checkWeddingAccess, validate(updateSquadSchema), SquadController.update);
router.delete('/:weddingId/squads/:squadId', checkWeddingAccess, requirePermission('collaborators.manage'), SquadController.remove);
router.post('/:weddingId/squads/:squadId/join', checkWeddingAccess, SquadController.join);
router.post('/:weddingId/squads/:squadId/leave', checkWeddingAccess, SquadController.leave);
router.post('/:weddingId/tasks/:taskId/claim', checkWeddingAccess, requirePermission('tasks.view'), SquadController.claimTask);

export default router;
