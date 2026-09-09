import mongoose, { Document, Schema } from 'mongoose';

export interface IVendorDocument {
  url: string;
  fileName: string;
  documentType: 'contract' | 'invoice' | 'other';
  uploadedBy: mongoose.Types.ObjectId;
  uploadedAt: Date;
}

// The wedding-scoped vendor tracker's category list — a family's own
// shortlist of vendor *types*, not the public marketplace's taxonomy
// (VendorCategory/VendorCategoryMapping, a separate 2-level system — see
// CLAUDE.md). Single source of truth: imported by validators/vendor.validator.ts
// so the Mongoose-level enum and the request-validation enum can never drift
// apart, and by utils/vendorCategoryMapping.ts (which maps a marketplace
// listing's category name to the closest value here for the "Add to My
// Wedding" bridge).
export const VENDOR_CATEGORIES = [
  'photographer',
  'videographer',
  'caterer',
  'decorator',
  'dj',
  'band',
  'makeup-artist',
  'mehendi-artist',
  'florist',
  'choreographer',
  'invitation',
  'transport',
  'security',
  'hospitality',
  'light-sound',
  'furniture',
  'tent',
  'artist',
  'priest-pandit'
] as const;

export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];

export interface IVendor extends Document {
  weddingId: mongoose.Types.ObjectId;
  vendorName: string;
  category: VendorCategory;
  contactPerson?: string;
  email?: string;
  phoneNumber: string;
  website?: string;
  estimatedCost: number;
  actualCost?: number;
  bookingStatus: 'inquiry' | 'negotiating' | 'booked' | 'confirmed' | 'cancelled';
  notes?: string;
  contracts: IVendorDocument[];
  paymentTerms?: string;
  addedBy: mongoose.Types.ObjectId;
  // Denormalized average of VendorReview docs for this vendor, kept in sync
  // by services/vendor-review.service.ts#recalculateVendorRating — not
  // written to directly anywhere else.
  rating?: number;
  reviewCount?: number;
  // Set when this vendor was added via addFromMarketplace, linking it back
  // to the public WeddingVendor listing it was booked from. Verified
  // reviews on vendors sharing this id roll up into that listing's rating.
  marketplaceVendorId?: mongoose.Types.ObjectId;
  // Which functions this vendor serves (a photographer often shoots
  // several). Empty means "serves the whole wedding" (a planner, an emcee),
  // not "unassigned".
  eventIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const vendorDocumentSchema = new Schema<IVendorDocument>({
  url: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  documentType: {
    type: String,
    enum: ['contract', 'invoice', 'other'],
    default: 'other'
  },
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const vendorSchema = new Schema<IVendor>({
  weddingId: {
    type: Schema.Types.ObjectId,
    ref: 'Wedding',
    required: true
  },
  vendorName: {
    type: String,
    required: [true, 'Vendor name is required'],
    trim: true
  },
  category: {
    type: String,
    enum: VENDOR_CATEGORIES,
    required: true
  },
  contactPerson: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  website: {
    type: String,
    trim: true
  },
  estimatedCost: {
    type: Number,
  },
  actualCost: {
    type: Number,
    min: [0, 'Cost cannot be negative']
  },
  bookingStatus: {
    type: String,
    enum: ['inquiry', 'negotiating', 'booked', 'confirmed', 'cancelled'],
    default: 'inquiry'
  },
  notes: {
    type: String
  },
  contracts: {
    type: [vendorDocumentSchema],
    default: []
  },
  paymentTerms: {
    type: String
  },
  addedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rating: {
    type: Number,
    min: 0,
    max: 5
  },
  reviewCount: {
    type: Number,
    default: 0
  },
  marketplaceVendorId: {
    type: Schema.Types.ObjectId,
    ref: 'WeddingVendor'
  },
  eventIds: [{
    type: Schema.Types.ObjectId,
    ref: 'Event',
    default: []
  }]
}, {
  timestamps: true
});

// Indexes
vendorSchema.index({ weddingId: 1 });
vendorSchema.index({ category: 1 });
vendorSchema.index({ bookingStatus: 1 });
vendorSchema.index({ eventIds: 1 });
vendorSchema.index({ marketplaceVendorId: 1 });

export const Vendor = mongoose.model<IVendor>('Vendor', vendorSchema);
