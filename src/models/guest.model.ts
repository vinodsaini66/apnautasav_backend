import mongoose, { Document, Schema } from 'mongoose';

export interface IGuest extends Document {
  weddingId: mongoose.Types.ObjectId;
  name: string;
  email?: string;
  phoneNumber?: string;
  category: 'family' | 'friends' | 'colleagues' | 'others';
  rsvpStatus: 'pending' | 'confirmed' | 'declined';
  address: string;
  plusOne: number;
  dietaryRestrictions?: string;
  seatingPreference?: string;
  notes?: string;
  addedBy: mongoose.Types.ObjectId;
  isVIP: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const guestSchema = new Schema<IGuest>({
  weddingId: {
    type: Schema.Types.ObjectId,
    ref: 'Wedding',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
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
  address: {
    type: String,
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
  },
  isVIP: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes
guestSchema.index({ weddingId: 1 });
guestSchema.index({ email: 1 });
guestSchema.index({ phoneNumber: 1 });

export const Guest = mongoose.model<IGuest>('Guest', guestSchema);