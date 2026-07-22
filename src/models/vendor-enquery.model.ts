import mongoose, { Document, Schema } from 'mongoose';

export type WeddingVendorInquiryStatus =
    | 'new'
    | 'contacted'
    | 'quoted'
    | 'negotiating'
    | 'confirmed'
    | 'rejected'
    | 'cancelled'
    | 'closed';

export type WeddingVendorInquirySource =
    | 'website'
    | 'wedding_dashboard'
    | 'ai_recommendation'
    | 'admin'
    | 'other';

export interface IWeddingVendorInquiry extends Document {
    weddingVendorId: mongoose.Types.ObjectId;
    weddingId?: mongoose.Types.ObjectId;
    userId?: mongoose.Types.ObjectId;

    fullName: string;
    email?: string;
    phone: string;
    whatsappNumber?: string;

    functionDate?: Date;
    guestCount?: number;
    roomCount?: number;

    functionType?: string;
    functionTime?: string;

    message?: string;

    whatsappNotification: boolean;

    source: WeddingVendorInquirySource;
    status: WeddingVendorInquiryStatus;

    createdAt: Date;
    updatedAt: Date;
}

const weddingVendorInquirySchema =
    new Schema<IWeddingVendorInquiry>(
        {
            weddingVendorId: {
                type: Schema.Types.ObjectId,
                ref: 'WeddingVendor',
                required: true,
                index: true,
            },

            weddingId: {
                type: Schema.Types.ObjectId,
                ref: 'Wedding',
                index: true,
            },

            userId: {
                type: Schema.Types.ObjectId,
                ref: 'User',
                index: true,
            },

            fullName: {
                type: String,
                required: [true, 'Full name is required'],
                trim: true,
            },

            email: {
                type: String,
                lowercase: true,
                trim: true,
            },

            phone: {
                type: String,
                required: [true, 'Phone number is required'],
                trim: true,
            },

            whatsappNumber: {
                type: String,
                trim: true,
            },

            functionDate: {
                type: Date,
            },

            guestCount: {
                type: Number,
                min: [1, 'Guest count must be greater than 0'],
            },

            roomCount: {
                type: Number,
                min: [0, 'Room count cannot be negative'],
            },

            functionType: {
                type: String,
                trim: true,
            },

            functionTime: {
                type: String,
                trim: true,
            },

            message: {
                type: String,
                trim: true,
            },

            whatsappNotification: {
                type: Boolean,
                default: false,
            },

            source: {
                type: String,
                enum: [
                    'website',
                    'wedding_dashboard',
                    'ai_recommendation',
                    'admin',
                    'other',
                ],
                default: 'website',
            },

            status: {
                type: String,
                enum: [
                    'new',
                    'contacted',
                    'quoted',
                    'negotiating',
                    'confirmed',
                    'rejected',
                    'cancelled',
                    'closed',
                ],
                default: 'new',
                index: true,
            },
        },
        {
            timestamps: true,
        }
    );

weddingVendorInquirySchema.index({
    weddingVendorId: 1,
    status: 1,
});

weddingVendorInquirySchema.index({
    weddingId: 1,
    userId: 1,
});

weddingVendorInquirySchema.index({
    createdAt: -1,
});

export const VendorInquiry =
    mongoose.model<IWeddingVendorInquiry>(
        'VendorInquiry',
        weddingVendorInquirySchema
    );