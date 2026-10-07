import mongoose, { Document, Schema } from 'mongoose';
import { VENDOR_CATEGORIES, VendorCategory } from '../vendor.model';

// A planning agency's own list of vendors it trusts and reuses across client
// weddings (Track C) — the THIRD vendor concept, distinct from:
//   - WeddingVendor: the public marketplace listing;
//   - Vendor: one wedding's private tracker row.
// "Push to wedding" copies roster entries into a wedding's Vendor tracker;
// the copy is then independent (prices and notes there are per wedding).
// Notes and rating here are the agency's private memory of the vendor and
// are never copied to a wedding.
export interface IOrgVendorRoster extends Document {
  organizationId: mongoose.Types.ObjectId;
  name: string;
  category: VendorCategory;
  contactPerson?: string;
  phone: string;
  email?: string;
  city?: string;
  website?: string;
  priceRange?: { min?: number; max?: number };
  notes?: string;
  tags: string[];
  rating?: number;
  linkedWeddingVendorId?: mongoose.Types.ObjectId | null;
  isArchived: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const orgVendorRosterSchema = new Schema<IOrgVendorRoster>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    category: { type: String, enum: VENDOR_CATEGORIES, required: true },
    contactPerson: { type: String, trim: true, maxlength: 100 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },
    city: { type: String, trim: true, maxlength: 100 },
    website: { type: String, trim: true, maxlength: 300 },
    priceRange: {
      _id: false,
      min: { type: Number, min: 0 },
      max: { type: Number, min: 0 },
    },
    notes: { type: String, trim: true, maxlength: 2000 },
    tags: { type: [String], default: [] },
    rating: { type: Number, min: 1, max: 5 },
    linkedWeddingVendorId: { type: Schema.Types.ObjectId, ref: 'WeddingVendor', default: null },
    isArchived: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

orgVendorRosterSchema.index({ organizationId: 1, category: 1, isArchived: 1 });
orgVendorRosterSchema.index({ organizationId: 1, phone: 1 });

export const OrgVendorRoster = mongoose.model<IOrgVendorRoster>('OrgVendorRoster', orgVendorRosterSchema);
