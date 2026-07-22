import mongoose, { Document, Schema } from 'mongoose';

export interface IVendorAlbum extends Document {
  vendorId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  coverImage?: string;
  mediaCount: number;
  sortOrder: number;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const vendorAlbumSchema = new Schema<IVendorAlbum>(
  {
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: 'WeddingVendor',
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    coverImage: {
      type: String,
    },

    mediaCount: {
      type: Number,
      default: 0,
    },

    sortOrder: {
      type: Number,
      default: 0,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

vendorAlbumSchema.index({
  vendorId: 1,
  isDeleted: 1,
});

export const VendorAlbum = mongoose.model<IVendorAlbum>(
  'VendorAlbum',
  vendorAlbumSchema
);