import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Task, ITask } from '../models/task.model';
import { Collaborator } from '../models/collaborator.model';
import { ApiResponse } from '../utils/apiResponse';
import { ActivityService } from '../services/activity.service';
import { NotificationService } from '../services/notification.service';
import { PlanResolutionService, UNLIMITED } from '../services/plan-resolution.service';
import logger from '../utils/logger';
import { getSocketServer } from '../config/socket';

// Recurring tasks (#25b): plain Date math, no new date-library dependency
// (dayjs isn't used elsewhere in this codebase). Month arithmetic is done
// via setMonth, which correctly rolls over year boundaries; day-of-month
// overflow (e.g. Jan 31 + 1 month) is left to JS's native Date normalization
// (rolls into the following month), which is an acceptable, documented
// tradeoff for a "your call" date-math helper.
function computeNextDueDate(dueDate: Date, recurrence: { frequency: 'daily' | 'weekly' | 'monthly'; interval: number }): Date {
  const next = new Date(dueDate);
  const { frequency, interval } = recurrence;

  if (frequency === 'daily') {
    next.setDate(next.getDate() + interval);
  } else if (frequency === 'weekly') {
    next.setDate(next.getDate() + interval * 7);
  } else if (frequency === 'monthly') {
    next.setMonth(next.getMonth() + interval);
  }

  return next;
}

// Shared by completeTask and updateTaskStatus (when the target status is
// 'completed'): generates the next occurrence of a recurring task. Never
// throws — a failure here (including hitting the plan's task limit) is
// logged and swallowed so completing/updating the original task always
// succeeds regardless.
async function generateNextRecurringTask(task: ITask, userId: string): Promise<void> {
  try {
    if (!task.recurrence || !task.dueDate) return;

    const nextDueDate = computeNextDueDate(task.dueDate, task.recurrence);

    if (task.recurrence.endDate && nextDueDate > task.recurrence.endDate) {
      return;
    }

    const weddingId = String(task.weddingId);

    // Mirror checkResourceLimit('tasks') here since this generation happens
    // outside the normal route middleware chain.
    const ownerId = await PlanResolutionService.getWeddingOwner(weddingId);
    if (!ownerId) {
      logger.warn(`Skipping recurring task generation for ${task._id}: wedding owner not found`);
      return;
    }

    const effective = await PlanResolutionService.getEffectivePlanForWedding(ownerId, weddingId);
    const limit = effective.limits.tasks;

    if (limit !== UNLIMITED) {
      const usage = await PlanResolutionService.getCurrentUsage(weddingId);
      if (usage.tasks >= limit) {
        logger.warn(`Skipping recurring task generation for ${task._id}: wedding ${weddingId} is at its task plan limit (${limit})`);
        return;
      }
    }

    // task.assignedTo may arrive populated (updateTaskStatus/completeTask
    // both now populate their response for display purposes) — normalize
    // back to raw ids before cloning, since a populated User doc isn't a
    // valid value to assign into an ObjectId-ref array.
    const assignedToIds = (task.assignedTo || []).map((entry: any) =>
      entry && entry._id ? entry._id : entry
    );

    const newTask = await Task.create({
      weddingId: task.weddingId,
      title: task.title,
      description: task.description,
      category: task.category,
      priority: task.priority,
      assignedTo: assignedToIds,
      eventId: task.eventId,
      recurrence: task.recurrence,
      reminderOffsetDays: task.reminderOffsetDays,
      status: 'pending',
      dueDate: nextDueDate,
      reminderSent: false,
      createdBy: userId
    });

    await ActivityService.logActivity({
      weddingId,
      userId,
      actionType: 'created',
      entityType: 'task',
      entityId: String(newTask._id),
      entityName: newTask.title,
      description: `Next occurrence of a recurring task: ${newTask.title}`
    });
  } catch (error) {
    logger.warn(`Failed to generate next occurrence of recurring task ${task._id}:`, error);
  }
}

