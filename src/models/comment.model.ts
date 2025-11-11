import mongoose, { Document, Schema } from 'mongoose';

export interface IComment extends Document {
  weddingId: mongoose.Types.ObjectId;
  entityType: 'task' | 'guest' | 'budget' | 'vendor' | 'note';
  entityId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  content: string;
  attachments: {
    url: string;
    fileName: string;
  }[];
  likes: mongoose.Types.ObjectId[];
  replies: mongoose.Types.ObjectId[];
  isEdited: boolean;
  editedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema = new Schema<IComment>({
  weddingId: {
    type: Schema.Types.ObjectId,
    ref: 'Wedding',
    required: true
  },
  entityType: {
    type: String,
    enum: ['task', 'guest', 'budget', 'vendor', 'note'],
    required: true
  },
  entityId: {
    type: Schema.Types.ObjectId,
    required: true
  },
  authorId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: [true, 'Comment content is required'],
    maxlength: [1000, 'Comment cannot exceed 1000 characters']
  },
  attachments: [{
    url: String,
    fileName: String
  }],
  likes: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  replies: [{
    type: Schema.Types.ObjectId,
    ref: 'Comment'
  }],
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes
commentSchema.index({ weddingId: 1 });
commentSchema.index({ entityId: 1, entityType: 1 });

export const Comment = mongoose.model<IComment>('Comment', commentSchema);