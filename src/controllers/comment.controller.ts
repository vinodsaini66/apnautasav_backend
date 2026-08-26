import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Comment } from '../models/comment.model';
import { Task } from '../models/task.model';
import { Guest } from '../models/guest.model';
import { Budget } from '../models/budget.model';
import { Vendor } from '../models/vendor.model';
import { SharedNote } from '../models/sharedNote.model';
import { WeddingEvent } from '../models/event.model';
import { Wedding } from '../models/wedding.model';
import { Collaborator } from '../models/collaborator.model';
import { ApiResponse } from '../utils/apiResponse';
import { ActivityService } from '../services/activity.service';
import { NotificationService } from '../services/notification.service';
import { COMMENT_ENTITY_TYPES } from '../validators/comment.validator';
import { CollaboratorRole } from '../types';
import logger from '../utils/logger';

type CommentEntityType = typeof COMMENT_ENTITY_TYPES[number];

// Maps a comment's entityType to the Mongoose model that owns that entity,
// so we can confirm the referenced document actually exists and belongs to
// the wedding being commented on before creating/reading comments for it.
const ENTITY_MODEL_MAP: Record<CommentEntityType, mongoose.Model<any>> = {
  task: Task,
  guest: Guest,
  budget: Budget,
  vendor: Vendor,
  note: SharedNote,
  event: WeddingEvent
};

const isKnownEntityType = (entityType: string): entityType is CommentEntityType =>
  (COMMENT_ENTITY_TYPES as readonly string[]).includes(entityType);

const ROLE_HIERARCHY: Record<CollaboratorRole, number> = {
  [CollaboratorRole.VIEWER]: 1,
  [CollaboratorRole.EDITOR]: 2,
  [CollaboratorRole.ADMIN]: 3
};

/**
 * Whether `userId` has ADMIN rights on `weddingId` — the wedding creator, or
 * an accepted collaborator with role === 'admin'. Used by deleteComment so a
 * wedding admin/creator can moderate comments they didn't author themselves.
 */
const hasAdminAccess = async (weddingId: string, userId: string): Promise<boolean> => {
  const wedding = await Wedding.findById(weddingId);
  if (!wedding) return false;

  if (wedding.createdBy.toString() === userId) return true;

  const collaborator = await Collaborator.findOne({
    weddingId,
    userId,
    invitationStatus: 'accepted'
  });

  if (!collaborator) return false;

  return ROLE_HIERARCHY[collaborator.role as CollaboratorRole] >= ROLE_HIERARCHY[CollaboratorRole.ADMIN];
};

export class CommentController {
  static async createComment(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const userId = req.user?.userId;
      const { entityType, entityId, content, attachments } = req.body;

      if (!isKnownEntityType(entityType)) {
        ApiResponse.error(res, 400, `Invalid entityType. Must be one of: ${COMMENT_ENTITY_TYPES.join(', ')}`);
        return;
      }

      const entityExists = await ENTITY_MODEL_MAP[entityType].exists({ _id: entityId, weddingId });
      if (!entityExists) {
        ApiResponse.error(res, 404, `${entityType} not found for this wedding`);
        return;
      }

      const comment = await Comment.create({
        weddingId,
        entityType,
        entityId,
        authorId: userId,
        content,
        attachments: attachments || []
      });

      // Notify the rest of the wedding team about the new comment. A failure
      // here should never fail the comment itself, so it's isolated from
      // the activity-logging try/catch below.
      try {
        const recipientIds = await NotificationService.getWeddingRecipientIds(weddingId, userId);
        if (recipientIds.length > 0) {
          await NotificationService.notifyComment(userId!, recipientIds, entityType, entityId, weddingId, content);
        }
      } catch (notifyError) {
        logger.warn('Failed to send comment notification:', notifyError);
      }

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
      const { weddingId, entityType, entityId } = req.params;
      const { page = 1, limit = 50 } = req.query;

      if (!isKnownEntityType(entityType)) {
        ApiResponse.error(res, 400, `Invalid entityType. Must be one of: ${COMMENT_ENTITY_TYPES.join(', ')}`);
        return;
      }

      const entityExists = await ENTITY_MODEL_MAP[entityType].exists({ _id: entityId, weddingId });
      if (!entityExists) {
        ApiResponse.error(res, 404, `${entityType} not found for this wedding`);
        return;
      }

      const skip = (Number(page) - 1) * Number(limit);

      const filter = { weddingId, entityType, entityId };

      const comments = await Comment.find(filter)
        .populate('authorId', 'fullName email')
        .populate('replies')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

      const total = await Comment.countDocuments(filter);

      ApiResponse.paginated(res, comments, Number(page), Number(limit), total);
    } catch (error: any) {
      logger.error('Get comments error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch comments');
    }
  }

  static async updateComment(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, commentId } = req.params;
      const userId = req.user?.userId;
      const { content } = req.body;

      const comment = await Comment.findOneAndUpdate(
        { _id: commentId, weddingId, authorId: userId },
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
      const { weddingId, commentId } = req.params;
      const userId = req.user?.userId;

      const comment = await Comment.findOne({ _id: commentId, weddingId });

      if (!comment) {
        ApiResponse.error(res, 404, 'Comment not found');
        return;
      }

      const isAuthor = comment.authorId.toString() === userId;
      if (!isAuthor) {
        const canOverride = await hasAdminAccess(weddingId, userId!);
        if (!canOverride) {
          ApiResponse.error(res, 403, 'You do not have permission to delete this comment');
          return;
        }
      }

      await Comment.deleteOne({ _id: comment._id });

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
      const { weddingId, commentId } = req.params;
      const userId = req.user?.userId;

      const comment = await Comment.findOne({ _id: commentId, weddingId });

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
