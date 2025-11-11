import { Router } from 'express';
import { TaskController } from '../controllers/task.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, checkPermission } from '../middleware/authorization.middleware';
import { validate } from '../middleware/validation.middleware';
import { createTaskSchema, updateTaskSchema } from '../validators/task.validator';
import { CollaboratorRole } from '../types';

const router: Router = Router();

router.use(authMiddleware);

router.post('/:weddingId/tasks', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), validate(createTaskSchema), TaskController.createTask);
router.get('/:weddingId/tasks', checkWeddingAccess, TaskController.getTasks);
router.put('/:weddingId/tasks/:taskId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), validate(updateTaskSchema), TaskController.updateTask);
router.delete('/:weddingId/tasks/:taskId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), TaskController.deleteTask);
router.post('/:weddingId/tasks/:taskId/assign', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), TaskController.assignTask);
router.post('/:weddingId/tasks/:taskId/complete', checkWeddingAccess, TaskController.completeTask);

export default router;