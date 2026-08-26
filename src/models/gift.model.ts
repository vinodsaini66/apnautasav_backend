import mongoose, { Document, Schema } from 'mongoose';

export interface IGift extends Document {
  weddingId: mongoose.Types.ObjectId;
  guestId?: mongoose.Types.ObjectId;
  giverName: string;
  amount: number;
  currency: string;
  eventId?: mongoose.Types.ObjectId;
  receivedDate?: Date;
  notes?: string;
  addedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const giftSchema = new Schema<IGift>({
  weddingId: {
    type: Schema.Types.ObjectId,
    ref: 'Wedding',
    required: true
  },
  guestId: {
    type: Schema.Types.ObjectId,
    ref: 'Guest'
  },
  giverName: {
    type: String,
    required: [true, 'Giver name is required'],
    trim: true
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  currency: {
    type: String,
    default: 'INR'
  },
  eventId: {
    type: Schema.Types.ObjectId,
    ref: 'Event'
  },
  receivedDate: {
    type: Date
  },
  notes: {
    type: String
  },
  addedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
giftSchema.index({ weddingId: 1 });
giftSchema.index({ eventId: 1 });

export const Gift = mongoose.model<IGift>('Gift', giftSchema);
