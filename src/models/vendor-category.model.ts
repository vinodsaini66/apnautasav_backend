import mongoose, { Document, Schema } from 'mongoose';

export interface IVendorCategory extends Document {
  name: string;
  slug: string;
  parentId?: mongoose.Types.ObjectId | null;
  level: number;
  icon?: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const vendorCategorySchema = new Schema<IVendorCategory>(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    parentId: {
      type: Schema.Types.ObjectId,
      ref: 'VendorCategory',
      default: null,
      index: true,
    },

    level: {
      type: Number,
      default: 0,
    },

    icon: {
      type: String,
      default: '📦',
    },

    description: {
      type: String,
      trim: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

vendorCategorySchema.index({
  parentId: 1,
  isActive: 1,
  isDeleted: 1,
});

export const VendorCategory = mongoose.model<IVendorCategory>(
  'VendorCategory',
  vendorCategorySchema
);