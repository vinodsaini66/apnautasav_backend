import mongoose, { Document, Schema } from 'mongoose';

export interface ICollaborator extends Document {
  weddingId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: 'admin' | 'editor' | 'viewer';
  joinedAt: Date;
  invitedBy: mongoose.Types.ObjectId;
  invitationStatus: 'pending' | 'accepted' | 'rejected';
  invitationCode?: string;
  permissions: {
    canEdit: boolean;
    canDelete: boolean;
    canInvite: boolean;
    canManageMembers: boolean;
  };
  lastAccessedAt?: Date;
}

const collaboratorSchema = new Schema<ICollaborator>({
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
  role: {
    type: String,
    enum: ['admin', 'editor', 'viewer'],
    default: 'editor'
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  invitedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  invitationStatus: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  invitationCode: {
    type: String
  },
  permissions: {
    canEdit: {
      type: Boolean,
      default: true
    },
    canDelete: {
      type: Boolean,
      default: false
    },
    canInvite: {
      type: Boolean,
      default: false
    },
    canManageMembers: {
      type: Boolean,
      default: false
    }
  },
  lastAccessedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Compound unique index
collaboratorSchema.index({ weddingId: 1, userId: 1 }, { unique: true });
collaboratorSchema.index({ invitationCode: 1 });

export const Collaborator = mongoose.model<ICollaborator>('Collaborator', collaboratorSchema);