import mongoose, { Document, Schema } from 'mongoose';

// Reusable quote starting point. vendorId === null → system template seeded
// from a CategoryConfig's defaults (read-only to vendors; "Save as my
// template" copies it).
export interface IQuoteTemplate extends Document {
  vendorId?: mongoose.Types.ObjectId | null;
  categoryKey?: string;
  name: string;
  title?: string;
  items: { name: string; description?: string; qty: number; unit?: string; rate: number; taxPercent: number; packageId?: mongoose.Types.ObjectId }[];
  gstEnabled: boolean;
  validityDays: number;
  terms?: string;
  deliverables: string[];
  // Proposed schedule as percentages of the total, e.g. 30/50/20.
  paymentSchedule: { label: string; percent: number; dueOffsetDays?: number }[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const quoteTemplateSchema = new Schema<IQuoteTemplate>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: 'WeddingVendor', default: null, index: true },
    categoryKey: { type: String, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    title: { type: String, trim: true },
    items: {
      type: [
        {
          _id: false,
          name: { type: String, required: true },
          description: String,
          qty: { type: Number, default: 1 },
          unit: String,
          rate: { type: Number, default: 0 },
          taxPercent: { type: Number, default: 0 },
          packageId: { type: Schema.Types.ObjectId, ref: 'VendorPackage' },
        },
      ],
      default: [],
    },
    gstEnabled: { type: Boolean, default: false },
    validityDays: { type: Number, default: 15, min: 1 },
    terms: String,
    deliverables: { type: [String], default: [] },
    paymentSchedule: {
      type: [{ _id: false, label: String, percent: Number, dueOffsetDays: Number }],
      default: [],
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const QuoteTemplate = mongoose.model<IQuoteTemplate>('QuoteTemplate', quoteTemplateSchema);
