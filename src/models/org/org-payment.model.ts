import mongoose, { Document, Schema } from 'mongoose';
import { ORG_PLAN_KEYS, OrgPlanKey } from '../../constants/org';

// One manually-confirmed payment for an organization's plan (UPI / bank
// transfer, recorded by an ApnaUtsav admin — PDF Phase 2 "manual billing").
// When an online gateway arrives this is where its receipts land too.
export interface IOrgPayment extends Document {
  organizationId: mongoose.Types.ObjectId;
  planKey: OrgPlanKey;
  billingPeriod: 'monthly' | 'annual';
  amount: number;
  currency: string;
  method: 'upi' | 'bank_transfer' | 'cash' | 'cheque' | 'waived' | 'other';
  reference?: string;
  periodStart: Date;
  periodEnd: Date;
  note?: string;
  recordedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const orgPaymentSchema = new Schema<IOrgPayment>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    planKey: { type: String, enum: ORG_PLAN_KEYS, required: true },
    billingPeriod: { type: String, enum: ['monthly', 'annual'], required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    method: { type: String, enum: ['upi', 'bank_transfer', 'cash', 'cheque', 'waived', 'other'], required: true },
    reference: { type: String, trim: true, maxlength: 100 },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    note: { type: String, trim: true, maxlength: 500 },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const OrgPayment = mongoose.model<IOrgPayment>('OrgPayment', orgPaymentSchema);
