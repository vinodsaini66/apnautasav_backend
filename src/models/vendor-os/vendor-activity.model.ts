import mongoose, { Document, Schema } from 'mongoose';

// The timeline on a lead/booking card: every note, call, status change,
// quote event, payment and WhatsApp message. WhatsApp deep-link sends are
// logged here as `type: 'message'` (spec M6 phase 1a) — the `channel`,
// `direction` and `externalId` fields are already shaped for the BSP
// (WhatsApp Business API) phase, where inbound replies land here too.
export type VendorActivityType =
  | 'note'
  | 'call'
  | 'meeting'
  | 'status_change'
  | 'lead_created'
  | 'follow_up_set'
  | 'quote_created'
  | 'quote_sent'
  | 'quote_viewed'
  | 'quote_accepted'
  | 'quote_declined'
  | 'quote_revised'
  | 'booking_created'
  | 'booking_status'
  | 'payment_received'
  | 'payment_voided'
  | 'crew_assigned'
  | 'crew_unassigned'
  | 'call_sheet_sent'
  | 'run_sheet_shared'
  | 'message';

export interface IVendorActivity extends Document {
  vendorId: mongoose.Types.ObjectId;
  leadId?: mongoose.Types.ObjectId;
  bookingId?: mongoose.Types.ObjectId;
  quoteId?: mongoose.Types.ObjectId;
  clientId?: mongoose.Types.ObjectId;
  type: VendorActivityType;
  text?: string;
  channel?: 'whatsapp' | 'in_app' | 'sms' | 'call' | 'email';
  direction?: 'outbound' | 'inbound';
  templateKey?: string;
  messageStatus?: 'sent' | 'delivered' | 'read' | 'failed';
  externalId?: string;
  meta?: Record<string, any>;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const vendorActivitySchema = new Schema<IVendorActivity>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: 'WeddingVendor', required: true },
    leadId: { type: Schema.Types.ObjectId, ref: 'VendorLead' },
    bookingId: { type: Schema.Types.ObjectId, ref: 'VendorBooking' },
    quoteId: { type: Schema.Types.ObjectId, ref: 'VendorQuote' },
    clientId: { type: Schema.Types.ObjectId, ref: 'VendorClient' },
    type: { type: String, required: true },
    text: { type: String, trim: true, maxlength: 5000 },
    channel: { type: String, enum: ['whatsapp', 'in_app', 'sms', 'call', 'email'] },
    direction: { type: String, enum: ['outbound', 'inbound'] },
    templateKey: String,
    messageStatus: { type: String, enum: ['sent', 'delivered', 'read', 'failed'] },
    externalId: String,
    meta: { type: Schema.Types.Mixed },
    createdBy: { type: Schema.Types.ObjectId, ref: 'VendorUser' },
  },
  { timestamps: true }
);

vendorActivitySchema.index({ leadId: 1, createdAt: -1 });
vendorActivitySchema.index({ bookingId: 1, createdAt: -1 });
vendorActivitySchema.index({ vendorId: 1, createdAt: -1 });

export const VendorActivity = mongoose.model<IVendorActivity>('VendorActivity', vendorActivitySchema);
