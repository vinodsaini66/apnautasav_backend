import mongoose, { Document, Schema } from 'mongoose';

// A wedding vendor's "Partner With Us" enquiry from the public landing
// page. Submitted by prospective vendors (caterers, photographers, etc.) —
// NOT by app users, so this is deliberately unauthenticated on the create
// side (see vendor-enquiry.routes.ts).
export interface IVendorEnquiry extends Document {
  name: string;
  businessName: string;
  email: string;
  phoneNumber: string;
  categoryId: mongoose.Types.ObjectId;
  categoryName: string; // snapshot of the category's name at submission time, so a later category rename/removal doesn't orphan the label on old enquiries
  city?: string;
  message: string;
  status: 'new' | 'contacted' | 'closed';
  source: string;
  acknowledgementEmailStatus: 'not_sent' | 'sent' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

const vendorEnquirySchema = new Schema<IVendorEnquiry>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 100,
    },
    businessName: {
      type: String,
      required: [true, 'Business name is required'],
      trim: true,
      maxlength: 150,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'VendorCategory',
      required: true,
    },
    categoryName: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ['new', 'contacted', 'closed'],
      default: 'new',
      index: true,
    },
    source: {
      type: String,
      default: 'landing_page',
    },
    acknowledgementEmailStatus: {
      type: String,
      enum: ['not_sent', 'sent', 'failed'],
      default: 'not_sent',
    },
  },
  {
    timestamps: true,
  }
);

vendorEnquirySchema.index({ createdAt: -1 });

export const VendorEnquiry = mongoose.model<IVendorEnquiry>('VendorEnquiry', vendorEnquirySchema);
