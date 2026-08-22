import mongoose, { Document, Schema } from 'mongoose';

// Promotional dashboard banners. Not tied to a wedding — this is platform
// content: whoever pays for a promoted slot gets their image uploaded and
// linked here, and it shows up in the dashboard's banner carousel until an
// admin turns it off or its scheduled window ends.
export interface IBanner extends Document {
  title: string;
  imageUrl: string;
  redirectUrl: string;
  altText?: string;
  isActive: boolean;
  sortOrder: number;
  startDate?: Date;
  endDate?: Date;
  impressions: number;
  clicks: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const bannerSchema = new Schema<IBanner>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    imageUrl: {
      type: String,
      required: true,
    },
    redirectUrl: {
      type: String,
      required: true,
    },
    altText: {
      type: String,
      trim: true,
      maxlength: 160,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    impressions: {
      type: Number,
      default: 0,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

bannerSchema.index({ isActive: 1, sortOrder: 1 });

export const Banner = mongoose.model<IBanner>('Banner', bannerSchema);
