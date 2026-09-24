import mongoose from 'mongoose';
import { MessageTemplate, IMessageTemplate } from '../../models/vendor-os/message-template.model';
import { WeddingVendor } from '../../models/wedding-vendor.model';
import { VendorLead } from '../../models/vendor-os/vendor-lead.model';
import { VendorBooking } from '../../models/vendor-os/vendor-booking.model';
import { VendorQuote } from '../../models/vendor-os/vendor-quote.model';
import { VendorPayment } from '../../models/vendor-os/vendor-payment.model';
import { VendorClient } from '../../models/vendor-os/vendor-client.model';
import { VendorNotifyService } from './vendor-notify.service';
import { VendorLeadService } from './lead.service';
import { quotePublicUrl } from './quote.service';
import { MessageTemplateType } from '../../constants/vendorOs';
import {
  VENDOR_OS_PUBLIC_URL,
  badRequest,
  buildWhatsAppLink,
  formatDisplayDate,
  formatINR,
  normalizePhone,
  notFound,
  renderTemplate,
  round2,
  toObjectId,
  todayIST,
} from '../../utils/vendorOs';
import logger from '../../utils/logger';

type Id = mongoose.Types.ObjectId;

// Spec M6 phase 1a: "click to WhatsApp" deep links (wa.me) with pre-filled
// template messages — zero cost, opens the vendor's own WhatsApp, logged in
// the panel as "sent". Phase 1b (BSP / WhatsApp Business API) plugs in at
// `compose()`: same context + template rendering, different transport.

interface SystemTemplate {
  key: string;
  name: string;
  type: MessageTemplateType;
  language: 'en' | 'hi' | 'hinglish';
  body: string;
}

