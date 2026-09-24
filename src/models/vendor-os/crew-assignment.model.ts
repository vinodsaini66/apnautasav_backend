import mongoose, { Document, Schema } from 'mongoose';
import { ATOMIC_SLOTS, AtomicSlot } from '../../constants/vendorOs';

// A crew member's occupancy for one day: either assigned to a booking
// event (`kind: 'event'`) or marked unavailable (`kind: 'unavailable'`).
//
// The multikey unique index on (crewMemberId, date, slots) — partial on
// `active: true` — means the same person can never be active in two places
// in the same half-day, enforced by MongoDB even under concurrent
// assignment. Declining/cancelling flips `active` to false, freeing the slot.
export type CrewAssignmentStatus = 'assigned' | 'confirmed' | 'declined' | 'cancelled' | 'needs_reassign';

export interface ICrewAssignment extends Document {
  vendorId: mongoose.Types.ObjectId;
  crewMemberId: mongoose.Types.ObjectId;
  kind: 'event' | 'unavailable';
  bookingId?: mongoose.Types.ObjectId;
  bookingEventId?: mongoose.Types.ObjectId;
  date: Date;
  slots: AtomicSlot[];
  active: boolean;
  status: CrewAssignmentStatus;
  role?: string;
  callTime?: string;
  reportingLocation?: string;
  fee?: number;
  payoutStatus: 'unpaid' | 'paid';
  paidAt?: Date;
  payoutMode?: string;
  payoutReference?: string;
  notifiedAt?: Date;
  respondedAt?: Date;
  declineReason?: string;
  reason?: string;
  notes?: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const crewAssignmentSchema = new Schema<ICrewAssignment>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: 'WeddingVendor', required: true },
    crewMemberId: { type: Schema.Types.ObjectId, ref: 'CrewMember', required: true },
    kind: { type: String, enum: ['event', 'unavailable'], required: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'VendorBooking', index: true },
    bookingEventId: { type: Schema.Types.ObjectId, index: true },
    date: { type: Date, required: true },
    slots: { type: [{ type: String, enum: ATOMIC_SLOTS }], required: true },
    active: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ['assigned', 'confirmed', 'declined', 'cancelled', 'needs_reassign'],
      default: 'assigned',
    },
    role: { type: String, trim: true, maxlength: 80 },
    callTime: { type: String, trim: true, maxlength: 10 },
    reportingLocation: { type: String, trim: true, maxlength: 300 },
    fee: { type: Number, min: 0 },
    payoutStatus: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' },
    paidAt: Date,
    payoutMode: { type: String, trim: true },
    payoutReference: { type: String, trim: true, maxlength: 200 },
    notifiedAt: Date,
    respondedAt: Date,
    declineReason: { type: String, trim: true, maxlength: 500 },
    reason: { type: String, trim: true, maxlength: 200 },
    notes: { type: String, trim: true, maxlength: 1000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'VendorUser' },
  },
  { timestamps: true }
);

crewAssignmentSchema.index(
  { crewMemberId: 1, date: 1, slots: 1 },
  { unique: true, partialFilterExpression: { active: true }, name: 'crew_no_double_booking' }
);
crewAssignmentSchema.index({ vendorId: 1, date: 1 });

export const CrewAssignment = mongoose.model<ICrewAssignment>('CrewAssignment', crewAssignmentSchema);
