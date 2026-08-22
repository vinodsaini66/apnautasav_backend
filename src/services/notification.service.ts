import { Notification } from '../models/notification.model';
import { User } from '../models/user.model';
import { getSocketServer } from '../config/socket';
import { sendPushNotification } from '../helpers/sendPushNotification';
import mongoose from 'mongoose';
import logger from '../utils/logger';

export class NotificationService {
  static async createNotification(data: {
    recipientId: string;
    weddingId: string;
    senderId?: string;
    type: string;
    title: string;
    message: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
    actionUrl?: string;
  }) {
    try {
      const notification = await Notification.create({
        ...data,
        recipientId: new mongoose.Types.ObjectId(data.recipientId),
        weddingId: new mongoose.Types.ObjectId(data.weddingId),
        senderId: data.senderId ? new mongoose.Types.ObjectId(data.senderId) : undefined,
        relatedEntityId: data.relatedEntityId ? new mongoose.Types.ObjectId(data.relatedEntityId) : undefined
      });

      // Deliver over exactly one channel, chosen by presence, so the same
      // notification is never sent twice: Socket.IO while the recipient is
      // online, FCM push while they're not. Persistence above already
      // happened unconditionally, so history is never lost either way.
      // If the socket server isn't reachable at all, fall back to treating
      // the recipient as offline (attempt push) rather than throwing out of
      // createNotification and losing delivery entirely.
      let socketServer: ReturnType<typeof getSocketServer> | null = null;
      let isOnline = false;
      try {
        socketServer = getSocketServer();
        isOnline = socketServer.isUserOnline(data.recipientId);
      } catch (lookupError) {
        logger.warn('Socket server unavailable, treating recipient as offline:', lookupError);
      }

      if (isOnline && socketServer) {
        try {
          socketServer.emitToUser(data.recipientId, 'notification:new', {
            id: notification._id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            weddingId: notification.weddingId,
            actionUrl: notification.actionUrl,
            createdAt: notification.createdAt
          });

          logger.info(`Real-time notification sent to user ${data.recipientId}`);
        } catch (socketError) {
          logger.warn('Socket notification failed, but saved to database:', socketError);
        }
      } else {
        try {
          const user = await User.findById(data.recipientId).select('fcm_token');

          if (user?.fcm_token) {
            await sendPushNotification({
              tokens: user.fcm_token,
              title: notification.title,
              body: notification.message,
              data: {
                notificationId: String(notification._id),
                type: notification.type,
                weddingId: String(notification.weddingId),
                ...(notification.actionUrl ? { actionUrl: notification.actionUrl } : {})
              }
            });

            logger.info(`Push notification sent to offline user ${data.recipientId}`);
          } else {
            logger.info(`User ${data.recipientId} is offline and has no fcm_token - notification saved to DB only`);
          }
        } catch (pushError) {
          logger.warn('Push notification failed, but saved to database:', pushError);
        }
      }

      logger.info(`Notification created for user ${data.recipientId}`);
      return notification;
    } catch (error) {
      logger.error('Error creating notification:', error);
      throw error;
    }
  }

  static async notifyTaskAssignment(
    taskId: string,
    assignedUserIds: string[],
    assignedBy: string,
    weddingId: string,
    taskTitle: string
  ) {
    const socketServer = getSocketServer();
    
    const notifications = assignedUserIds.map(userId =>
      this.createNotification({
        recipientId: userId,
        weddingId,
        senderId: assignedBy,
        type: 'task_assigned',
        title: 'New Task Assigned',
        message: `You have been assigned to task: ${taskTitle}`,
        relatedEntityType: 'task',
        relatedEntityId: taskId,
        actionUrl: `/weddings/${weddingId}/tasks/${taskId}`
      })
    );

    await Promise.all(notifications);

    // Broadcast to wedding room
    socketServer.emitToWedding(weddingId, 'task:assigned', {
      taskId,
      assignedTo: assignedUserIds,
      assignedBy,
      taskTitle,
      timestamp: new Date()
    });
  }

  static async notifyComment(
    commentAuthorId: string,
    recipientIds: string[],
    entityType: string,
    entityId: string,
    weddingId: string,
    commentContent: string
  ) {
    const socketServer = getSocketServer();
    
    const notifications = recipientIds
      .filter(id => id !== commentAuthorId)
      .map(userId =>
        this.createNotification({
          recipientId: userId,
          weddingId,
          senderId: commentAuthorId,
          type: 'comment_added',
          title: 'New Comment',
          message: `New comment on ${entityType}: ${commentContent.substring(0, 50)}...`,
          relatedEntityType: entityType,
          relatedEntityId: entityId
        })
      );

    await Promise.all(notifications);

    // Broadcast to wedding room
    socketServer.emitToWedding(weddingId, 'comment:added', {
      entityType,
      entityId,
      authorId: commentAuthorId,
      content: commentContent,
      timestamp: new Date()
    });
  }

  static async notifyMemberInvitation(
    invitedUserId: string,
    invitedBy: string,
    weddingId: string
  ) {
    await this.createNotification({
      recipientId: invitedUserId,
      weddingId,
      senderId: invitedBy,
      type: 'member_invited',
      title: 'Wedding Invitation',
      message: 'You have been invited to collaborate on a wedding',
      actionUrl: `/weddings/${weddingId}`
    });
  }

  static async notifyBudgetUpdate(
    weddingId: string,
    userIds: string[],
    updatedBy: string,
    budgetCategory: string,
    action: 'added' | 'updated' | 'deleted'
  ) {
    const socketServer = getSocketServer();
    
    const notifications = userIds
      .filter(id => id !== updatedBy)
      .map(userId =>
        this.createNotification({
          recipientId: userId,
          weddingId,
          senderId: updatedBy,
          type: 'budget_updated',
          title: 'Budget Updated',
          message: `Budget ${action} for ${budgetCategory}`,
          relatedEntityType: 'budget'
        })
      );

    await Promise.all(notifications);

    // Broadcast to wedding room
    socketServer.emitToWedding(weddingId, 'budget:updated', {
      action,
      category: budgetCategory,
      updatedBy,
      timestamp: new Date()
    });
  }

  static async notifyGuestRSVP(
    weddingId: string,
    userIds: string[],
    guestName: string,
    rsvpStatus: string
  ) {
    const socketServer = getSocketServer();
    console.log(userIds);
    
    // Broadcast to wedding room
    socketServer.emitToWedding(weddingId, 'guest:rsvp_updated', {
      guestName,
      rsvpStatus,
      timestamp: new Date()
    });
  }
}