import { Request, Response } from 'express';
import { Comment } from '../models/comment.model';
import { Task } from '../models/task.model';
import { ApiResponse } from '../utils/apiResponse';
import { ActivityService } from '../services/activity.service';
// import { NotificationService } from '../services/notification.service';
import logger from '../utils/logger';

export class CommentController {
  static async createComment(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const userId = req.user?.userId;
      const { entityType, entityId, content, attachments } = req.body;

      const comment = await Comment.create({
        weddingId,
        entityType,
        entityId,
        authorId: userId,
        content,
        attachments: attachments || []
      });

      // Notify relevant users
      // TODO: Get all users involved with this entity
      // await NotificationService.notifyComment(userId!, recipientIds, entityType, entityId, weddingId);

      // Log activity so comments show up in the entity's activity trail
      // (e.g. "what did the assigned collaborator do, and when").
      try {
        let entityName: string | undefined;
        if (entityType === 'task') {
          const task = await Task.findById(entityId).select('title').lean();
          entityName = task?.title;
        }

        await ActivityService.logActivity({
          weddingId,
          userId: userId!,
          actionType: 'commented',
          entityType,
          entityId: String(entityId),
          entityName,
          description: entityName
            ? `Commented on task "${entityName}"`
            : `Commented on ${entityType}`
        });
      } catch (activityError) {
        logger.error('Failed to log comment activity:', activityError);
      }

      ApiResponse.success(res, 201, {
        message: 'Comment added successfully',
        data: comment
      });
    } catch (error: any) {
      logger.error('Create comment error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to add comment');
    }
  }

  static async getComments(req: Request, res: Response): Promise<void> {
    try {
      const { entityType, entityId } = req.params;
      const { page = 1, limit = 50 } = req.query;

      const skip = (Number(page) - 1) * Number(limit);

      const comments = await Comment.find({ entityType, entityId })
        .populate('authorId', 'fullName email')
        .populate('replies')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

      const total = await Comment.countDocuments({ entityType, entityId });

      ApiResponse.paginated(res, comments, Number(page), Number(limit), total);
    } catch (error: any) {
      logger.error('Get comments error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch comments');
    }
  }

  static async updateComment(req: Request, res: Response): Promise<void> {
    try {
      const { commentId } = req.params;
      const userId = req.user?.userId;
      const { content } = req.body;

      const comment = await Comment.findOneAndUpdate(
        { _id: commentId, authorId: userId },
        {
          $set: {
            content,
            isEdited: true,
            editedAt: new Date()
          }
        },
        { new: true }
      );

      if (!comment) {
        ApiResponse.error(res, 404, 'Comment not found or unauthorized');
        return;
      }

      ApiResponse.success(res, 200, {
        message: 'Comment updated successfully',
        data: comment
      });
    } catch (error: any) {
      logger.error('Update comment error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to update comment');
    }
  }

  static async deleteComment(req: Request, res: Response): Promise<void> {
    try {
      const { commentId } = req.params;
      const userId = req.user?.userId;

      const comment = await Comment.findOneAndDelete({
        _id: commentId,
        authorId: userId
      });

      if (!comment) {
        ApiResponse.error(res, 404, 'Comment not found or unauthorized');
        return;
      }

      ApiResponse.success(res, 200, {
        message: 'Comment deleted successfully'
      });
    } catch (error: any) {
      logger.error('Delete comment error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to delete comment');
    }
  }

  static async likeComment(req: Request, res: Response): Promise<void> {
    try {
      const { commentId } = req.params;
      const userId = req.user?.userId;

      const comment = await Comment.findById(commentId);

      if (!comment) {
        ApiResponse.error(res, 404, 'Comment not found');
        return;
      }

      const userIdObj = userId as any;
      const hasLiked = comment.likes.some(id => id.toString() === userId);

      if (hasLiked) {
        comment.likes = comment.likes.filter(id => id.toString() !== userId);
      } else {
        comment.likes.push(userIdObj);
      }

      await comment.save();

      ApiResponse.success(res, 200, {
        message: hasLiked ? 'Comment unliked' : 'Comment liked',
        data: { likes: comment.likes.length }
      });
    } catch (error: any) {
      logger.error('Like comment error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to like comment');
    }
  }
}