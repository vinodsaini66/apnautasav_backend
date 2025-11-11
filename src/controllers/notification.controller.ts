import { Request, Response } from 'express';
import { Notification } from '../models/notification.model';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';

export class NotificationController {
  static async getNotifications(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { page = 1, limit = 50, isRead } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const filter: any = { recipientId: userId };

      if (isRead !== undefined) {
        filter.isRead = isRead === 'true';
      }

      const notifications = await Notification.find(filter)
        .populate('senderId', 'fullName')
        .populate('weddingId', 'brideName groomName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

      const total = await Notification.countDocuments(filter);
      const unreadCount = await Notification.countDocuments({
        recipientId: userId,
        isRead: false
      });

      ApiResponse.success(res, 200, {
        data: notifications,
        meta: {
          page: Number(page),
          limit: Number(limit),
          total,
          unreadCount
        }
      });
    } catch (error: any) {
      logger.error('Get notifications error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch notifications');
    }
  }

  static async markAsRead(req: Request, res: Response): Promise<void> {
    try {
      const { notificationId } = req.params;
      const userId = req.user?.userId;

      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, recipientId: userId },
        { $set: { isRead: true, readAt: new Date() } },
        { new: true }
      );

      if (!notification) {
        ApiResponse.error(res, 404, 'Notification not found');
        return;
      }

      ApiResponse.success(res, 200, {
        message: 'Notification marked as read',
        data: notification
      });
    } catch (error: any) {
      logger.error('Mark notification as read error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to mark notification as read');
    }
  }

  static async deleteNotification(req: Request, res: Response): Promise<void> {
    try {
      const { notificationId } = req.params;
      const userId = req.user?.userId;

      const notification = await Notification.findOneAndDelete({
        _id: notificationId,
        recipientId: userId
      });

      if (!notification) {
        ApiResponse.error(res, 404, 'Notification not found');
        return;
      }

      ApiResponse.success(res, 200, {
        message: 'Notification deleted successfully'
      });
    } catch (error: any) {
      logger.error('Delete notification error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to delete notification');
    }
  }
}