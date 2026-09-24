import mongoose, { Document, Schema } from 'mongoose';
import { BUDGET_BANDS, LEAD_LOST_REASONS, LEAD_SOURCES, LEAD_STATUSES, LeadSource, LeadStatus } from '../../constants/vendorOs';

export interface IVendorLead extends Document {
  vendorId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  familyUserId?: mongoose.Types.ObjectId;
  weddingId?: mongoose.Types.ObjectId;
  marketplaceInquiryId?: mongoose.Types.ObjectId;
  source: LeadSource;
  contact: { name: string; phone: string; email?: string };
  eventType?: string;
  weddingDates: Date[];
  functions: string[];
  city?: string;
  venue?: string;
  budgetBand?: string;
  budgetAmount?: number;
  guestCount?: number;
  message?: string;
  notes?: string;
  status: LeadStatus;
  lostReason?: string;
  lostNote?: string;
  assignedTo?: mongoose.Types.ObjectId;
  nextFollowUpAt?: Date;
  followUpNote?: string;
  followUpNotifiedAt?: Date;
  lastActivityAt: Date;
  firstRespondedAt?: Date;
  bookingId?: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const vendorLeadSchema = new Schema<IVendorLead>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: 'WeddingVendor', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'VendorClient', required: true, index: true },
    familyUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    weddingId: { type: Schema.Types.ObjectId, ref: 'Wedding' },
    marketplaceInquiryId: { type: Schema.Types.ObjectId, ref: 'VendorInquiry' },
    source: { type: String, enum: LEAD_SOURCES, required: true },
    contact: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      email: { type: String, trim: true, lowercase: true },
    },
    eventType: { type: String, trim: true, maxlength: 60 },
    weddingDates: { type: [Date], default: [] },
    functions: { type: [String], default: [] },
    city: { type: String, trim: true },
    venue: { type: String, trim: true },
    budgetBand: { type: String, enum: BUDGET_BANDS },
    budgetAmount: { type: Number, min: 0 },
    guestCount: { type: Number, min: 0 },
    message: { type: String, trim: true, maxlength: 2000 },
    notes: { type: String, trim: true, maxlength: 5000 },
    status: { type: String, enum: LEAD_STATUSES, default: 'new' },
    lostReason: { type: String, enum: LEAD_LOST_REASONS },
    lostNote: { type: String, trim: true, maxlength: 500 },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'VendorUser' },
    nextFollowUpAt: Date,
    followUpNote: { type: String, trim: true, maxlength: 500 },
    followUpNotifiedAt: Date,
    lastActivityAt: { type: Date, default: Date.now },
    firstRespondedAt: Date,
    bookingId: { type: Schema.Types.ObjectId, ref: 'VendorBooking' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'VendorUser' },
  },
  { timestamps: true }
);

vendorLeadSchema.index({ vendorId: 1, status: 1, createdAt: -1 });
vendorLeadSchema.index({ vendorId: 1, source: 1 });
vendorLeadSchema.index({ vendorId: 1, nextFollowUpAt: 1 });

export const VendorLead = mongoose.model<IVendorLead>('VendorLead', vendorLeadSchema);
