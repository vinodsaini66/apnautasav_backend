import mongoose, { Document, Schema } from 'mongoose';
import { PAYMENT_MODES } from '../../constants/vendorOs';

// A payment received against a booking (cash/UPI/bank/cheque logged by the
// vendor — online collection is Phase 2). Voided rather than deleted so
// receipt numbers never have gaps.
export interface IVendorPayment extends Document {
  vendorId: mongoose.Types.ObjectId;
  bookingId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  milestoneId?: mongoose.Types.ObjectId;
  amount: number;
  mode: (typeof PAYMENT_MODES)[number];
  reference?: string;
  proofUrl?: string;
  receivedAt: Date;
  receiptNo: string;
  publicToken: string;
  notes?: string;
  isVoided: boolean;
  voidReason?: string;
  recordedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const vendorPaymentSchema = new Schema<IVendorPayment>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: 'WeddingVendor', required: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'VendorBooking', required: true, index: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'VendorClient', required: true },
    milestoneId: { type: Schema.Types.ObjectId },
    amount: { type: Number, required: true, min: 1 },
    mode: { type: String, enum: PAYMENT_MODES, required: true },
    reference: { type: String, trim: true, maxlength: 200 },
    proofUrl: String,
    receivedAt: { type: Date, default: Date.now },
    receiptNo: { type: String, required: true },
    publicToken: { type: String, required: true, unique: true },
    notes: { type: String, trim: true, maxlength: 1000 },
    isVoided: { type: Boolean, default: false },
    voidReason: { type: String, trim: true, maxlength: 500 },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'VendorUser' },
  },
  { timestamps: true }
);

vendorPaymentSchema.index({ vendorId: 1, receivedAt: -1 });
vendorPaymentSchema.index({ vendorId: 1, receiptNo: 1 }, { unique: true });

export const VendorPayment = mongoose.model<IVendorPayment>('VendorPayment', vendorPaymentSchema);
