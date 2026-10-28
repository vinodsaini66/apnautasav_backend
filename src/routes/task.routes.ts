import { Router } from 'express';
import { TaskController } from '../controllers/task.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, requirePermission, checkTaskAssigneeOrPermission } from '../middleware/authorization.middleware';
import { checkResourceLimit } from '../middleware/planLimit.middleware';
import { validate } from '../middleware/validation.middleware';
import { bulkCreateTasksSchema, createTaskSchema, updateTaskSchema, assignTaskSchema, updateTaskStatusSchema, addSubtaskSchema, updateSubtaskSchema } from '../validators/task.validator';

const router: Router = Router();

router.use(authMiddleware);

router.post('/:weddingId/tasks', checkWeddingAccess, requirePermission('tasks.manage'), checkResourceLimit('tasks'), validate(createTaskSchema), TaskController.createTask);
router.post('/:weddingId/tasks/bulk', checkWeddingAccess, requirePermission('tasks.manage'), validate(bulkCreateTasksSchema), TaskController.bulkCreate);
// Checklist/task templates (#23) — apply a template's items as real tasks
// on this wedding in one action. No checkResourceLimit here (that
// middleware only knows how to gate a single-row create) — the controller
// itself enforces the plan's task limit across the whole batch, same
// pattern as GuestController.bulkImportGuests.
router.post('/:weddingId/tasks/apply-template/:templateId', checkWeddingAccess, requirePermission('tasks.manage'), TaskController.applyTemplate);
router.get('/:weddingId/tasks', checkWeddingAccess, requirePermission('tasks.view'), TaskController.getTasks);
router.get('/:weddingId/tasks/assigned-to-me', checkWeddingAccess, requirePermission('tasks.view'), TaskController.getMyTasks);
router.get('/:weddingId/tasks/export', checkWeddingAccess, requirePermission('tasks.view'), TaskController.exportTasks);
router.put('/:weddingId/tasks/:taskId', checkWeddingAccess, requirePermission('tasks.manage'), validate(updateTaskSchema), TaskController.updateTask);
router.delete('/:weddingId/tasks/:taskId', checkWeddingAccess, requirePermission('tasks.manage'), TaskController.deleteTask);
router.post('/:weddingId/tasks/:taskId/assign', checkWeddingAccess, requirePermission('tasks.assign'), validate(assignTaskSchema), TaskController.assignTask);
router.patch('/:weddingId/tasks/:taskId/status', checkWeddingAccess, checkTaskAssigneeOrPermission('tasks.manage'), validate(updateTaskStatusSchema), TaskController.updateTaskStatus);
router.post('/:weddingId/tasks/:taskId/complete', checkWeddingAccess, checkTaskAssigneeOrPermission('tasks.complete'), TaskController.completeTask);

router.post('/:weddingId/tasks/:taskId/subtasks', checkWeddingAccess, checkTaskAssigneeOrPermission('tasks.manage'), validate(addSubtaskSchema), TaskController.addSubtask);
router.patch('/:weddingId/tasks/:taskId/subtasks/:subtaskId', checkWeddingAccess, checkTaskAssigneeOrPermission('tasks.manage'), validate(updateSubtaskSchema), TaskController.updateSubtask);
router.delete('/:weddingId/tasks/:taskId/subtasks/:subtaskId', checkWeddingAccess, checkTaskAssigneeOrPermission('tasks.manage'), TaskController.deleteSubtask);

export default router;