const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    key: 'quote_share',
    name: 'Share quote',
    type: 'quote',
    language: 'hinglish',
    body: 'Namaste {{clientName}} ji 🙏\n\n{{businessName}} ki taraf se aapka quote ({{quoteNumber}}) ready hai.\nTotal: {{quoteTotal}}\nValid till: {{validTill}}\n\nQuote dekhein aur accept karein: {{quoteLink}}\n\nKoi sawaal ho toh isi number pe message karein.',
  },
  {
    key: 'quote_share',
    name: 'Share quote',
    type: 'quote',
    language: 'en',
    body: 'Hello {{clientName}},\n\nYour quote ({{quoteNumber}}) from {{businessName}} is ready.\nTotal: {{quoteTotal}}\nValid till: {{validTill}}\n\nView and accept it here: {{quoteLink}}\n\nReply here with any questions.',
  },
  {
    key: 'payment_reminder',
    name: 'Payment reminder',
    type: 'payment_reminder',
    language: 'hinglish',
    body: 'Namaste {{clientName}} ji 🙏\n\nBooking {{bookingNumber}} ke liye {{milestoneLabel}} ka payment {{amount}} {{dueDate}} tak due hai.\n{{upiLine}}\nTotal balance: {{balance}}\n\nDhanyavaad,\n{{businessName}}',
  },
  {
    key: 'payment_reminder',
    name: 'Payment reminder',
    type: 'payment_reminder',
    language: 'en',
    body: 'Hello {{clientName}},\n\nA gentle reminder that {{amount}} ({{milestoneLabel}}) for booking {{bookingNumber}} is due on {{dueDate}}.\n{{upiLine}}\nTotal balance: {{balance}}\n\nThank you,\n{{businessName}}',
  },
  {
    key: 'payment_reminder',
    name: 'भुगतान अनुस्मारक',
    type: 'payment_reminder',
    language: 'hi',
    body: 'नमस्ते {{clientName}} जी 🙏\n\nबुकिंग {{bookingNumber}} के लिए {{milestoneLabel}} का भुगतान {{amount}} {{dueDate}} तक देय है।\n{{upiLine}}\nकुल बकाया: {{balance}}\n\nधन्यवाद,\n{{businessName}}',
  },
  {
    key: 'payment_receipt',
    name: 'Payment receipt',
    type: 'receipt',
    language: 'hinglish',
    body: 'Namaste {{clientName}} ji,\n\n{{paidAmount}} ka payment mil gaya hai — dhanyavaad! 🙏\nReceipt no: {{receiptNo}}\nReceipt: {{receiptLink}}\nBaaki balance: {{balance}}\n\n{{businessName}}',
  },
  {
    key: 'payment_receipt',
    name: 'Payment receipt',
    type: 'receipt',
    language: 'en',
    body: 'Hello {{clientName}},\n\nWe have received {{paidAmount}} — thank you!\nReceipt no: {{receiptNo}}\nReceipt: {{receiptLink}}\nRemaining balance: {{balance}}\n\n{{businessName}}',
  },
  {
    key: 'event_schedule',
    name: 'Event schedule',
    type: 'schedule',
    language: 'hinglish',
    body: 'Namaste {{clientName}} ji,\n\nAapki booking {{bookingNumber}} ka schedule:\n{{eventSummary}}\n\nKuch badlav ho toh zaroor batayein.\n{{businessName}}',
  },
  {
    key: 'event_schedule',
    name: 'Event schedule',
    type: 'schedule',
    language: 'en',
    body: 'Hello {{clientName}},\n\nHere is the schedule for booking {{bookingNumber}}:\n{{eventSummary}}\n\nLet us know if anything changes.\n{{businessName}}',
  },
  {
    key: 'thank_you',
    name: 'Thank you',
    type: 'thank_you',
    language: 'hinglish',
    body: 'Namaste {{clientName}} ji,\n\nAapki shaadi ka hissa banne ke liye dil se dhanyavaad! 🙏✨\nAgar aapko hamara kaam pasand aaya ho toh ApnaUtsav pe ek review zaroor dein: {{profileLink}}\n\n{{businessName}}',
  },
  {
    key: 'thank_you',
    name: 'Thank you',
    type: 'thank_you',
    language: 'en',
    body: 'Hello {{clientName}},\n\nThank you for letting us be part of your wedding! ✨\nIf you enjoyed working with us, please leave a review on ApnaUtsav: {{profileLink}}\n\n{{businessName}}',
  },
  {
    key: 'follow_up',
    name: 'Follow-up',
    type: 'follow_up',
    language: 'hinglish',
    body: 'Namaste {{clientName}} ji,\n\n{{businessName}} se baat kar rahe hain. {{weddingDateLine}}Kya aapne decide kiya? Aapke date abhi available hai — confirm karne ke liye bas reply karein. 🙏',
  },
  {
    key: 'follow_up',
    name: 'Follow-up',
    type: 'follow_up',
    language: 'en',
    body: 'Hello {{clientName}},\n\nThis is {{businessName}}. {{weddingDateLine}}Have you had a chance to decide? Your date is still available — just reply to confirm.',
  },
  {
    key: 'call_sheet',
    name: 'Crew call sheet',
    type: 'call_sheet',
    language: 'hinglish',
    body: 'Namaste {{crewName}} ji 🙏\n\n{{eventDate}} — {{functionType}} ({{clientName}})\nAapka role: {{crewRole}}\nCall time: {{callTime}}\nVenue: {{venue}}\n\nPoora schedule: {{runSheetLink}}\n\nConfirm karne ke liye reply karein. Koi dikkat ho toh call karein: {{managerPhone}}\n{{businessName}}',
  },
  {
    key: 'call_sheet',
    name: 'Crew call sheet',
    type: 'call_sheet',
    language: 'en',
    body: 'Hi {{crewName}},\n\n{{eventDate}} — {{functionType}} ({{clientName}})\nYour role: {{crewRole}}\nCall time: {{callTime}}\nVenue: {{venue}}\n\nFull schedule: {{runSheetLink}}\n\nPlease reply to confirm. Questions? Call {{managerPhone}}\n{{businessName}}',
  },
  {
    key: 'run_sheet_share',
    name: 'Share event-day schedule',
    type: 'run_sheet',
    language: 'hinglish',
    body: 'Namaste {{clientName}} ji 🙏\n\n{{functionType}} ({{eventDate}}) ka hamara event-day schedule:\n{{runSheetSummary}}\n\nLive schedule: {{runSheetLink}}\nKuch badlav chahiye toh batayein.\n{{businessName}}',
  },
  {
    key: 'run_sheet_share',
    name: 'Share event-day schedule',
    type: 'run_sheet',
    language: 'en',
    body: 'Hello {{clientName}},\n\nHere is our schedule for the {{functionType}} on {{eventDate}}:\n{{runSheetSummary}}\n\nLive schedule: {{runSheetLink}}\nLet us know if anything should change.\n{{businessName}}',
  },
];

