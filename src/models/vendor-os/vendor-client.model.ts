import mongoose, { Document, Schema } from 'mongoose';

// The vendor's client directory (families). One row per phone per vendor —
// leads and bookings for the same family attach to the same client.
export interface IVendorClient extends Document {
  vendorId: mongoose.Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  city?: string;
  notes?: string;
  tags: string[];
  familyUserId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const vendorClientSchema = new Schema<IVendorClient>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: 'WeddingVendor', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    city: { type: String, trim: true },
    notes: { type: String, trim: true, maxlength: 2000 },
    tags: { type: [String], default: [] },
    familyUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

vendorClientSchema.index({ vendorId: 1, phone: 1 }, { unique: true });
vendorClientSchema.index({ vendorId: 1, name: 1 });

export const VendorClient = mongoose.model<IVendorClient>('VendorClient', vendorClientSchema);
