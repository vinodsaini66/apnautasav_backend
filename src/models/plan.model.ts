import mongoose, { Document, Schema } from 'mongoose';

// The admin-editable pricing catalog. Every price/limit/feature-toggle a
// user is ever gated by lives here (not in constants/index.ts) specifically
// so it can be changed without a code deploy — see `key` below.
//
// `-1` is this schema's "unlimited" sentinel for every numeric limit field
// (never `null` — `null < 5` coerces to `true` in JS, a landmine in every
// `current >= limit` comparison). `0` on `limits.collaborators` means
// "collaborators disabled" — there's no separate boolean for that, so the
// limit number is the single source of truth. `budgetEnabled` stays its own
// boolean because Budget has no natural "count" to cap.
export type PlanType = 'free' | 'one_time' | 'subscription';
export type BillingPeriod = 'monthly' | 'annual';

export interface IPlanLimits {
  guests: number;
  tasks: number;
  vendors: number;
  collaborators: number;
}

export interface IPlan extends Document {
  key: string;
  name: string;
  description?: string;
  type: PlanType;
  price: number;
  currency: string;
  billingPeriod?: BillingPeriod | null;
  limits: IPlanLimits;
  budgetEnabled: boolean;
  // AI Assistant chat (Phase 9) — same "on/off for the plan" shape as
  // budgetEnabled (no natural count to cap), defaulting to true so existing
  // seeded plans keep working without a data migration.
  aiAssistantEnabled: boolean;
  maxWeddings: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const planLimitsSchema = new Schema<IPlanLimits>(
  {
    guests: { type: Number, required: true, default: 0 },
    tasks: { type: Number, required: true, default: 0 },
    vendors: { type: Number, required: true, default: 0 },
    collaborators: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const planSchema = new Schema<IPlan>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ['free', 'one_time', 'subscription'],
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'INR',
      enum: ['INR', 'USD', 'EUR', 'GBP'],
    },
    billingPeriod: {
      type: String,
      enum: ['monthly', 'annual', null],
      default: null,
    },
    limits: {
      type: planLimitsSchema,
      required: true,
    },
    budgetEnabled: {
      type: Boolean,
      default: false,
    },
    aiAssistantEnabled: {
      type: Boolean,
      default: true,
    },
    maxWeddings: {
      type: Number,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

planSchema.index({ isActive: 1, sortOrder: 1 });

export const Plan = mongoose.model<IPlan>('Plan', planSchema);
