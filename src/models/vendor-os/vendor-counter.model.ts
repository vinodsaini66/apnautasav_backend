import mongoose, { Schema } from 'mongoose';

// Atomic per-vendor number series (quotes Q-0001, bookings B-0001, receipts
// R-0001). key = `${vendorId}:${series}`.
const vendorCounterSchema = new Schema({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});

export const VendorCounter = mongoose.model('VendorCounter', vendorCounterSchema);

export const nextVendorSequence = async (
  vendorId: mongoose.Types.ObjectId | string,
  series: 'quote' | 'booking' | 'receipt',
  prefix: string
): Promise<string> => {
  const counter = await VendorCounter.findOneAndUpdate(
    { key: `${vendorId}:${series}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  ).lean<{ seq: number }>();
  return `${prefix}-${String(counter!.seq).padStart(4, '0')}`;
};
