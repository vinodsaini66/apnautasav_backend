import mongoose, { Document, Schema } from 'mongoose';
import { ATOMIC_SLOTS, AtomicSlot } from '../../constants/vendorOs';

// One resource occupied for one half-day. This collection IS the conflict
// engine: the partial unique index below makes it impossible, at the
// database level, for two hard blocks to land on the same exclusive
// resource/date/slot — even if two staff confirm bookings at the same
// instant. Capacity (non-exclusive) resources are checked in
// services/vendor-os/calendar.service.ts by summing `units`.
export interface IResourceBlock extends Document {
  vendorId: mongoose.Types.ObjectId;
  resourceId: mongoose.Types.ObjectId;
  date: Date;
  slot: AtomicSlot;
  units: number;
  exclusive: boolean;
  // Soft = warn but don't block (setup day, travel buffer).
  soft: boolean;
  kind: 'booking' | 'manual';
  bookingId?: mongoose.Types.ObjectId;
  bookingEventId?: mongoose.Types.ObjectId;
  manualReason?: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const resourceBlockSchema = new Schema<IResourceBlock>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: 'WeddingVendor', required: true },
    resourceId: { type: Schema.Types.ObjectId, ref: 'VendorResource', required: true },
    date: { type: Date, required: true },
    slot: { type: String, enum: ATOMIC_SLOTS, required: true },
    units: { type: Number, default: 1, min: 1 },
    exclusive: { type: Boolean, default: true },
    soft: { type: Boolean, default: false },
    kind: { type: String, enum: ['booking', 'manual'], required: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'VendorBooking', index: true },
    bookingEventId: { type: Schema.Types.ObjectId },
    manualReason: { type: String, trim: true, maxlength: 200 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'VendorUser' },
  },
  { timestamps: true }
);

resourceBlockSchema.index(
  { resourceId: 1, date: 1, slot: 1 },
  { unique: true, partialFilterExpression: { exclusive: true, soft: false }, name: 'no_double_booking' }
);
resourceBlockSchema.index({ vendorId: 1, date: 1 });

export const ResourceBlock = mongoose.model<IResourceBlock>('ResourceBlock', resourceBlockSchema);
