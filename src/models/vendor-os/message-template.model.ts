import mongoose, { Document, Schema } from 'mongoose';
import { MESSAGE_LANGUAGES, MESSAGE_TEMPLATE_TYPES, MessageTemplateType } from '../../constants/vendorOs';

// WhatsApp message template with {{placeholders}}. vendorId === null →
// system default (seeded by whatsapp.service.ts#ensureDefaults); a vendor
// "editing" a system template saves their own copy with the same `key`,
// which then takes precedence for that vendor.
export interface IMessageTemplate extends Document {
  vendorId?: mongoose.Types.ObjectId | null;
  key: string;
  name: string;
  type: MessageTemplateType;
  language: (typeof MESSAGE_LANGUAGES)[number];
  body: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const messageTemplateSchema = new Schema<IMessageTemplate>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: 'WeddingVendor', default: null },
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: MESSAGE_TEMPLATE_TYPES, required: true },
    language: { type: String, enum: MESSAGE_LANGUAGES, default: 'hinglish' },
    body: { type: String, required: true, maxlength: 4000 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

messageTemplateSchema.index({ vendorId: 1, key: 1, language: 1 }, { unique: true });

export const MessageTemplate = mongoose.model<IMessageTemplate>('MessageTemplate', messageTemplateSchema);
