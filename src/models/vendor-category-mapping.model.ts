import mongoose, { Document, Schema } from 'mongoose';

export interface IVendorCategoryMapping extends Document {
  vendorId: mongoose.Types.ObjectId;
  categoryId: mongoose.Types.ObjectId;
  parentCategoryId?: mongoose.Types.ObjectId;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const vendorCategoryMappingSchema =
  new Schema<IVendorCategoryMapping>(
    {
      vendorId: {
        type: Schema.Types.ObjectId,
        ref: 'WeddingVendor',
        required: true,
        index: true,
      },

      categoryId: {
        type: Schema.Types.ObjectId,
        ref: 'VendorCategory',
        required: true,
        index: true,
      },

      parentCategoryId: {
        type: Schema.Types.ObjectId,
        ref: 'VendorCategory',
        index: true,
      },

      isPrimary: {
        type: Boolean,
        default: false,
      },

      isActive: {
        type: Boolean,
        default: true,
      },
    },
    {
      timestamps: true,
    }
  );

vendorCategoryMappingSchema.index(
  {
    vendorId: 1,
    categoryId: 1,
  },
  {
    unique: true,
  }
);

export const VendorCategoryMapping =
  mongoose.model<IVendorCategoryMapping>(
    'VendorCategoryMapping',
    vendorCategoryMappingSchema
  );