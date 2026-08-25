import mongoose, { Document, Schema } from 'mongoose';

export interface IBudget extends Document {
  weddingId: mongoose.Types.ObjectId;
  category: string;
  description: string;
  estimatedCost: number;
  actualCost?: number;
  vendor?: mongoose.Types.ObjectId;
  status: 'estimated' | 'approved' | 'paid' | 'pending';
  paymentDate?: Date;
  addedBy: mongoose.Types.ObjectId;
  currency: string;
  notes?: string;
  // Which function this expense is for, if any (e.g. "Sangeet DJ fee").
  // A wedding-wide line item like insurance or a planner's fee has none.
  eventId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const budgetSchema = new Schema<IBudget>({
  weddingId: {
    type: Schema.Types.ObjectId,
    ref: 'Wedding',
    required: true
  },
  category: {
    type: String,
    enum: ['venue', 'catering', 'decoration', 'photography', 'music', 'invitations', 'logistics', 'other'],
    required: true
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true
  },
  estimatedCost: {
    type: Number,
    required: [true, 'Estimated cost is required'],
    min: [0, 'Cost cannot be negative']
  },
  actualCost: {
    type: Number,
    min: [0, 'Cost cannot be negative']
  },
  vendor: {
    type: Schema.Types.ObjectId,
    ref: 'Vendor'
  },
  status: {
    type: String,
    enum: ['estimated', 'approved', 'paid', 'pending'],
    default: 'estimated'
  },
  paymentDate: {
    type: Date
  },
  addedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  notes: {
    type: String
  },
  eventId: {
    type: Schema.Types.ObjectId,
    ref: 'Event'
  }
}, {
  timestamps: true
});

// Indexes
budgetSchema.index({ weddingId: 1 });
budgetSchema.index({ category: 1 });
budgetSchema.index({ status: 1 });
budgetSchema.index({ eventId: 1 });

export const Budget = mongoose.model<IBudget>('Budget', budgetSchema);