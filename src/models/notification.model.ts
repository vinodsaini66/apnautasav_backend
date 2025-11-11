import mongoose, { Document, Schema } from 'mongoose';

export interface INotification extends Document {
  recipientId: mongoose.Types.ObjectId;
  weddingId: mongoose.Types.ObjectId;
  senderId?: mongoose.Types.ObjectId;
  type: 'task_assigned' | 'comment_added' | 'member_invited' | 'budget_updated' | 'activity_alert';
  title: string;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: mongoose.Types.ObjectId;
  isRead: boolean;
  readAt?: Date;
  actionUrl?: string;
  createdAt: Date;
  expiresAt?: Date;
}

const notificationSchema = new Schema<INotification>({
  recipientId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  weddingId: {
    type: Schema.Types.ObjectId,
    ref: 'Wedding',
    required: true
  },
  senderId: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  type: {
    type: String,
    enum: ['task_assigned', 'comment_added', 'member_invited', 'budget_updated', 'activity_alert'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  relatedEntityType: {
    type: String
  },
  relatedEntityId: {
    type: Schema.Types.ObjectId
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  actionUrl: {
    type: String
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  }
}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ recipientId: 1, isRead: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);