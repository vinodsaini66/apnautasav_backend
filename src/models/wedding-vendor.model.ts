import mongoose, { Document, Schema } from 'mongoose';

export type VendorStatus =
    | 'draft'
    | 'pending_review'
    | 'active'
    | 'inactive'
    | 'suspended'
    | 'rejected';

export interface IVendorLocation {
    address?: string;
    area?: string;
    city?: string;
    state?: string;
    country?: string;
    pincode?: string;
    latitude?: number;
    longitude?: number;
    googlePlaceId?: string;
}

export interface IVendor extends Document {
    vendorId?: mongoose.Types.ObjectId;

    businessName: string;
    displayName?: string;
    slug: string;

    description?: string;
    shortDescription?: string;

    logo?: string;
    coverImage?: string;

    contactPerson?: string;
    email?: string;
    phone?: string;
    alternatePhone?: string;
    whatsappNumber?: string;
    website?: string;

    location?: IVendorLocation;

    yearEstablished?: number;
    experienceYears?: number;
    teamSize?: number;

    serviceCities: string[];
    languages: string[];

    status: VendorStatus;

    isVerified: boolean;
    isFeatured: boolean;
    isPremium: boolean;
    isDeleted: boolean;
    isHandpicked: boolean;

    rating: number;
    reviewCount: number;
    viewCount: number;
    inquiryCount: number;

    pricing?: {
        startingPrice?: number;
        priceUnit?: 'per day' | 'per function' | 'per plate' | 'per event' | 'starting from';
    };

    createdAt: Date;
    updatedAt: Date;
}

const vendorSchema = new Schema<IVendor>(
    {
        vendorId: {
            type: Schema.Types.ObjectId,
            index: true,
        },

        businessName: {
            type: String,
            required: [true, 'Business name is required'],
            trim: true,
            index: true,
        },

        displayName: {
            type: String,
            trim: true,
        },

        slug: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true,
        },

        description: {
            type: String,
            trim: true,
        },

        shortDescription: {
            type: String,
            trim: true,
        },

        logo: {
            type: String,
        },

        coverImage: {
            type: String,
        },

        contactPerson: {
            type: String,
            trim: true,
        },

        email: {
            type: String,
            lowercase: true,
            trim: true,
        },

        phone: {
            type: String,
            trim: true,
        },

        alternatePhone: {
            type: String,
            trim: true,
        },

        whatsappNumber: {
            type: String,
            trim: true,
        },

        website: {
            type: String,
            trim: true,
        },

        location: {
            address: String,
            area: String,
            city: {
                type: String,
                index: true,
            },
            state: {
                type: String,
                index: true,
            },
            country: {
                type: String,
                default: 'India',
            },
            pincode: String,
            latitude: Number,
            longitude: Number,
            googlePlaceId: String,
        },

        yearEstablished: Number,

        experienceYears: Number,

        teamSize: Number,

        serviceCities: {
            type: [String],
            default: [],
        },

        languages: {
            type: [String],
            default: [],
        },

        status: {
            type: String,
            enum: [
                'draft',
                'pending_review',
                'active',
                'inactive',
                'suspended',
                'rejected',
            ],
            default: 'draft',
            index: true,
        },

        isVerified: {
            type: Boolean,
            default: false,
            index: true,
        },

        isFeatured: {
            type: Boolean,
            default: false,
        },

        isPremium: {
            type: Boolean,
            default: false,
        },
        isHandpicked: {
            type: Boolean,
            default: false,
        },


        isDeleted: {
            type: Boolean,
            default: false,
            index: true,
        },

        rating: {
            type: Number,
            default: 0,
            min: 0,
            max: 5,
        },

        reviewCount: {
            type: Number,
            default: 0,
        },

        viewCount: {
            type: Number,
            default: 0,
        },

        inquiryCount: {
            type: Number,
            default: 0,
        },
        pricing: {
            startingPrice: { type: Number, default: 0 },
            priceUnit: { type: String }
        }
    },
    {
        timestamps: true,
    }
);

vendorSchema.index({
    'location.city': 1,
    'location.state': 1,
});

vendorSchema.index({
    status: 1,
    isDeleted: 1,
});

export const WeddingVendor = mongoose.model<IVendor>(
    'WeddingVendor',
    vendorSchema
);