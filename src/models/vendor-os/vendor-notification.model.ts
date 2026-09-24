import mongoose, { Document, Schema } from 'mongoose';

// In-panel notifications for vendor users (the family-side Notification
// model refs User and is wedding-scoped, so it can't be reused here).
// vendorUserId unset → visible to every owner/manager of the vendor.
export interface IVendorNotification extends Document {
  vendorId: mongoose.Types.ObjectId;
  vendorUserId?: mongoose.Types.ObjectId;
  type: string;
  title: string;
  body?: string;
  entityType?: 'lead' | 'quote' | 'booking' | 'payment' | 'profile' | 'crew_assignment';
  entityId?: mongoose.Types.ObjectId;
  readBy: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const vendorNotificationSchema = new Schema<IVendorNotification>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: 'WeddingVendor', required: true },
    vendorUserId: { type: Schema.Types.ObjectId, ref: 'VendorUser' },
    type: { type: String, required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, maxlength: 1000 },
    entityType: { type: String, enum: ['lead', 'quote', 'booking', 'payment', 'profile', 'crew_assignment'] },
    entityId: Schema.Types.ObjectId,
    readBy: { type: [Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true }
);

vendorNotificationSchema.index({ vendorId: 1, createdAt: -1 });

export const VendorNotification = mongoose.model<IVendorNotification>('VendorNotification', vendorNotificationSchema);
