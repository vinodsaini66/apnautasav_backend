import mongoose, { Document, Schema } from 'mongoose';
import { RESOURCE_TYPES, ResourceType } from '../../constants/vendorOs';

// The thing that actually gets double-booked (spec section 5): a hall, a
// crew, an artist, a vehicle, kitchen capacity. capacity === 1 means
// exclusive (one booking per slot, enforced by a DB unique index on
// ResourceBlock); capacity > 1 means units are summed per slot (a caterer's
// 800 pax/day, a fleet of 3 identical vintage cars).
export interface IVendorResource extends Document {
  vendorId: mongoose.Types.ObjectId;
  type: ResourceType;
  name: string;
  description?: string;
  capacity: number;
  // Crew member who sees this resource's assignments (role 'crew').
  memberId?: mongoose.Types.ObjectId;
  color?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const vendorResourceSchema = new Schema<IVendorResource>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: 'WeddingVendor', required: true, index: true },
    type: { type: String, enum: RESOURCE_TYPES, required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500 },
    capacity: { type: Number, default: 1, min: 1 },
    memberId: { type: Schema.Types.ObjectId, ref: 'VendorUser' },
    color: String,
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const VendorResource = mongoose.model<IVendorResource>('VendorResource', vendorResourceSchema);
