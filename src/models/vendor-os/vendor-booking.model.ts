import mongoose, { Document, Schema } from 'mongoose';
import { BOOKING_SLOTS, BOOKING_STATUSES, BookingSlot, BookingStatus } from '../../constants/vendorOs';

// One wedding = one booking with several events (mehendi 12 Nov, sangeet
// 13 Nov, pheras 14 Nov), each with its own resource allocation. The
// calendar occupancy itself lives in ResourceBlock, rebuilt from `events`
// by services/vendor-os/calendar.service.ts whenever they change.

export interface IResourceAllocation {
  resourceId: mongoose.Types.ObjectId;
  units: number;
}

export interface IBookingEvent {
  _id: mongoose.Types.ObjectId;
  functionType: string;
  date: Date;
  slot: BookingSlot;
  startTime?: string;
  endTime?: string;
  venue?: string;
  city?: string;
  guestCount?: number;
  notes?: string;
  resourceAllocations: IResourceAllocation[];
}

export interface IPaymentMilestone {
  _id: mongoose.Types.ObjectId;
  label: string;
  amount: number;
  dueDate?: Date;
  paidAmount: number;
  status: 'pending' | 'partially_paid' | 'paid';
  lastReminderAt?: Date;
  // Which automatic reminder stages (-3 / 0 / +3 days) already fired.
  autoReminderStages: number[];
}

export interface IVendorBooking extends Document {
  vendorId: mongoose.Types.ObjectId;
  bookingNumber: string;
  leadId?: mongoose.Types.ObjectId;
  quoteId?: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  client: { name: string; phone: string; email?: string };
  familyUserId?: mongoose.Types.ObjectId;
  weddingId?: mongoose.Types.ObjectId;
  familyBudgetId?: mongoose.Types.ObjectId;
  title?: string;
  status: BookingStatus;
  holdExpiresAt?: Date;
  events: IBookingEvent[];
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  paymentSchedule: IPaymentMilestone[];
  autoReminders: boolean;
  notes?: string;
  cancelReason?: string;
  cancelledAt?: Date;
  confirmedAt?: Date;
  completedAt?: Date;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const allocationSchema = new Schema<IResourceAllocation>(
  {
    resourceId: { type: Schema.Types.ObjectId, ref: 'VendorResource', required: true },
    units: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

const bookingEventSchema = new Schema<IBookingEvent>({
  functionType: { type: String, required: true, trim: true },
  date: { type: Date, required: true },
  slot: { type: String, enum: BOOKING_SLOTS, default: 'full_day' },
  startTime: String,
  endTime: String,
  venue: { type: String, trim: true },
  city: { type: String, trim: true },
  guestCount: Number,
  notes: { type: String, trim: true, maxlength: 1000 },
  resourceAllocations: { type: [allocationSchema], default: [] },
});

const milestoneSchema = new Schema<IPaymentMilestone>({
  label: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
  dueDate: Date,
  paidAmount: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'partially_paid', 'paid'], default: 'pending' },
  lastReminderAt: Date,
  autoReminderStages: { type: [Number], default: [] },
});

const vendorBookingSchema = new Schema<IVendorBooking>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: 'WeddingVendor', required: true },
    bookingNumber: { type: String, required: true },
    leadId: { type: Schema.Types.ObjectId, ref: 'VendorLead' },
    quoteId: { type: Schema.Types.ObjectId, ref: 'VendorQuote' },
    clientId: { type: Schema.Types.ObjectId, ref: 'VendorClient', required: true, index: true },
    client: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      email: String,
    },
    familyUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    weddingId: { type: Schema.Types.ObjectId, ref: 'Wedding' },
    familyBudgetId: { type: Schema.Types.ObjectId, ref: 'Budget' },
    title: { type: String, trim: true, maxlength: 200 },
    status: { type: String, enum: BOOKING_STATUSES, default: 'tentative' },
    holdExpiresAt: Date,
    events: { type: [bookingEventSchema], default: [] },
    totalAmount: { type: Number, default: 0, min: 0 },
    amountPaid: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    paymentSchedule: { type: [milestoneSchema], default: [] },
    autoReminders: { type: Boolean, default: false },
    notes: { type: String, trim: true, maxlength: 5000 },
    cancelReason: { type: String, trim: true, maxlength: 500 },
    cancelledAt: Date,
    confirmedAt: Date,
    completedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'VendorUser' },
  },
  { timestamps: true }
);

vendorBookingSchema.index({ vendorId: 1, status: 1 });
vendorBookingSchema.index({ vendorId: 1, 'events.date': 1 });
vendorBookingSchema.index({ vendorId: 1, bookingNumber: 1 }, { unique: true });
vendorBookingSchema.index({ status: 1, holdExpiresAt: 1 });

export const VendorBooking = mongoose.model<IVendorBooking>('VendorBooking', vendorBookingSchema);