export class TaskController {
  static async createTask(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const userId = req.user?.userId;
      const taskData = req.body;

      let task = await Task.create({
        ...taskData,
        weddingId,
        createdBy: userId
      });
      task = await task.populate([
        { path: 'assignedTo', select: 'fullName email' },
        { path: 'dependsOn', select: 'title status' }
      ]);

      // Log activity
      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'created',
        entityType: 'task',
        entityId: String(task._id),
        entityName: task.title,
        description: `Created task: ${task.title}`
      });

      // Notify assigned users. assignedTo is now populated (for the
      // response's display purposes) — pull the id off each populated user
      // doc rather than calling .toString() on the doc itself.
      if (task.assignedTo && task.assignedTo.length > 0) {
        await NotificationService.notifyTaskAssignment(
          String(task._id),
          task.assignedTo.map((u: any) => (u._id ? u._id.toString() : u.toString())),
          userId!,
          weddingId,
          task.title
        );
      }

      // After task creation
      const socketServer = getSocketServer();
      socketServer.emitToWedding(weddingId, 'task:created', {
        task: {
          id: task._id,
          title: task.title,
          category: task.category,
          priority: task.priority,
          status: task.status,
          dueDate: task.dueDate
        },
        createdBy: userId,
        timestamp: new Date()
      });

      ApiResponse.success(res, 201, {
        message: 'Task created successfully',
        data: task
      });
    } catch (error: any) {
      logger.error('Create task error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to create task');
    }
  }

  static async getTasks(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const { page = 1, limit = 50, status, priority, category, assignedTo, eventId } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const filter: any = { weddingId };

      if (status) filter.status = status;
      if (priority) filter.priority = priority;
      if (category) filter.category = category;
      if (assignedTo) filter.assignedTo = assignedTo;
      if (eventId) filter.eventId = eventId;

      const tasks = await Task.find(filter)
        .populate('assignedTo', 'fullName email')
        .populate('assignedBy', 'fullName')
        .populate('createdBy', 'fullName')
        .populate('dependsOn', 'title status')
        .sort({ dueDate: 1, priority: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

      const total = await Task.countDocuments(filter);

      ApiResponse.paginated(res, tasks, Number(page), Number(limit), total);
    } catch (error: any) {
      logger.error('Get tasks error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch tasks');
    }
  }

  // Tasks assigned to the current user within this wedding.
  static async getMyTasks(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const userId = req.user?.userId;
      const { page = 1, limit = 50 } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const filter = { weddingId, assignedTo: userId };

      const tasks = await Task.find(filter)
        .populate('assignedTo', 'fullName email')
        .populate('assignedBy', 'fullName')
        .populate('createdBy', 'fullName')
        .populate('dependsOn', 'title status')
        .sort({ dueDate: 1, priority: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

      const total = await Task.countDocuments(filter);

      ApiResponse.paginated(res, tasks, Number(page), Number(limit), total);
    } catch (error: any) {
      logger.error('Get my tasks error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch assigned tasks');
    }
  }

  static async updateTask(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, taskId } = req.params;
      const userId = req.user?.userId;
      const updateData = req.body;

      // Editing dueDate or reminderOffsetDays re-arms the one-shot due-date
      // reminder so it can fire again against the new schedule.
      if (Object.prototype.hasOwnProperty.call(updateData, 'dueDate') ||
          Object.prototype.hasOwnProperty.call(updateData, 'reminderOffsetDays')) {
        updateData.reminderSent = false;
      }

      const task = await Task.findOneAndUpdate(
        { _id: taskId, weddingId },
        { $set: updateData },
        { new: true, runValidators: true }
      )
        .populate('assignedTo', 'fullName email')
        .populate('dependsOn', 'title status');

      if (!task) {
        ApiResponse.error(res, 404, 'Task not found');
        return;
      }

      // Log activity
      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'updated',
        entityType: 'task',
        entityId: String(task._id),
        entityName: task.title,
        description: `Updated task: ${task.title}`
      });

      const socketServer = getSocketServer();
      socketServer.emitToWedding(weddingId, 'task:updated', {
        taskId: task._id,
        updates: updateData,
        updatedBy: userId,
        timestamp: new Date()
      });

      ApiResponse.success(res, 200, {
        message: 'Task updated successfully',
        data: task
      });
    } catch (error: any) {
      logger.error('Update task error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to update task');
    }
  }

  static async deleteTask(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, taskId } = req.params;
      const userId = req.user?.userId;

      const task = await Task.findOneAndDelete({ _id: taskId, weddingId });

      if (!task) {
        ApiResponse.error(res, 404, 'Task not found');
        return;
      }

      // Log activity
      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'deleted',
        entityType: 'task',
        entityName: task.title,
        description: `Deleted task: ${task.title}`
      });

      ApiResponse.success(res, 200, {
        message: 'Task deleted successfully'
      });
    } catch (error: any) {
      logger.error('Delete task error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to delete task');
    }
  }

  // Admin-only: assign a task to one or more accepted collaborators of this
  // wedding (#25a — full overwrite of assignedTo, same semantics as before,
  // just array-shaped now).
  static async assignTask(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, taskId } = req.params;
      const userId = req.user?.userId;
      const assignedTo: string[] = req.body.assignedTo;

      const collaborators = await Collaborator.find({
        weddingId,
        userId: { $in: assignedTo },
        invitationStatus: 'accepted'
      }).populate('userId', 'fullName');

      if (collaborators.length !== assignedTo.length) {
        ApiResponse.error(res, 400, 'One or more selected users are not accepted collaborators on this wedding');
        return;
      }

      const existingTask = await Task.findOne({ _id: taskId, weddingId });

      if (!existingTask) {
        ApiResponse.error(res, 404, 'Task not found');
        return;
      }

      const previousAssignedTo = existingTask.assignedTo.map((id) => id.toString());

      const task = await Task.findOneAndUpdate(
        { _id: taskId, weddingId },
        {
          $set: {
            assignedTo,
            assignedBy: userId,
            assignedAt: new Date()
          }
        },
        { new: true }
      )
        .populate('assignedTo', 'fullName email')
        .populate('dependsOn', 'title status');

      if (!task) {
        ApiResponse.error(res, 404, 'Task not found');
        return;
      }

      const assigneeNames = collaborators
        .map((c) => (c.userId as any)?.fullName)
        .filter(Boolean)
        .join(', ') || 'the collaborator(s)';

      // Only notify ids that are newly present in assignedTo — not ones
      // that were already assigned before this call.
      const newlyAssigned = assignedTo.filter((id) => !previousAssignedTo.includes(id));

      if (newlyAssigned.length > 0) {
        await NotificationService.notifyTaskAssignment(
          taskId,
          newlyAssigned,
          userId!,
          weddingId,
          task.title
        );
      }

      // Log activity
      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'assigned',
        entityType: 'task',
        entityId: String(task._id),
        entityName: task.title,
        description: `Assigned task "${task.title}" to ${assigneeNames}`,
        changes: {
          field: 'assignedTo',
          oldValue: previousAssignedTo,
          newValue: assignedTo
        }
      });

      const socketServer = getSocketServer();
      socketServer.emitToWedding(weddingId, 'task:assigned', {
        taskId: task._id,
        assignedTo,
        assignedBy: userId,
        timestamp: new Date()
      });

      ApiResponse.success(res, 200, {
        message: 'Task assigned successfully',
        data: task
      });
    } catch (error: any) {
      logger.error('Assign task error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to assign task');
    }
  }

  // Update a task's status. Allowed for editors/admins/owner, or for the
  // task's own assignee regardless of their base collaborator role
  // (see checkTaskAssigneeOrPermission, which attaches req.task).
  static async updateTaskStatus(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const userId = req.user?.userId;
      const { status, actualHours } = req.body;
      const existingTask = req.task;

      if (!existingTask) {
        ApiResponse.error(res, 404, 'Task not found');
        return;
      }

      const oldStatus = existingTask.status;

      const update: any = { status };
      if (actualHours !== undefined) update.actualHours = actualHours;
      if (status === 'completed') update.completedAt = new Date();

      const task = await Task.findOneAndUpdate(
        { _id: existingTask._id, weddingId },
        { $set: update },
        { new: true }
      )
        .populate('assignedTo', 'fullName email')
        .populate('assignedBy', 'fullName')
        .populate('dependsOn', 'title status');

      if (!task) {
        ApiResponse.error(res, 404, 'Task not found');
        return;
      }

      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'updated',
        entityType: 'task',
        entityId: String(task._id),
        entityName: task.title,
        description: `Marked task "${task.title}" as ${status}`,
        changes: {
          field: 'status',
          oldValue: oldStatus,
          newValue: status
        }
      });

      const socketServer = getSocketServer();
      socketServer.emitToWedding(weddingId, 'task:status_changed', {
        taskId: task._id,
        status,
        updatedBy: userId,
        timestamp: new Date()
      });

      // Recurring tasks (#25b): generate the next occurrence when this
      // transition completes the task. Never blocks or fails the response.
      if (status === 'completed' && oldStatus !== 'completed') {
        await generateNextRecurringTask(task, userId!);
      }

      ApiResponse.success(res, 200, {
        message: 'Task status updated successfully',
        data: task
      });
    } catch (error: any) {
      logger.error('Update task status error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to update task status');
    }
  }

  static async completeTask(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, taskId } = req.params;
      const userId = req.user?.userId;
      const { actualHours } = req.body;

      const task = await Task.findOneAndUpdate(
        { _id: taskId, weddingId },
        {
          $set: {
            status: 'completed',
            completedAt: new Date(),
            actualHours
          }
        },
        { new: true }
      )
        .populate('assignedTo', 'fullName email')
        .populate('dependsOn', 'title status');

      if (!task) {
        ApiResponse.error(res, 404, 'Task not found');
        return;
      }

      // Log activity
      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'updated',
        entityType: 'task',
        entityId: String(task._id),
        entityName: task.title,
        description: `Completed task: ${task.title}`
      });

      // Recurring tasks (#25b): generate the next occurrence. Never blocks
      // or fails the response.
      await generateNextRecurringTask(task, userId!);

      ApiResponse.success(res, 200, {
        message: 'Task marked as completed',
        data: task
      });
    } catch (error: any) {
      logger.error('Complete task error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to complete task');
    }
  }

  // Subtasks (#25c): lightweight checklist items scoped to a task, mutated
  // via targeted array ops (not a full-document overwrite) to minimize
  // race conditions between concurrent editors.
  static async addSubtask(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, taskId } = req.params;
      const userId = req.user?.userId;
      const { title } = req.body;

      const subtaskId = new mongoose.Types.ObjectId();

      const task = await Task.findOneAndUpdate(
        { _id: taskId, weddingId },
        { $push: { subtasks: { _id: subtaskId, title, completed: false } } },
        { new: true }
      )
        .populate('assignedTo', 'fullName email')
        .populate('dependsOn', 'title status');

      if (!task) {
        ApiResponse.error(res, 404, 'Task not found');
        return;
      }

      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'updated',
        entityType: 'task',
        entityId: String(task._id),
        entityName: task.title,
        description: `Added subtask "${title}" to task: ${task.title}`
      });

      const socketServer = getSocketServer();
      socketServer.emitToWedding(weddingId, 'task:subtask_added', {
        taskId: task._id,
        subtaskId,
        title,
        updatedBy: userId,
        timestamp: new Date()
      });

      ApiResponse.success(res, 201, {
        message: 'Subtask added successfully',
        data: task
      });
    } catch (error: any) {
      logger.error('Add subtask error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to add subtask');
    }
  }

  static async updateSubtask(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, taskId, subtaskId } = req.params;
      const userId = req.user?.userId;
      const { title, completed } = req.body;

      const setFields: any = {};
      if (title !== undefined) setFields['subtasks.$.title'] = title;
      if (completed !== undefined) setFields['subtasks.$.completed'] = completed;

      const task = await Task.findOneAndUpdate(
        { _id: taskId, weddingId, 'subtasks._id': subtaskId },
        { $set: setFields },
        { new: true }
      )
        .populate('assignedTo', 'fullName email')
        .populate('dependsOn', 'title status');

      if (!task) {
        ApiResponse.error(res, 404, 'Task or subtask not found');
        return;
      }

      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'updated',
        entityType: 'task',
        entityId: String(task._id),
        entityName: task.title,
        description: `Updated a subtask on task: ${task.title}`
      });

      const socketServer = getSocketServer();
      socketServer.emitToWedding(weddingId, 'task:subtask_updated', {
        taskId: task._id,
        subtaskId,
        title,
        completed,
        updatedBy: userId,
        timestamp: new Date()
      });

      ApiResponse.success(res, 200, {
        message: 'Subtask updated successfully',
        data: task
      });
    } catch (error: any) {
      logger.error('Update subtask error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to update subtask');
    }
  }

  static async deleteSubtask(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, taskId, subtaskId } = req.params;
      const userId = req.user?.userId;

      const task = await Task.findOneAndUpdate(
        { _id: taskId, weddingId },
        { $pull: { subtasks: { _id: subtaskId } } },
        { new: true }
      )
        .populate('assignedTo', 'fullName email')
        .populate('dependsOn', 'title status');

      if (!task) {
        ApiResponse.error(res, 404, 'Task not found');
        return;
      }

      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'updated',
        entityType: 'task',
        entityId: String(task._id),
        entityName: task.title,
        description: `Removed a subtask from task: ${task.title}`
      });

      const socketServer = getSocketServer();
      socketServer.emitToWedding(weddingId, 'task:subtask_deleted', {
        taskId: task._id,
        subtaskId,
        updatedBy: userId,
        timestamp: new Date()
      });

      ApiResponse.success(res, 200, {
        message: 'Subtask deleted successfully',
        data: task
      });
    } catch (error: any) {
      logger.error('Delete subtask error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to delete subtask');
    }
  }
}
