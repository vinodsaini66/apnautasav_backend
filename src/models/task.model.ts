import mongoose, { Document, Schema } from 'mongoose';

export interface ITask extends Document {
  weddingId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  dueDate?: Date;
  assignedTo: mongoose.Types.ObjectId[];
  assignedBy?: mongoose.Types.ObjectId;
  assignedAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  estimatedHours?: number;
  actualHours?: number;
  completedAt?: Date;
  comments: mongoose.Types.ObjectId[];
  tags: string[];
  attachments: {
    url: string;
    fileName: string;
    uploadedBy: mongoose.Types.ObjectId;
  }[];
  // Which function this task is for, if any — e.g. "book mehndi artist" vs.
  // a wedding-wide task like "apply for marriage certificate" that has none.
  eventId?: mongoose.Types.ObjectId;
  // Due-date reminders (#24): how many days before dueDate to nudge the
  // assignee(s), and whether that one-shot reminder has already fired.
  reminderOffsetDays?: number;
  reminderSent?: boolean;
  // Recurring tasks (#25b): when set and the task is completed, a new task
  // is generated for the next occurrence.
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
    endDate?: Date;
  };
  // Subtasks (#25c): lightweight checklist items scoped to this task only —
  // no assignee/due date/status of their own.
  subtasks: {
    _id: mongoose.Types.ObjectId;
    title: string;
    completed: boolean;
  }[];
  // Dependencies (#25d): other tasks this one is blocked on. Frontend-only
  // enforcement — no backend checks against this array.
  dependsOn?: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<ITask>({
  weddingId: {
    type: Schema.Types.ObjectId,
    ref: 'Wedding',
    required: true
  },
  title: {
    type: String,
    required: [true, 'Task title is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    enum: ['venue', 'decoration', 'catering', 'logistics', 'invitations', 'music', 'photography', 'others'],
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  dueDate: {
    type: Date
  },
  assignedTo: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  assignedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  assignedAt: {
    type: Date
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  estimatedHours: {
    type: Number,
    min: 0
  },
  actualHours: {
    type: Number,
    min: 0
  },
  completedAt: {
    type: Date
  },
  comments: [{
    type: Schema.Types.ObjectId,
    ref: 'Comment'
  }],
  tags: [{
    type: String,
    trim: true
  }],
  attachments: [{
    url: String,
    fileName: String,
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  eventId: {
    type: Schema.Types.ObjectId,
    ref: 'Event'
  },
  reminderOffsetDays: {
    type: Number,
    min: 0
  },
  reminderSent: {
    type: Boolean,
    default: false
  },
  recurrence: {
    type: {
      frequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly']
      },
      interval: {
        type: Number,
        min: 1
      },
      endDate: {
        type: Date
      }
    },
    required: false,
    _id: false
  },
  subtasks: [{
    title: {
      type: String,
      required: true,
      trim: true
    },
    completed: {
      type: Boolean,
      default: false
    }
  }],
  dependsOn: [{
    type: Schema.Types.ObjectId,
    ref: 'Task'
  }]
}, {
  timestamps: true
});

// Indexes
taskSchema.index({ weddingId: 1 });
taskSchema.index({ status: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ assignedTo: 1 });
taskSchema.index({ eventId: 1 });

export const Task = mongoose.model<ITask>('Task', taskSchema);