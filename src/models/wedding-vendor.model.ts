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
    // A former business name, for a vendor that's rebranded (e.g. reference
    // data: "TigerLily" → "Wishco.") — display-only continuity, not used for
    // search/lookup.
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
    // Additional branch/service locations beyond the primary `location`
    // above — see IVendorBranchLocation.
    locations?: IVendorBranchLocation[];

    // Denormalized copy of the vendor's primary category slug (e.g.
    // "wedding-photographers"), kept alongside the real VendorCategoryMapping
    // relation (not a replacement for it) so a vendor's category is visible
    // directly on the document without a join — used by bulk-import scripts
    // that source data already keyed by a category slug.
    categorySlug?: string;

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
        // A separate destination-wedding package rate — kept as free-text
        // (matches how reference marketplace data itself stores it, e.g.
        // "65.00 Lakhs" / "/day for 125 rooms") rather than forcing it into
        // a strict number, since it's usually a package description, not a
        // clean unit price.
        destinationPrice?: string;
        destinationPriceUnit?: string;
        // Per-occasion/per-service starting prices, e.g. reference data:
        // a decorator quoting a separate starting package for "Home
        // function decor" distinct from their general starting_price.
        // Generic across categories (a photographer might similarly quote
        // separate packages per function) — not specific to decorators.
        packages?: {
            label: string;
            startingPrice: number;
        }[];
    };

    // Venue-specific details — present only for vendors in a venue-like
    // category (banquet halls, resorts, hotels...), harmless/empty for any
    // other category. Kept minimal per the same "basic details" scope as
    // the rest of this schema — no attempt to model every possible
    // per-space/per-hall breakdown a large resort might have.
    venueDetails?: {
        guestCapacityMin?: number;
        guestCapacityMax?: number;
        // e.g. ["4 Star & Above Hotels", "Banquet Halls", "Resorts"]
        venueTypes?: string[];
        vegPricePerPlate?: number;
        nonVegPricePerPlate?: number;
        rentalPrice?: number;
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