let defaultsEnsured = false;

export interface ComposeInput {
  templateId?: string;
  templateKey?: string;
  language?: 'en' | 'hi' | 'hinglish';
  body?: string;
  leadId?: string;
  bookingId?: string;
  quoteId?: string;
  paymentId?: string;
  milestoneId?: string;
  clientId?: string;
  phone?: string;
  variables?: Record<string, string>;
  log?: boolean;
}

export class VendorWhatsAppService {
  static async ensureDefaults(): Promise<void> {
    if (defaultsEnsured) return;
    try {
      for (const t of SYSTEM_TEMPLATES) {
        await MessageTemplate.updateOne(
          { vendorId: null, key: t.key, language: t.language },
          { $setOnInsert: { ...t, vendorId: null, isActive: true } },
          { upsert: true }
        );
      }
      defaultsEnsured = true;
    } catch (error) {
      logger.error('Vendor OS: failed to seed message templates', error);
    }
  }

  /** System templates, with the vendor's own edits taking precedence per key+language. */
  static async listTemplates(vendorId: Id, type?: string) {
    await this.ensureDefaults();
    const filter: any = { vendorId: { $in: [null, vendorId] }, isActive: true };
    if (type) filter.type = type;
    const all = await MessageTemplate.find(filter).sort({ type: 1, key: 1, language: 1 }).lean();
    const own = new Set(all.filter((t) => t.vendorId).map((t) => `${t.key}|${t.language}`));
    return all
      .filter((t) => t.vendorId || !own.has(`${t.key}|${t.language}`))
      .map((t) => ({ ...t, system: !t.vendorId }));
  }

  static async createTemplate(vendorId: Id, data: Partial<IMessageTemplate>) {
    const key = data.key || `custom_${Date.now().toString(36)}`;
    try {
      return await MessageTemplate.create({ ...data, key, vendorId });
    } catch (err: any) {
      if (err?.code === 11000) throw badRequest('You already have a template with this key and language — edit it instead');
      throw err;
    }
  }

  /** Editing a system template saves the vendor's own copy under the same key. */
  static async updateTemplate(vendorId: Id, templateId: string, data: Partial<IMessageTemplate>) {
    const template = await MessageTemplate.findOne({ _id: toObjectId(templateId, 'Template'), vendorId: { $in: [null, vendorId] } });
    if (!template) throw notFound('Template');
    if (!template.vendorId) {
      return MessageTemplate.findOneAndUpdate(
        { vendorId, key: template.key, language: template.language },
        {
          $set: { name: data.name ?? template.name, body: data.body ?? template.body, type: template.type, isActive: true },
          $setOnInsert: { vendorId, key: template.key, language: template.language },
        },
        { upsert: true, new: true, runValidators: true }
      );
    }
    if (data.name !== undefined) template.name = data.name;
    if (data.body !== undefined) template.body = data.body;
    if (data.isActive !== undefined) template.isActive = data.isActive;
    await template.save();
    return template;
  }

  /** Deleting an own copy of a system template reverts to the system version. */
  static async deleteTemplate(vendorId: Id, templateId: string) {
    const template = await MessageTemplate.findOneAndDelete({ _id: toObjectId(templateId, 'Template'), vendorId });
    if (!template) throw notFound('Template (system templates cannot be deleted)');
  }

