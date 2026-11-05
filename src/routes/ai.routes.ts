import { Router } from 'express';
import { AiController } from '../controllers/ai.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, requirePermission } from '../middleware/authorization.middleware';
import { checkAiAssistantEnabled } from '../middleware/planLimit.middleware';

const router: Router = Router();

router.use(authMiddleware);

// Every AI route needs wedding access, the `ai.use` permission and a plan
// with the AI Assistant. /commit additionally checks each item type's own
// manage permission (AiController.commit), and every item goes through the
// same validators and plan limits as the REST routes (ai-tools.service.ts).
const aiGate = [checkWeddingAccess, requirePermission('ai.use'), checkAiAssistantEnabled];

router.post('/:weddingId/ai/extract', ...aiGate, AiController.extract);
router.post('/:weddingId/ai/commit', ...aiGate, AiController.commit);
router.post('/:weddingId/ai/chat', ...aiGate, AiController.chat);

export default router;
