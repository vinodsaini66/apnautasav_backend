import { Request, Response } from 'express';
import { Task } from '../models/task.model';
import { ApiResponse } from '../utils/apiResponse';
import { ActivityService } from '../services/activity.service';
import { NotificationService } from '../services/notification.service';
import logger from '../utils/logger';
import { getSocketServer } from '../config/socket';

export class TaskController {
  static async createTask(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const userId = req.user?.userId;
      const taskData = req.body;

      const task = await Task.create({
        ...taskData,
        weddingId,
        createdBy: userId
      });

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

      // Notify assigned users
      if (task.assignedTo && task.assignedTo.length > 0) {
        await NotificationService.notifyTaskAssignment(
          String(task._id),
          task.assignedTo.map((id: any) => id.toString()),
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
      const { page = 1, limit = 50, status, priority, category, assignedTo } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const filter: any = { weddingId };

      if (status) filter.status = status;
      if (priority) filter.priority = priority;
      if (category) filter.category = category;
      if (assignedTo) filter.assignedTo = assignedTo;

      const tasks = await Task.find(filter)
        .populate('assignedTo', 'fullName email')
        .populate('createdBy', 'fullName')
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

  static async updateTask(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, taskId } = req.params;
      const userId = req.user?.userId;
      const updateData = req.body;

      const task = await Task.findOneAndUpdate(
        { _id: taskId, weddingId },
        { $set: updateData },
        { new: true, runValidators: true }
      );

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

  static async assignTask(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, taskId } = req.params;
      const userId = req.user?.userId;
      const { assignedTo } = req.body;

      const task = await Task.findOneAndUpdate(
        { _id: taskId, weddingId },
        { $set: { assignedTo } },
        { new: true }
      );

      if (!task) {
        ApiResponse.error(res, 404, 'Task not found');
        return;
      }

      // Notify assigned users
      await NotificationService.notifyTaskAssignment(
        taskId,
        assignedTo,
        userId!,
        weddingId,
        task.title
      );

      // Log activity
      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'assigned',
        entityType: 'task',
        entityId: String(task._id),
        entityName: task.title,
        description: `Assigned task: ${task.title}`
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
      );

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

      ApiResponse.success(res, 200, {
        message: 'Task marked as completed',
        data: task
      });
    } catch (error: any) {
      logger.error('Complete task error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to complete task');
    }
  }
}