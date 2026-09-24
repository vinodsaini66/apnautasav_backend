import mongoose, { Document, Schema } from 'mongoose';
import { PRICING_BASES, PricingBasis, RESOURCE_TYPES, ResourceType } from '../../constants/vendorOs';

// Per-category configuration for Vendor OS (spec section 5): which extra
// profile fields a category has, how it prices, what actually gets
// double-booked, and the quote/FAQ defaults. Configured, not hard-coded —
// adding "Pandit & rituals" later is a new document, not a code change.
// Seeded by services/vendor-os/category-config.service.ts#ensureDefaults.

export interface IProfileField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'multiselect' | 'tags';
  options?: string[];
  required?: boolean;
  group?: string;
  unit?: string;
}

export interface IDefaultQuoteItem {
  name: string;
  unit?: string;
  rate?: number;
  qty?: number;
  taxPercent?: number;
}

export interface ICategoryConfig extends Document {
  key: string;
  name: string;
  icon?: string;
  description?: string;
  pricingBasis: PricingBasis;
  resourceType: ResourceType;
  defaultResourceName: string;
  defaultResourceCapacity: number;
  // Setup/teardown days soft-blocked around each event (decor).
  softBlockDayBefore: boolean;
  marketplaceCategorySlug?: string;
  subTagOptions: string[];
  profileSchema: IProfileField[];
  defaultQuoteItems: IDefaultQuoteItem[];
  defaultDeliverables: string[];
  defaultTerms?: string;
  defaultFaqs: string[];
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const profileFieldSchema = new Schema<IProfileField>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: {
      type: String,
      enum: ['text', 'textarea', 'number', 'boolean', 'select', 'multiselect', 'tags'],
      required: true,
    },
    options: [String],
    required: Boolean,
    group: String,
    unit: String,
  },
  { _id: false }
);

const categoryConfigSchema = new Schema<ICategoryConfig>(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    icon: String,
    description: String,
    pricingBasis: { type: String, enum: PRICING_BASES, required: true },
    resourceType: { type: String, enum: RESOURCE_TYPES, required: true },
    defaultResourceName: { type: String, default: 'Main team' },
    defaultResourceCapacity: { type: Number, default: 1, min: 1 },
    softBlockDayBefore: { type: Boolean, default: false },
    marketplaceCategorySlug: String,
    subTagOptions: { type: [String], default: [] },
    profileSchema: { type: [profileFieldSchema], default: [] },
    defaultQuoteItems: {
      type: [{ _id: false, name: String, unit: String, rate: Number, qty: Number, taxPercent: Number }],
      default: [],
    },
    defaultDeliverables: { type: [String], default: [] },
    defaultTerms: String,
    defaultFaqs: { type: [String], default: [] },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const CategoryConfig = mongoose.model<ICategoryConfig>('CategoryConfig', categoryConfigSchema);
