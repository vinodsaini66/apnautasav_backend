import mongoose, { Document, Schema } from 'mongoose';

export interface IGuest extends Document {
  weddingId: mongoose.Types.ObjectId;
  firstName: string;
  lastName: string;
  email?: string;
  phoneNumber?: string;
  category: 'family' | 'friends' | 'colleagues' | 'others';
  plusOne: number;
  rsvpStatus: 'pending' | 'confirmed' | 'declined';
  dietaryRestrictions?: string;
  seatingPreference?: string;
  notes?: string;
  addedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const guestSchema = new Schema<IGuest>({
  weddingId: {
    type: Schema.Types.ObjectId,
    ref: 'Wedding',
    required: true
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    enum: ['family', 'friends', 'colleagues', 'others'],
    required: true
  },
  plusOne: {
    type: Number,
    default: 0,
    min: 0
  },
  rsvpStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'declined'],
    default: 'pending'
  },
  dietaryRestrictions: {
    type: String
  },
  seatingPreference: {
    type: String
  },
  notes: {
    type: String
  },
  addedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
guestSchema.index({ weddingId: 1 });
guestSchema.index({ email: 1 });
guestSchema.index({ phoneNumber: 1 });

export const Guest = mongoose.model<IGuest>('Guest', guestSchema);