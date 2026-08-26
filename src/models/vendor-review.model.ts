import mongoose, { Document, Schema } from 'mongoose';

export interface IVendorReview extends Document {
  vendorId: mongoose.Types.ObjectId;
  weddingId: mongoose.Types.ObjectId;
  reviewerId: mongoose.Types.ObjectId;
  rating: number;
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const vendorReviewSchema = new Schema<IVendorReview>({
  vendorId: {
    type: Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  weddingId: {
    type: Schema.Types.ObjectId,
    ref: 'Wedding',
    required: true
  },
  reviewerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rating: {
    type: Number,
    required: [true, 'Rating is required'],
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    maxlength: [1000, 'Comment cannot exceed 1000 characters']
  }
}, {
  timestamps: true
});

// One review per person per vendor. Re-submission is handled as an upsert
// in the controller (findOneAndUpdate with upsert: true), not by letting
// this index reject a duplicate insert.
vendorReviewSchema.index({ vendorId: 1, reviewerId: 1 }, { unique: true });
vendorReviewSchema.index({ weddingId: 1 });

export const VendorReview = mongoose.model<IVendorReview>('VendorReview', vendorReviewSchema);