  private static async resolveTemplate(vendorId: Id, input: ComposeInput): Promise<IMessageTemplate | null> {
    await this.ensureDefaults();
    if (input.templateId) {
      const t = await MessageTemplate.findOne({ _id: toObjectId(input.templateId, 'Template'), vendorId: { $in: [null, vendorId] } });
      if (!t) throw notFound('Template');
      return t;
    }
    if (!input.templateKey) return null;
    const language = input.language || 'hinglish';
    const candidates = await MessageTemplate.find({ key: input.templateKey, vendorId: { $in: [null, vendorId] }, isActive: true });
    const pick = (lang: string) =>
      candidates.find((c) => c.vendorId && c.language === lang) || candidates.find((c) => !c.vendorId && c.language === lang);
    const template = pick(language) || pick('hinglish') || pick('en') || null;
    if (!template) throw notFound(`Template "${input.templateKey}"`);
    return template;
  }

  /** Every variable a template can use, resolved from whichever entities were passed. */
  static async buildContext(vendorId: Id, input: ComposeInput, language: string = 'hinglish') {
    const vendor = await WeddingVendor.findById(vendorId).select('businessName slug phone whatsappNumber upiId').lean();
    if (!vendor) throw notFound('Vendor');

    const vars: Record<string, string> = {
      businessName: vendor.businessName,
      vendorPhone: vendor.whatsappNumber || vendor.phone || '',
      upiId: vendor.upiId || '',
      profileLink: `${VENDOR_OS_PUBLIC_URL}/vendors/${vendor.slug}`,
      upiLine: '',
      weddingDateLine: '',
    };
    const ids: { leadId?: Id; bookingId?: Id; quoteId?: Id; clientId?: Id } = {};
    let phone: string | undefined;

    const payment = input.paymentId
      ? await VendorPayment.findOne({ _id: toObjectId(input.paymentId, 'Payment'), vendorId }).lean()
      : null;
    if (input.paymentId && !payment) throw notFound('Payment');

    const quote = input.quoteId ? await VendorQuote.findOne({ _id: toObjectId(input.quoteId, 'Quote'), vendorId }).lean() : null;
    if (input.quoteId && !quote) throw notFound('Quote');

    const bookingId = input.bookingId || (payment ? String(payment.bookingId) : undefined);
    const booking = bookingId ? await VendorBooking.findOne({ _id: toObjectId(bookingId, 'Booking'), vendorId }).lean() : null;
    if (bookingId && !booking) throw notFound('Booking');

    const leadId = input.leadId || (quote?.leadId ? String(quote.leadId) : undefined) || (booking?.leadId ? String(booking.leadId) : undefined);
    const lead = leadId ? await VendorLead.findOne({ _id: toObjectId(leadId, 'Lead'), vendorId }).lean() : null;
    if (input.leadId && !lead) throw notFound('Lead');

    const clientId = input.clientId || (booking ? String(booking.clientId) : quote ? String(quote.clientId) : lead ? String(lead.clientId) : undefined);
    const client = clientId ? await VendorClient.findOne({ _id: toObjectId(clientId, 'Client'), vendorId }).lean() : null;

    if (client) {
      vars.clientName = client.name;
      phone = client.phone;
      ids.clientId = client._id as Id;
    }
    if (lead) {
      ids.leadId = lead._id as Id;
      vars.clientName = vars.clientName || lead.contact.name;
      phone = phone || lead.contact.phone;
      if (lead.weddingDates.length) {
        vars.weddingDate = formatDisplayDate(lead.weddingDates[0]);
        vars.weddingDateLine =
          language === 'en'
            ? `About your wedding on ${vars.weddingDate}. `
            : language === 'hi'
              ? `आपकी ${vars.weddingDate} की शादी के बारे में। `
              : `Aapki ${vars.weddingDate} ki shaadi ke baare mein. `;
      }
    }
    if (quote) {
      ids.quoteId = quote._id as Id;
      Object.assign(vars, {
        quoteNumber: quote.quoteNumber,
        quoteTotal: formatINR(quote.total),
        validTill: formatDisplayDate(quote.validTill),
        quoteLink: quotePublicUrl(quote.publicToken),
      });
    }
    if (booking) {
      ids.bookingId = booking._id as Id;
      phone = phone || booking.client.phone;
      vars.clientName = vars.clientName || booking.client.name;
      const milestone =
        (input.milestoneId && booking.paymentSchedule.find((m) => String(m._id) === input.milestoneId)) ||
        booking.paymentSchedule
          .filter((m) => m.status !== 'paid')
          .sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity))[0];
      if (input.milestoneId && !milestone) throw notFound('Milestone');
      const amountDue = milestone ? round2(milestone.amount - (milestone.paidAmount || 0)) : booking.balanceDue;
      Object.assign(vars, {
        bookingNumber: booking.bookingNumber,
        balance: formatINR(booking.balanceDue),
        amount: formatINR(amountDue),
        milestoneLabel: milestone?.label || 'balance',
        dueDate: milestone?.dueDate ? formatDisplayDate(milestone.dueDate) : formatDisplayDate(todayIST()),
        eventDate: booking.events[0] ? formatDisplayDate(booking.events[0].date) : '',
        eventSummary: booking.events
          .map((e) => `• ${e.functionType} — ${formatDisplayDate(e.date)}${e.startTime ? ` ${e.startTime}` : ''}${e.venue ? `, ${e.venue}` : ''}`)
          .join('\n'),
      });
      if (vendor.upiId && amountDue > 0) {
        const upiLink = `upi://pay?pa=${encodeURIComponent(vendor.upiId)}&pn=${encodeURIComponent(vendor.businessName)}&am=${amountDue}&cu=INR`;
        vars.upiLine = `UPI: ${vendor.upiId}\nPay now: ${upiLink}\n`;
      }
    }
    if (payment) {
      Object.assign(vars, {
        receiptNo: payment.receiptNo,
        paidAmount: formatINR(payment.amount),
        receiptLink: `${VENDOR_OS_PUBLIC_URL}/r/${payment.publicToken}`,
      });
    }

    Object.assign(vars, input.variables || {});
    if (input.phone) phone = normalizePhone(input.phone);
    return { vars, phone, ids };
  }

  /**
   * Renders a template (or free text) for the given lead/booking/quote/
   * payment and returns a wa.me link. Logged to the timeline as "sent" —
   * with deep links we can't observe delivery, so tapping "Send" counts.
   */
  static async compose(vendorId: Id, userId: string, input: ComposeInput) {
    const template = await this.resolveTemplate(vendorId, input);
    if (!template && !input.body) throw badRequest('Provide templateId, templateKey or body');

    const { vars, phone, ids } = await this.buildContext(vendorId, input, template?.language || input.language);
    const message = renderTemplate(input.body || template!.body, vars).replace(/\n{3,}/g, '\n\n').trim();
    const waLink = buildWhatsAppLink(phone, message);

    if (input.log !== false) {
      await VendorNotifyService.logActivity({
        vendorId,
        ...ids,
        type: 'message',
        channel: 'whatsapp',
        direction: 'outbound',
        messageStatus: 'sent',
        templateKey: template?.key,
        text: message,
        createdBy: userId,
      });
      if (ids.leadId) {
        const lead = await VendorLead.findById(ids.leadId);
        if (lead) await VendorLeadService.markContacted(lead, userId);
      }
      if (ids.bookingId && template?.type === 'payment_reminder') {
        const filter: any = { _id: ids.bookingId };
        const update: any = {};
        if (input.milestoneId) {
          filter['paymentSchedule._id'] = toObjectId(input.milestoneId);
          update['paymentSchedule.$.lastReminderAt'] = new Date();
        }
        if (Object.keys(update).length) await VendorBooking.updateOne(filter, { $set: update });
      }
    }

    return { phone, message, waLink, templateKey: template?.key };
  }
}
