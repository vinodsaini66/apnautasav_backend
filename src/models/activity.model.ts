import mongoose, { Document, Schema } from 'mongoose';

export interface IActivity extends Document {
  weddingId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  actionType: 'created' | 'updated' | 'deleted' | 'commented' | 'assigned' | 'member_joined';
  entityType: 'guest' | 'task' | 'budget' | 'vendor' | 'collaborator' | 'note';
  entityId?: mongoose.Types.ObjectId;
  entityName?: string;
  description: string;
  changes?: {
    field: string;
    oldValue: any;
    newValue: any;
  };
  createdAt: Date;
}

const activitySchema = new Schema<IActivity>({
  weddingId: {
    type: Schema.Types.ObjectId,
    ref: 'Wedding',
    required: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  actionType: {
    type: String,
    enum: ['created', 'updated', 'deleted', 'commented', 'assigned', 'member_joined'],
    required: true
  },
  entityType: {
    type: String,
    enum: ['guest', 'task', 'budget', 'vendor', 'collaborator', 'note'],
    required: true
  },
  entityId: {
    type: Schema.Types.ObjectId
  },
  entityName: {
    type: String
  },
  description: {
    type: String,
    required: true
  },
  changes: {
    field: String,
    oldValue: Schema.Types.Mixed,
    newValue: Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes
activitySchema.index({ weddingId: 1, createdAt: -1 });
activitySchema.index({ userId: 1 });

export const Activity = mongoose.model<IActivity>('Activity', activitySchema);