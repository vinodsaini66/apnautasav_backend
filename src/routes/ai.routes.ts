import { Router } from 'express';
import { AiController } from '../controllers/ai.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, checkPermission } from '../middleware/authorization.middleware';
import { checkAiAssistantEnabled } from '../middleware/planLimit.middleware';
import { CollaboratorRole } from '../types';

const router: Router = Router();

router.use(authMiddleware);

// Wedding-level authorization for the whole conversation is guaranteed
// here — checkWeddingAccess -> checkPermission(EDITOR) ->
// checkAiAssistantEnabled — before any tool inside AiController.chat runs.
// Individual tools (ai-tools.service.ts) only replicate the narrower,
// per-resource checks (validators, plan resource limits) each real
// controller already performs.
router.post('/:weddingId/ai/chat', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), checkAiAssistantEnabled, AiController.chat);

export default router;
