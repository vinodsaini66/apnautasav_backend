import mongoose, { Document, Schema } from 'mongoose';

export interface ISharedNote extends Document {
  weddingId: mongoose.Types.ObjectId;
  title: string;
  content: string;
  createdBy: mongoose.Types.ObjectId;
  collaborators: mongoose.Types.ObjectId[];
  tags: string[];
  isPinned: boolean;
  editHistory: {
    editedBy: mongoose.Types.ObjectId;
    editedAt: Date;
    previousContent: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const sharedNoteSchema = new Schema<ISharedNote>({
  weddingId: {
    type: Schema.Types.ObjectId,
    ref: 'Wedding',
    required: true
  },
  title: {
    type: String,
    required: [true, 'Note title is required'],
    trim: true
  },
  content: {
    type: String,
    required: [true, 'Note content is required']
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  collaborators: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  tags: [{
    type: String,
    trim: true
  }],
  isPinned: {
    type: Boolean,
    default: false
  },
  editHistory: [{
    editedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    editedAt: {
      type: Date,
      default: Date.now
    },
    previousContent: String
  }]
}, {
  timestamps: true
});

// Indexes
sharedNoteSchema.index({ weddingId: 1 });
sharedNoteSchema.index({ createdBy: 1 });
sharedNoteSchema.index({ isPinned: -1, updatedAt: -1 });

export const SharedNote = mongoose.model<ISharedNote>('SharedNote', sharedNoteSchema);