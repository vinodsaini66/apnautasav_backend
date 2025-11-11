import mongoose, { Document, Schema } from 'mongoose';

export interface IVendor extends Document {
  weddingId: mongoose.Types.ObjectId;
  vendorName: string;
  category: string;
  contactPerson?: string;
  email?: string;
  phoneNumber: string;
  website?: string;
  estimatedCost: number;
  actualCost?: number;
  bookingStatus: 'inquiry' | 'negotiating' | 'booked' | 'confirmed' | 'cancelled';
  negotiationNotes?: string;
  contractUrl?: string;
  paymentTerms?: string;
  addedBy: mongoose.Types.ObjectId;
  rating?: number;
  reviews?: string;
  createdAt: Date;
  updatedAt: Date;
}

const vendorSchema = new Schema<IVendor>({
  weddingId: {
    type: Schema.Types.ObjectId,
    ref: 'Wedding',
    required: true
  },
  vendorName: {
    type: String,
    required: [true, 'Vendor name is required'],
    trim: true
  },
  category: {
    type: String,
    enum: ['catering', 'photography', 'decoration', 'music', 'venue', 'invitations', 'logistics', 'other'],
    required: true
  },
  contactPerson: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  website: {
    type: String,
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
  bookingStatus: {
    type: String,
    enum: ['inquiry', 'negotiating', 'booked', 'confirmed', 'cancelled'],
    default: 'inquiry'
  },
  negotiationNotes: {
    type: String
  },
  contractUrl: {
    type: String
  },
  paymentTerms: {
    type: String
  },
  addedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rating: {
    type: Number,
    min: 0,
    max: 5
  },
  reviews: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes
vendorSchema.index({ weddingId: 1 });
vendorSchema.index({ category: 1 });
vendorSchema.index({ bookingStatus: 1 });

export const Vendor = mongoose.model<IVendor>('Vendor', vendorSchema);