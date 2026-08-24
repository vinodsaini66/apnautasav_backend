import mongoose, { Document, Schema } from 'mongoose';
import { IPlanLimits, PlanType, BillingPeriod } from './plan.model';

// One row per completed purchase — covers both a one-time wedding-scoped
// plan and an account-level subscription (named `Purchase`, not
// `Subscription`, since it has to represent both).
//
// Everything the buyer is entitled to is *snapshotted* here at purchase
// time (limitsSnapshot, budgetEnabledSnapshot, amount, ...) so a later admin
// edit to the live `Plan` document (price change, limit tweak) never
// retroactively changes what someone already bought.
export interface IPurchase extends Document {
  userId: mongoose.Types.ObjectId;
  planId: mongoose.Types.ObjectId;
  planKey: string;
  planType: PlanType;
  weddingId?: mongoose.Types.ObjectId | null; // set only for 'one_time'; null = account-level subscription
  limitsSnapshot: IPlanLimits;
  budgetEnabledSnapshot: boolean;
  maxWeddingsSnapshot: number | null;
  billingPeriodSnapshot?: BillingPeriod | null;
  amount: number;
  currency: string;
  status: 'active' | 'expired' | 'cancelled';
  paymentStatus: 'pending' | 'success' | 'failed';
  paymentProvider: string; // 'mock' today — the only thing that changes once a real gateway is wired in
  paymentReference: string;
  startDate: Date;
  endDate?: Date | null; // null = never expires (one_time plans, or an "unlimited" subscription tier)
  createdAt: Date;
  updatedAt: Date;
}

const purchaseLimitsSchema = new Schema<IPlanLimits>(
  {
    guests: { type: Number, required: true },
    tasks: { type: Number, required: true },
    vendors: { type: Number, required: true },
    collaborators: { type: Number, required: true },
  },
  { _id: false }
);

const purchaseSchema = new Schema<IPurchase>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: 'Plan',
      required: true,
    },
    planKey: {
      type: String,
      required: true,
    },
    planType: {
      type: String,
      enum: ['one_time', 'subscription'],
      required: true,
    },
    weddingId: {
      type: Schema.Types.ObjectId,
      ref: 'Wedding',
      default: null,
    },
    limitsSnapshot: {
      type: purchaseLimitsSchema,
      required: true,
    },
    budgetEnabledSnapshot: {
      type: Boolean,
      required: true,
    },
    maxWeddingsSnapshot: {
      type: Number,
      default: null,
    },
    billingPeriodSnapshot: {
      type: String,
      enum: ['monthly', 'annual', null],
      default: null,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled'],
      default: 'active',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'success', 'failed'],
      default: 'pending',
    },
    paymentProvider: {
      type: String,
      default: 'mock',
    },
    paymentReference: {
      type: String,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

purchaseSchema.index({ userId: 1, planType: 1, status: 1 });
purchaseSchema.index({ weddingId: 1, planType: 1, status: 1 });
purchaseSchema.index({ userId: 1, createdAt: -1 });

export const Purchase = mongoose.model<IPurchase>('Purchase', purchaseSchema);
