import { Router } from 'express';
import { TaskController } from '../controllers/task.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, checkPermission, checkTaskAssigneeOrPermission } from '../middleware/authorization.middleware';
import { validate } from '../middleware/validation.middleware';
import { createTaskSchema, updateTaskSchema, assignTaskSchema, updateTaskStatusSchema } from '../validators/task.validator';
import { CollaboratorRole } from '../types';

const router: Router = Router();

router.use(authMiddleware);

router.post('/:weddingId/tasks', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), validate(createTaskSchema), TaskController.createTask);
router.get('/:weddingId/tasks', checkWeddingAccess, TaskController.getTasks);
router.get('/:weddingId/tasks/assigned-to-me', checkWeddingAccess, TaskController.getMyTasks);
router.put('/:weddingId/tasks/:taskId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), validate(updateTaskSchema), TaskController.updateTask);
router.delete('/:weddingId/tasks/:taskId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), TaskController.deleteTask);
router.post('/:weddingId/tasks/:taskId/assign', checkWeddingAccess, checkPermission(CollaboratorRole.ADMIN), validate(assignTaskSchema), TaskController.assignTask);
router.patch('/:weddingId/tasks/:taskId/status', checkWeddingAccess, checkTaskAssigneeOrPermission(CollaboratorRole.EDITOR), validate(updateTaskStatusSchema), TaskController.updateTaskStatus);
router.post('/:weddingId/tasks/:taskId/complete', checkWeddingAccess, TaskController.completeTask);

export default router;