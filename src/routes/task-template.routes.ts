import { Router } from 'express';
import { TaskTemplateController } from '../controllers/task-template.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { createTaskTemplateSchema, updateTaskTemplateSchema } from '../validators/task-template.validator';

const router: Router = Router();

router.use(authMiddleware);

// NOT wedding-scoped, unlike every other resource router in this repo —
// a checklist template belongs to the user who created it (or is a shared
// system preset), and follows them across every wedding they work on, not
// just one. Mounted at a top-level '/task-templates' prefix (see
// routes/index.ts), same convention as '/me' (user.routes.ts). Applying a
// template TO a specific wedding is a Task action instead — see
// POST /:weddingId/tasks/apply-template/:templateId in task.routes.ts.
router.post('/', validate(createTaskTemplateSchema), TaskTemplateController.createTemplate);
router.get('/', TaskTemplateController.getTemplates);
router.get('/:templateId', TaskTemplateController.getTemplateById);
router.put('/:templateId', validate(updateTaskTemplateSchema), TaskTemplateController.updateTemplate);
router.delete('/:templateId', TaskTemplateController.deleteTemplate);

export default router;
