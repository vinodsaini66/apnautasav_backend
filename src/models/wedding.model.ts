import mongoose, { Document, Schema } from 'mongoose';

export interface IWedding extends Document {
  name: string;
  weddingCode: string;
  brideName: string;
  groomName: string;
  weddingDate: Date;
  location: string;
  totalBudget: number;
  currency: string;
  createdBy: mongoose.Types.ObjectId;
  members: mongoose.Types.ObjectId[];
  status: 'planning' | 'ongoing' | 'completed';
  description?: string;
  imageUrl?: string;
  // Public wedding website (#29) — when isPublic is true, GET
  // /weddings/public/:publicSlug (and .../events) serve a curated,
  // guest-safe subset of this document to unauthenticated visitors.
  // publicSlug is only ever set once the wedding is made public at least
  // once — sparse so many weddings can share `undefined` without violating
  // the unique index.
  isPublic: boolean;
  publicSlug?: string;
  createdAt: Date;
  updatedAt: Date;
}

const weddingSchema = new Schema<IWedding>({
  name: {
    type: String,
    required: [true, 'Location is required'],
    trim: true
  },
  weddingCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    length: 6
  },
  brideName: {
    type: String,
    required: [true, 'Bride name is required'],
    trim: true
  },
  groomName: {
    type: String,
    required: [true, 'Groom name is required'],
    trim: true
  },
  weddingDate: {
    type: Date,
    required: [true, 'Wedding date is required']
  },
  location: {
    type: String,
    required: [true, 'Location is required'],
    trim: true
  },
  totalBudget: {
    type: Number,
    required: [true, 'Total budget is required'],
    min: [0, 'Budget cannot be negative']
  },
  currency: {
    type: String,
    default: 'INR',
    enum: ['INR', 'USD', 'EUR', 'GBP']
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    type: Schema.Types.ObjectId,
    ref: 'Collaborator'
  }],
  status: {
    type: String,
    enum: ['planning', 'ongoing', 'completed'],
    default: 'planning'
  },
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  imageUrl: {
    type: String
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  publicSlug: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  }
}, {
  timestamps: true
});

// Indexes
weddingSchema.index({ createdBy: 1 });
weddingSchema.index({ weddingCode: 1 });
weddingSchema.index({ weddingDate: 1 });

export const Wedding = mongoose.model<IWedding>('Wedding', weddingSchema);