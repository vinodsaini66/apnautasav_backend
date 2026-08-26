import { Notification } from '../models/notification.model';
import { User } from '../models/user.model';
import { Wedding } from '../models/wedding.model';
import { Collaborator } from '../models/collaborator.model';
import { getSocketServer } from '../config/socket';
import { sendPushNotification } from '../helpers/sendPushNotification';
import { SMSService } from './sms.service';
import { EmailService } from './email.service';
import mongoose from 'mongoose';
import logger from '../utils/logger';

export class NotificationService {
  /**
   * Everyone who should hear about an in-wedding change: the wedding owner
   * plus every collaborator who has actually accepted their invite, minus
   * whoever triggered the change (they don't need to be told about their
   * own action). Centralized here so guest/budget/comment notifications
   * (and any future ones) all reach the same audience the same way.
   */
  static async getWeddingRecipientIds(weddingId: string, excludeUserId?: string): Promise<string[]> {
    const [wedding, collaborators] = await Promise.all([
      Wedding.findById(weddingId).select('createdBy').lean(),
      Collaborator.find({ weddingId, invitationStatus: 'accepted' }).select('userId').lean()
    ]);

    const recipientIds = new Set<string>();
    if (wedding?.createdBy) recipientIds.add(String(wedding.createdBy));
    collaborators.forEach((collaborator) => recipientIds.add(String(collaborator.userId)));
    if (excludeUserId) recipientIds.delete(String(excludeUserId));

    return Array.from(recipientIds);
  }

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

  // Due-date reminder (#24): mirrors notifyTaskAssignment's shape — one
  // in-app notification per assignee (delivered via the same
  // Socket.IO/FCM chokepoint as everything else), plus a wedding-room
  // broadcast. On top of that, best-effort SMS/email direct to each
  // assignee — each wrapped so a delivery failure never blocks the others
  // or the main in-app notification.
  static async notifyTaskDueReminder(
    taskId: string,
    assigneeIds: string[],
    weddingId: string,
    taskTitle: string,
    dueDate: Date
  ) {
    const socketServer = getSocketServer();
    const dueDateLabel = dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    const notifications = assigneeIds.map((userId) =>
      this.createNotification({
        recipientId: userId,
        weddingId,
        type: 'task_due_reminder',
        title: 'Task Due Soon',
        message: `Task "${taskTitle}" is due on ${dueDateLabel}`,
        relatedEntityType: 'task',
        relatedEntityId: taskId,
        actionUrl: `/weddings/${weddingId}/tasks/${taskId}`
      })
    );

    await Promise.all(notifications);

    // Best-effort SMS/email, independent of and never blocking the in-app
    // notifications above.
    const users = await User.find({ _id: { $in: assigneeIds } }).select('phoneNumber email fullName').lean();
    await Promise.all(
      users.map(async (user) => {
        const smsMessage = `Reminder: task "${taskTitle}" is due on ${dueDateLabel}.`;
        if (user.phoneNumber) {
          try {
            await SMSService.sendSMS(user.phoneNumber, smsMessage);
          } catch (error) {
            logger.warn(`Task due reminder SMS failed for user ${user._id}:`, error);
          }
        }
        if (user.email) {
          try {
            await EmailService.sendMail(
              user.email,
              `Reminder: "${taskTitle}" is due soon`,
              `<p>Hi ${user.fullName || ''},</p><p>Task <strong>${taskTitle}</strong> is due on ${dueDateLabel}.</p>`
            );
          } catch (error) {
            logger.warn(`Task due reminder email failed for user ${user._id}:`, error);
          }
        }
      })
    );

    // Broadcast to wedding room
    socketServer.emitToWedding(weddingId, 'task:due_reminder', {
      taskId,
      assigneeIds,
      taskTitle,
      dueDate,
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

    const notifications = userIds.map(userId =>
      this.createNotification({
        recipientId: userId,
        weddingId,
        type: 'activity_alert',
        title: 'Guest RSVP Updated',
        message: `${guestName} ${rsvpStatus === 'confirmed' ? 'confirmed' : rsvpStatus === 'declined' ? 'declined' : 'is now pending on'} the invitation`,
        relatedEntityType: 'guest'
      })
    );

    await Promise.all(notifications);

    // Broadcast to wedding room
    socketServer.emitToWedding(weddingId, 'guest:rsvp_updated', {
      guestName,
      rsvpStatus,
      timestamp: new Date()
    });
  }
}