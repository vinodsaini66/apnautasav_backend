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

// A second (or third...) branch/service address for vendors with multiple
// locations (e.g. a studio with a Jaipur and a Mumbai office). Deliberately
// kept minimal — per Vendor_Data_Schema_Audit.md's scope call, just address
// + optional per-branch contact, not a full duplicate of every vendor field.
// The existing top-level `location` stays exactly as-is (still the primary
// address used for search/filter by city/state) — this is purely additive.
export interface IVendorBranchLocation extends IVendorLocation {
    label?: string; // e.g. "Jaipur Studio" — lets a vendor distinguish branches on their profile
    phone?: string;
    whatsappNumber?: string;
}

export interface IVendor extends Document {
    vendorId?: mongoose.Types.ObjectId;
    businessName: string;
    displayName?: string;
    oldName?: string;
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
    locations?: IVendorBranchLocation[];

    categorySlug?: string;
    profileDetails?: {
        services?: string[]; // e.g. ["Candid Photography", "Traditional Photography", "Pre-Wedding Shoot"]
        workingStyle?: string;
        paymentTerms?: string;
        travelCost?: string;
        deliveryTime?: string;
    };

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

    // Recognition/awards (e.g. "Users' Choice Award Winner 2024") — plain
    // strings, generic across every category, display-only.
    awards?: string[];

    pricing?: {
        startingPrice?: number;
        priceUnit?: 'per day' | 'per function' | 'per plate' | 'per event' | 'starting from';
        destinationPrice?: string;
        destinationPriceUnit?: string;
        packages?: {
            label: string;
            startingPrice: number;
        }[];
    };

    venueDetails?: {
        guestCapacityMin?: number;
        guestCapacityMax?: number;
        venueTypes?: string[];
        vegPricePerPlate?: number;
        nonVegPricePerPlate?: number;
        rentalPrice?: number;
    };

    // ---------------------------------------------------------------
    // Vendor OS (spec: ApnaUtsav-Vendor-OS-Product-Spec.pdf). A listing
    // created through the Vendor OS panel is this same document — the
    // vendor's working data (packages, portfolio, availability) IS the
    // public listing. All fields below are optional/defaulted so imported
    // and admin-created listings are unaffected.
    // ---------------------------------------------------------------
    source?: 'admin' | 'import' | 'vendor_os';
    osEnabled?: boolean;
    osPlan?: 'free' | 'pro' | 'business';
    osCategory?: string; // CategoryConfig.key
    tagline?: string;
    coverImages?: string[];
    subTags?: string[];
    travelPolicy?: string;
    weddingsDone?: number;
    gstNumber?: string;
    upiId?: string;
    brochureUrl?: string;
    socialLinks?: {
        instagram?: string;
        facebook?: string;
        youtube?: string;
        pinterest?: string;
    };
    verification?: {
        phone?: boolean;
        gst?: boolean;
        identity?: boolean;
        visited?: boolean;
    };
    policies?: {
        advancePercent?: number;
        advance?: string;
        cancellation?: string;
        // Structured payment schedule (e.g. 30% at booking / 20% 30 days
        // prior / 50% on the day) — also the default for new quotes.
        schedule?: { label: string; when?: string; percent: number }[];
        nonRefundableAdvance?: boolean;
        allowDateChange?: boolean;
    };
    // Category-specific profile fields (profile_json), shape defined by the
    // CategoryConfig's profileSchema.
    categoryProfile?: Record<string, any>;
    profileCompleteness?: number;
    firstPublishedAt?: Date;
    reviewNote?: string;

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

        oldName: {
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

        // Extra branch/service locations — not searched/filtered on (only
        // the primary `location` above is indexed for that), just displayed
        // on the vendor's own profile page.
        locations: {
            type: [
                {
                    _id: false,
                    label: String,
                    address: String,
                    area: String,
                    city: String,
                    state: String,
                    country: { type: String, default: 'India' },
                    pincode: String,
                    latitude: Number,
                    longitude: Number,
                    googlePlaceId: String,
                    phone: String,
                    whatsappNumber: String,
                },
            ],
            default: [],
        },

        categorySlug: {
            type: String,
            trim: true,
            lowercase: true,
            index: true,
        },

        profileDetails: {
            services: { type: [String], default: [] },
            workingStyle: String,
            paymentTerms: String,
            travelCost: String,
            deliveryTime: String,
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

        awards: {
            type: [String],
            default: [],
        },

        pricing: {
            startingPrice: { type: Number, default: 0 },
            priceUnit: { type: String },
            destinationPrice: { type: String },
            destinationPriceUnit: { type: String },
            packages: {
                type: [
                    {
                        _id: false,
                        label: { type: String, required: true },
                        startingPrice: { type: Number, required: true },
                    },
                ],
                default: [],
            },
        },

        venueDetails: {
            guestCapacityMin: Number,
            guestCapacityMax: Number,
            venueTypes: { type: [String], default: [] },
            vegPricePerPlate: Number,
            nonVegPricePerPlate: Number,
            rentalPrice: Number,
        },

        source: {
            type: String,
            enum: ['admin', 'import', 'vendor_os'],
            default: 'admin',
        },
        osEnabled: { type: Boolean, default: false, index: true },
        osPlan: {
            type: String,
            enum: ['free', 'pro', 'business'],
            default: 'free',
        },
        osCategory: { type: String, trim: true, lowercase: true, index: true },
        tagline: { type: String, trim: true, maxlength: 160 },
        coverImages: { type: [String], default: [] },
        subTags: { type: [String], default: [] },
        travelPolicy: { type: String, trim: true, maxlength: 500 },
        weddingsDone: { type: Number, default: 0 },
        gstNumber: { type: String, trim: true, uppercase: true },
        upiId: { type: String, trim: true },
        brochureUrl: String,
        socialLinks: {
            instagram: String,
            facebook: String,
            youtube: String,
            pinterest: String,
        },
        verification: {
            phone: { type: Boolean, default: false },
            gst: { type: Boolean, default: false },
            identity: { type: Boolean, default: false },
            visited: { type: Boolean, default: false },
        },
        policies: {
            advancePercent: { type: Number, min: 0, max: 100 },
            advance: { type: String, trim: true, maxlength: 1000 },
            cancellation: { type: String, trim: true, maxlength: 1000 },
            schedule: {
                type: [{ _id: false, label: String, when: String, percent: Number }],
                default: undefined,
            },
            nonRefundableAdvance: Boolean,
            allowDateChange: Boolean,
        },
        categoryProfile: { type: Schema.Types.Mixed, default: {} },
        profileCompleteness: { type: Number, default: 0 },
        firstPublishedAt: Date,
        reviewNote: { type: String, trim: true, maxlength: 1000 },
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