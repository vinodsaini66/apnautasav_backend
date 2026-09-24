import mongoose, { Document, Schema } from 'mongoose';
import { BOOKING_SLOTS, BookingSlot, QUOTE_STATUSES, QuoteStatus } from '../../constants/vendorOs';

export interface IQuoteItem {
  _id?: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  qty: number;
  unit?: string;
  rate: number;
  taxPercent: number;
  amount: number;
  packageId?: mongoose.Types.ObjectId;
}

export interface IScheduleProposal {
  label: string;
  percent?: number;
  amount: number;
  dueDate?: Date;
}

export interface IQuoteEvent {
  functionType: string;
  date: Date;
  slot: BookingSlot;
  venue?: string;
  guestCount?: number;
}

export interface IQuoteSnapshot {
  version: number;
  title?: string;
  items: IQuoteItem[];
  subtotal: number;
  discountAmount: number;
  taxTotal: number;
  total: number;
  validTill?: Date;
  terms?: string;
  deliverables: string[];
  paymentSchedule: IScheduleProposal[];
  events: IQuoteEvent[];
  status: QuoteStatus;
  revisedAt: Date;
}

export interface IVendorQuote extends Document {
  vendorId: mongoose.Types.ObjectId;
  leadId?: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  familyUserId?: mongoose.Types.ObjectId;
  bookingId?: mongoose.Types.ObjectId;
  quoteNumber: string;
  title?: string;
  version: number;
  status: QuoteStatus;
  items: IQuoteItem[];
  discount: { type: 'flat' | 'percent'; value: number };
  gstEnabled: boolean;
  subtotal: number;
  discountAmount: number;
  taxTotal: number;
  total: number;
  validTill?: Date;
  terms?: string;
  deliverables: string[];
  notes?: string;
  paymentSchedule: IScheduleProposal[];
  events: IQuoteEvent[];
  publicToken: string;
  sentAt?: Date;
  viewedAt?: Date;
  viewCount: number;
  acceptedAt?: Date;
  declinedAt?: Date;
  declineReason?: string;
  history: IQuoteSnapshot[];
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const quoteItemSchema = new Schema<IQuoteItem>({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  qty: { type: Number, default: 1, min: 0 },
  unit: { type: String, trim: true },
  rate: { type: Number, default: 0, min: 0 },
  taxPercent: { type: Number, default: 0, min: 0, max: 28 },
  amount: { type: Number, default: 0 },
  packageId: { type: Schema.Types.ObjectId, ref: 'VendorPackage' },
});

const scheduleSchema = new Schema<IScheduleProposal>(
  {
    label: { type: String, required: true, trim: true },
    percent: Number,
    amount: { type: Number, required: true, min: 0 },
    dueDate: Date,
  },
  { _id: false }
);

const quoteEventSchema = new Schema<IQuoteEvent>(
  {
    functionType: { type: String, required: true },
    date: { type: Date, required: true },
    slot: { type: String, enum: BOOKING_SLOTS, default: 'full_day' },
    venue: String,
    guestCount: Number,
  },
  { _id: false }
);

const vendorQuoteSchema = new Schema<IVendorQuote>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: 'WeddingVendor', required: true },
    leadId: { type: Schema.Types.ObjectId, ref: 'VendorLead', index: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'VendorClient', required: true },
    familyUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'VendorBooking' },
    quoteNumber: { type: String, required: true },
    title: { type: String, trim: true, maxlength: 200 },
    version: { type: Number, default: 1 },
    status: { type: String, enum: QUOTE_STATUSES, default: 'draft' },
    items: { type: [quoteItemSchema], default: [] },
    discount: {
      type: { type: String, enum: ['flat', 'percent'], default: 'flat' },
      value: { type: Number, default: 0, min: 0 },
    },
    gstEnabled: { type: Boolean, default: false },
    subtotal: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxTotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    validTill: Date,
    terms: { type: String, trim: true, maxlength: 5000 },
    deliverables: { type: [String], default: [] },
    notes: { type: String, trim: true, maxlength: 2000 },
    paymentSchedule: { type: [scheduleSchema], default: [] },
    events: { type: [quoteEventSchema], default: [] },
    publicToken: { type: String, required: true, unique: true },
    sentAt: Date,
    viewedAt: Date,
    viewCount: { type: Number, default: 0 },
    acceptedAt: Date,
    declinedAt: Date,
    declineReason: { type: String, trim: true, maxlength: 500 },
    // Immutable snapshots of earlier versions — stored as-is, never queried.
    history: { type: Schema.Types.Mixed, default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'VendorUser' },
  },
  { timestamps: true }
);

vendorQuoteSchema.index({ vendorId: 1, status: 1, createdAt: -1 });
vendorQuoteSchema.index({ vendorId: 1, quoteNumber: 1 }, { unique: true });

export const VendorQuote = mongoose.model<IVendorQuote>('VendorQuote', vendorQuoteSchema);
