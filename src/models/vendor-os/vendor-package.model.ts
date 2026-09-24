import mongoose, { Document, Schema } from 'mongoose';
import { PRICING_BASES, PricingBasis } from '../../constants/vendorOs';

// A vendor's package or à-la-carte add-on. The same records feed the public
// profile (synced into WeddingVendor.pricing — see package.service.ts) and
// the quote builder, so the vendor maintains pricing in exactly one place.
export interface IVendorPackage extends Document {
  vendorId: mongoose.Types.ObjectId;
  kind: 'package' | 'addon';
  name: string;
  description?: string;
  includes: string[];
  excludes: string[];
  price: number;
  pricingBasis: PricingBasis;
  unit?: string;
  duration?: string;
  taxPercent?: number;
  // "Most Booked" — highlighted first on the profile.
  isPopular: boolean;
  // Add-ons (kind 'addon' packages of the same vendor) offered with this package.
  addonIds: mongoose.Types.ObjectId[];
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const vendorPackageSchema = new Schema<IVendorPackage>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: 'WeddingVendor', required: true, index: true },
    kind: { type: String, enum: ['package', 'addon'], default: 'package' },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000 },
    includes: { type: [String], default: [] },
    excludes: { type: [String], default: [] },
    price: { type: Number, required: true, min: 0 },
    pricingBasis: { type: String, enum: PRICING_BASES, required: true },
    unit: { type: String, trim: true },
    duration: { type: String, trim: true },
    taxPercent: { type: Number, min: 0, max: 28 },
    isPopular: { type: Boolean, default: false },
    addonIds: { type: [Schema.Types.ObjectId], ref: 'VendorPackage', default: [] },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

vendorPackageSchema.index({ vendorId: 1, kind: 1, isActive: 1 });

export const VendorPackage = mongoose.model<IVendorPackage>('VendorPackage', vendorPackageSchema);
