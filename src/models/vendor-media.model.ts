import mongoose, { Document, Schema } from 'mongoose';

// 'embed' = a YouTube/Instagram URL rendered as an embed (Vendor OS).
export type VendorMediaType = 'image' | 'video' | 'embed';

export interface IVendorMedia extends Document {
    vendorId: mongoose.Types.ObjectId;
    type: VendorMediaType;
    url: string;
    thumbnailUrl?: string;
    title?: string;
    description?: string;
    albumId?: mongoose.Types.ObjectId;
    sortOrder: number;
    isFeatured: boolean;
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const vendorMediaSchema = new Schema<IVendorMedia>(
    {
        vendorId: {
            type: Schema.Types.ObjectId,
            // Media belongs to a public marketplace listing (WeddingVendor),
            // not the wedding-scoped tracker (Vendor) — was mislabeled before;
            // VendorMediaService already validates against WeddingVendor, so
            // this only fixes populate() metadata, not stored data.
            ref: 'WeddingVendor',
            required: true,
            index: true,
        },

        type: {
            type: String,
            enum: ['image', 'video', 'embed'],
            required: true,
            index: true,
        },

        url: {
            type: String,
            required: true,
        },

        thumbnailUrl: {
            type: String,
        },

        title: {
            type: String,
            trim: true,
        },

        description: {
            type: String,
            trim: true,
        },

        albumId: {
            type: Schema.Types.ObjectId,
            ref: 'VendorAlbum',
            index: true,
        },

        sortOrder: {
            type: Number,
            default: 0,
        },

        isFeatured: {
            type: Boolean,
            default: false,
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

vendorMediaSchema.index({
    vendorId: 1,
    type: 1,
    isDeleted: 1,
});

export const VendorMedia = mongoose.model<IVendorMedia>(
    'VendorMedia',
    vendorMediaSchema
);