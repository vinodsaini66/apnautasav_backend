import crypto from 'crypto';
import mongoose from 'mongoose';
import { VendorQuote, IVendorQuote, IQuoteItem, IQuoteSnapshot } from '../../models/vendor-os/vendor-quote.model';
import { QuoteTemplate } from '../../models/vendor-os/quote-template.model';
import { VendorPackage } from '../../models/vendor-os/vendor-package.model';
import { VendorClient } from '../../models/vendor-os/vendor-client.model';
import { WeddingVendor } from '../../models/wedding-vendor.model';
import { nextVendorSequence } from '../../models/vendor-os/vendor-counter.model';
import { VendorClientService } from './client.service';
import { VendorLeadService } from './lead.service';
import { VendorBookingService } from './booking.service';
import { VendorNotifyService } from './vendor-notify.service';
import { CategoryConfigService } from './category-config.service';
import { assertWithinPlan } from './plan-limits';
import { BookingSlot } from '../../constants/vendorOs';
import {
  VENDOR_OS_PUBLIC_URL,
  addDays,
  badRequest,
  escapeRegex,
  formatINR,
  notFound,
  round2,
  toDateOnly,
  toObjectId,
  todayIST,
} from '../../utils/vendorOs';

type Id = mongoose.Types.ObjectId;

interface ItemInput {
  name: string;
  description?: string;
  qty?: number;
  unit?: string;
  rate?: number;
  taxPercent?: number;
  packageId?: string;
}

interface ScheduleInput {
  label: string;
  percent?: number;
  amount?: number;
  dueDate?: string;
}

interface QuoteInput {
  leadId?: string;
  clientId?: string;
  client?: { name: string; phone: string; email?: string };
  templateId?: string;
  packageIds?: string[];
  title?: string;
  items?: ItemInput[];
  discount?: { type: 'flat' | 'percent'; value: number };
  gstEnabled?: boolean;
  validTill?: string;
  terms?: string;
  deliverables?: string[];
  notes?: string;
  paymentSchedule?: ScheduleInput[];
  events?: { functionType: string; date: string; slot?: BookingSlot; venue?: string; guestCount?: number }[];
}

export const quotePublicUrl = (token: string) => `${VENDOR_OS_PUBLIC_URL}/q/${token}`;

export class VendorQuoteService {
  // -------------------------------------------------------------------
  // Math
  // -------------------------------------------------------------------

  static buildItems(items: ItemInput[]): IQuoteItem[] {
    return items.map((i) => {
      const qty = Number(i.qty ?? 1);
      const rate = Number(i.rate ?? 0);
      return {
        name: i.name,
        description: i.description,
        qty,
        unit: i.unit,
        rate,
        taxPercent: Number(i.taxPercent ?? 0),
        amount: round2(qty * rate),
        packageId: i.packageId ? toObjectId(i.packageId, 'Package') : undefined,
      };
    });
  }

  static computeTotals(items: IQuoteItem[], discount: { type: 'flat' | 'percent'; value: number }, gstEnabled: boolean) {
    const subtotal = round2(items.reduce((s, i) => s + i.amount, 0));
    const rawDiscount = discount.type === 'percent' ? (subtotal * Math.min(discount.value, 100)) / 100 : discount.value;
    const discountAmount = round2(Math.min(Math.max(rawDiscount, 0), subtotal));
    const factor = subtotal > 0 ? (subtotal - discountAmount) / subtotal : 0;
    // Tax applies to each line after its proportional share of the discount.
    const taxTotal = gstEnabled ? round2(items.reduce((s, i) => s + i.amount * factor * (i.taxPercent / 100), 0)) : 0;
    return { subtotal, discountAmount, taxTotal, total: round2(subtotal - discountAmount + taxTotal) };
  }

  /** Percent rows become amounts; the last row absorbs rounding. */
  static buildSchedule(total: number, rows: ScheduleInput[] = []) {
    let allocated = 0;
    return rows.map((row, idx) => {
      let amount = row.amount !== undefined ? round2(row.amount) : round2((total * (row.percent || 0)) / 100);
      const isLastPercentRow = idx === rows.length - 1 && row.amount === undefined && rows.every((r) => r.amount === undefined);
      if (isLastPercentRow) amount = round2(total - allocated);
      allocated = round2(allocated + amount);
      return { label: row.label, percent: row.percent, amount, dueDate: row.dueDate ? toDateOnly(row.dueDate) : undefined };
    });
  }

  private static applyContent(quote: IVendorQuote, data: QuoteInput, scheduleRows?: ScheduleInput[]) {
    if (data.title !== undefined) quote.title = data.title;
    if (data.items) quote.items = this.buildItems(data.items) as any;
    if (data.discount) quote.discount = data.discount;
    if (data.gstEnabled !== undefined) quote.gstEnabled = data.gstEnabled;
    if (data.validTill !== undefined) quote.validTill = data.validTill ? toDateOnly(data.validTill) : undefined;
    if (data.terms !== undefined) quote.terms = data.terms;
    if (data.deliverables) quote.deliverables = data.deliverables;
    if (data.notes !== undefined) quote.notes = data.notes;
    if (data.events) {
      quote.events = data.events.map((e) => ({
        functionType: e.functionType,
        date: toDateOnly(e.date),
        slot: e.slot || 'full_day',
        venue: e.venue,
        guestCount: e.guestCount,
      })) as any;
    }

    const totals = this.computeTotals(quote.items, quote.discount || { type: 'flat', value: 0 }, quote.gstEnabled);
    Object.assign(quote, totals);

    const rows =
      scheduleRows ||
      data.paymentSchedule ||
      // Re-scale an existing percent-based schedule when the total changes.
      (quote.paymentSchedule.every((p) => p.percent !== undefined && p.percent !== null)
        ? quote.paymentSchedule.map((p) => ({ label: p.label, percent: p.percent, dueDate: p.dueDate?.toISOString() }))
        : undefined);
    if (rows) quote.paymentSchedule = this.buildSchedule(quote.total, rows) as any;

    const scheduled = quote.paymentSchedule.reduce((s, p) => s + p.amount, 0);
    if (scheduled > quote.total + 0.5) throw badRequest('Payment schedule adds up to more than the quote total');
  }

  private static snapshot(quote: IVendorQuote): IQuoteSnapshot {
    return {
      version: quote.version,
      title: quote.title,
      items: quote.items,
      subtotal: quote.subtotal,
      discountAmount: quote.discountAmount,
      taxTotal: quote.taxTotal,
      total: quote.total,
      validTill: quote.validTill,
      terms: quote.terms,
      deliverables: quote.deliverables,
      paymentSchedule: quote.paymentSchedule,
      events: quote.events,
      status: quote.status,
      revisedAt: new Date(),
    };
  }

  // -------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------

  static async create(vendorId: Id, data: QuoteInput, userId: string) {
    await assertWithinPlan(vendorId, 'quotesPerMonth');

    const lead = data.leadId ? await VendorLeadService.getOwned(vendorId, data.leadId) : null;
    let client;
    if (data.clientId) {
      client = await VendorClient.findOne({ _id: toObjectId(data.clientId, 'Client'), vendorId });
      if (!client) throw notFound('Client');
    } else if (lead) {
      client = await VendorClient.findById(lead.clientId);
    } else if (data.client) {
      client = await VendorClientService.upsertByPhone(vendorId, data.client);
    }
    if (!client) throw badRequest('Provide a leadId, clientId or client details');

    const template = data.templateId ? await this.getUsableTemplate(vendorId, data.templateId) : null;

    let items = data.items;
    if (!items && data.packageIds?.length) {
      const packages = await VendorPackage.find({ _id: { $in: data.packageIds }, vendorId, isActive: true }).lean();
      items = packages.map((p) => ({
        name: p.name,
        description: p.includes?.length ? p.includes.join(', ') : p.description,
        qty: 1,
        unit: p.unit,
        rate: p.price,
        taxPercent: p.taxPercent ?? 18,
        packageId: String(p._id),
      }));
    }
    if (!items && template) items = template.items.map((i) => ({ ...i, packageId: i.packageId ? String(i.packageId) : undefined }));

    // Pre-fill events from the lead (dates + functions the family gave).
    let events = data.events;
    if (!events && lead?.weddingDates.length) {
      events = lead.weddingDates.map((d, idx) => ({
        functionType: lead.functions[idx] || lead.functions[0] || 'wedding',
        date: d.toISOString(),
        slot: 'full_day' as BookingSlot,
        venue: lead.venue,
        guestCount: lead.guestCount,
      }));
    }

    const validityDays = template?.validityDays || 15;
    const quote = new VendorQuote({
      vendorId,
      leadId: lead?._id,
      clientId: client._id,
      familyUserId: lead?.familyUserId || client.familyUserId,
      quoteNumber: await nextVendorSequence(vendorId, 'quote', 'Q'),
      publicToken: crypto.randomBytes(16).toString('hex'),
      status: 'draft',
      version: 1,
      discount: { type: 'flat', value: 0 },
      gstEnabled: template?.gstEnabled ?? false,
      terms: template?.terms,
      deliverables: template?.deliverables || [],
      validTill: addDays(todayIST(), validityDays),
      title: template?.title,
      createdBy: userId,
    });

    const templateSchedule = template?.paymentSchedule.map((p) => ({
      label: p.label,
      percent: p.percent,
      dueDate: p.dueOffsetDays !== undefined && p.dueOffsetDays !== null ? addDays(todayIST(), p.dueOffsetDays).toISOString() : undefined,
    }));
    this.applyContent(quote, { ...data, items: items || [], events }, data.paymentSchedule || templateSchedule);
    await quote.save();

    await VendorNotifyService.logActivity({
      vendorId,
      leadId: lead?._id as Id | undefined,
      quoteId: quote._id as Id,
      clientId: client._id as Id,
      type: 'quote_created',
      text: `Quote ${quote.quoteNumber} drafted (${formatINR(quote.total)})`,
      createdBy: userId,
    });
    return quote;
  }

  static async getOwned(vendorId: Id, quoteId: string) {
    const quote = await VendorQuote.findOne({ _id: toObjectId(quoteId, 'Quote'), vendorId });
    if (!quote) throw notFound('Quote');
    return quote;
  }

  static async get(vendorId: Id, quoteId: string) {
    const quote = await VendorQuote.findOne({ _id: toObjectId(quoteId, 'Quote'), vendorId })
      .populate('clientId', 'name phone email city')
      .populate('leadId', 'source status contact')
      .lean();
    if (!quote) throw notFound('Quote');
    return { ...quote, publicUrl: quotePublicUrl(quote.publicToken) };
  }

  static async list(vendorId: Id, q: { status?: string; leadId?: string; clientId?: string; search?: string; skip: number; limit: number }) {
    const filter: any = { vendorId };
    if (q.status) filter.status = { $in: q.status.split(',') };
    if (q.leadId) filter.leadId = toObjectId(q.leadId, 'Lead');
    if (q.clientId) filter.clientId = toObjectId(q.clientId, 'Client');
    if (q.search) {
      const rx = new RegExp(escapeRegex(q.search), 'i');
      const clients = await VendorClient.find({ vendorId, $or: [{ name: rx }, { phone: rx }] }).select('_id').lean();
      filter.$or = [{ quoteNumber: rx }, { title: rx }, { clientId: { $in: clients.map((c) => c._id) } }];
    }
    const [items, total] = await Promise.all([
      VendorQuote.find(filter).select('-history -items').sort({ createdAt: -1 }).skip(q.skip).limit(q.limit).populate('clientId', 'name phone').lean(),
      VendorQuote.countDocuments(filter),
    ]);
    return { items, total };
  }

  /**
   * Editing a quote that already went out creates a new version: the
   * previous content is pushed onto `history` and the quote returns to
   * draft, to be re-sent (spec M4 "Versioning: revise quote, keep history").
   */
  static async update(vendorId: Id, quoteId: string, data: QuoteInput, userId: string) {
    const quote = await this.getOwned(vendorId, quoteId);
    if (quote.status === 'accepted') throw badRequest('An accepted quote cannot be edited — duplicate it instead');

    const revising = quote.status !== 'draft';
    if (revising) {
      quote.history.push(this.snapshot(quote));
      quote.version += 1;
      quote.status = 'draft';
      quote.viewedAt = undefined;
      quote.declinedAt = undefined;
      quote.declineReason = undefined;
      if (!data.validTill && quote.validTill && quote.validTill < todayIST()) quote.validTill = addDays(todayIST(), 15);
    }
    this.applyContent(quote, data);
    quote.markModified('history');
    await quote.save();

    if (revising) {
      await VendorNotifyService.logActivity({
        vendorId,
        leadId: quote.leadId,
        quoteId: quote._id as Id,
        clientId: quote.clientId,
        type: 'quote_revised',
        text: `Quote ${quote.quoteNumber} revised to v${quote.version} (${formatINR(quote.total)})`,
        createdBy: userId,
      });
    }
    return quote;
  }

  static async duplicate(vendorId: Id, quoteId: string, userId: string) {
    await assertWithinPlan(vendorId, 'quotesPerMonth');
    const source = await this.getOwned(vendorId, quoteId);
    const copy = new VendorQuote({
      ...source.toObject(),
      _id: new mongoose.Types.ObjectId(),
      quoteNumber: await nextVendorSequence(vendorId, 'quote', 'Q'),
      publicToken: crypto.randomBytes(16).toString('hex'),
      status: 'draft',
      version: 1,
      history: [],
      bookingId: undefined,
      sentAt: undefined,
      viewedAt: undefined,
      viewCount: 0,
      acceptedAt: undefined,
      declinedAt: undefined,
      declineReason: undefined,
      validTill: addDays(todayIST(), 15),
      createdBy: userId,
      createdAt: undefined,
      updatedAt: undefined,
    });
    await copy.save();
    return copy;
  }

  static async remove(vendorId: Id, quoteId: string) {
    const quote = await this.getOwned(vendorId, quoteId);
    if (quote.status !== 'draft' || quote.version > 1) throw badRequest('Only never-sent drafts can be deleted');
    await quote.deleteOne();
  }

  // -------------------------------------------------------------------
  // Lifecycle: Draft → Sent → Viewed → Accepted / Declined / Expired
  // -------------------------------------------------------------------

  static async markSent(vendorId: Id, quoteId: string, userId: string) {
    const quote = await this.getOwned(vendorId, quoteId);
    if (['accepted', 'declined'].includes(quote.status)) throw badRequest(`This quote is already ${quote.status}`);
    if (!quote.items.length) throw badRequest('Add at least one line item before sending');
    if (quote.validTill && quote.validTill < todayIST()) throw badRequest('The validity date has passed — update it before sending');

    if (quote.status === 'draft' || quote.status === 'expired') quote.status = 'sent';
    quote.sentAt = new Date();
    await quote.save();

    if (quote.leadId) {
      const lead = await VendorLeadService.getOwned(vendorId, String(quote.leadId)).catch(() => null);
      if (lead) await VendorLeadService.markContacted(lead, userId, 'quoted');
    }
    await VendorNotifyService.logActivity({
      vendorId,
      leadId: quote.leadId,
      quoteId: quote._id as Id,
      clientId: quote.clientId,
      type: 'quote_sent',
      text: `Quote ${quote.quoteNumber} v${quote.version} sent (${formatINR(quote.total)})`,
      createdBy: userId,
    });
    return { quote, publicUrl: quotePublicUrl(quote.publicToken) };
  }

  static async markViewed(quote: IVendorQuote) {
    const firstView = quote.status === 'sent';
    quote.viewCount += 1;
    if (firstView) {
      quote.status = 'viewed';
      quote.viewedAt = new Date();
    }
    await quote.save();
    if (firstView) {
      const client = await VendorClient.findById(quote.clientId).select('name').lean();
      await VendorNotifyService.logActivity({
        vendorId: quote.vendorId,
        leadId: quote.leadId,
        quoteId: quote._id as Id,
        clientId: quote.clientId,
        type: 'quote_viewed',
        text: `Quote ${quote.quoteNumber} viewed by the client`,
      });
      await VendorNotifyService.notify({
        vendorId: quote.vendorId,
        type: 'quote_viewed',
        title: `${client?.name || 'Client'} viewed quote ${quote.quoteNumber}`,
        body: `${formatINR(quote.total)} — follow up while it's fresh`,
        entityType: 'quote',
        entityId: quote._id as Id,
      });
    }
  }

  /**
   * Accept → tentative booking with the proposed payment schedule (spec
   * M4). `actor` is the vendor user when marked accepted from the panel,
   * or undefined when the family accepts from the public link.
   */
  static async accept(quote: IVendorQuote, actor?: string) {
    if (quote.status === 'accepted') throw badRequest('This quote is already accepted');
    if (quote.status === 'declined') throw badRequest('This quote was declined — ask the vendor for a revised quote');
    if (!actor && quote.status === 'draft') throw badRequest('This quote has not been sent yet');
    if (quote.validTill && quote.validTill < todayIST()) throw badRequest('This quote has expired');
    if (!quote.events.length) throw badRequest('Add event dates to the quote before it can be booked');

    const { booking, unallocatedEvents } = await VendorBookingService.create(
      quote.vendorId,
      {
        leadId: quote.leadId ? String(quote.leadId) : undefined,
        clientId: quote.leadId ? undefined : String(quote.clientId),
        quoteId: String(quote._id),
        title: quote.title,
        status: 'tentative',
        holdExpiresAt: addDays(new Date(), 7).toISOString(),
        events: quote.events.map((e) => ({
          functionType: e.functionType,
          date: e.date.toISOString(),
          slot: e.slot,
          venue: e.venue,
          guestCount: e.guestCount,
        })),
        totalAmount: quote.total,
        paymentSchedule: quote.paymentSchedule.map((p) => ({
          label: p.label,
          amount: p.amount,
          dueDate: p.dueDate?.toISOString(),
        })),
        autoAllocate: true,
      },
      actor
    );

    quote.status = 'accepted';
    quote.acceptedAt = new Date();
    quote.bookingId = booking._id as Id;
    await quote.save();

    await VendorNotifyService.logActivity({
      vendorId: quote.vendorId,
      leadId: quote.leadId,
      quoteId: quote._id as Id,
      bookingId: booking._id as Id,
      clientId: quote.clientId,
      type: 'quote_accepted',
      text: `Quote ${quote.quoteNumber} accepted${actor ? ' (marked by vendor)' : ' by the client'} — tentative booking ${booking.bookingNumber} created`,
      createdBy: actor,
    });
    if (!actor) {
      await VendorNotifyService.notify({
        vendorId: quote.vendorId,
        type: 'quote_accepted',
        title: `Quote ${quote.quoteNumber} accepted!`,
        body: `Tentative booking ${booking.bookingNumber} created${unallocatedEvents ? ' — assign resources to confirm' : ''}`,
        entityType: 'booking',
        entityId: booking._id as Id,
      });
    }
    return { quote, booking, unallocatedEvents };
  }

  static async decline(quote: IVendorQuote, reason?: string, actor?: string) {
    if (['accepted', 'declined'].includes(quote.status)) throw badRequest(`This quote is already ${quote.status}`);
    quote.status = 'declined';
    quote.declinedAt = new Date();
    quote.declineReason = reason;
    await quote.save();
    await VendorNotifyService.logActivity({
      vendorId: quote.vendorId,
      leadId: quote.leadId,
      quoteId: quote._id as Id,
      clientId: quote.clientId,
      type: 'quote_declined',
      text: `Quote ${quote.quoteNumber} declined${reason ? `: ${reason}` : ''}`,
      createdBy: actor,
    });
    if (!actor) {
      await VendorNotifyService.notify({
        vendorId: quote.vendorId,
        type: 'quote_declined',
        title: `Quote ${quote.quoteNumber} was declined`,
        body: reason,
        entityType: 'quote',
        entityId: quote._id as Id,
      });
    }
    return quote;
  }

  static async expireQuotes(): Promise<number> {
    const result = await VendorQuote.updateMany(
      { status: { $in: ['sent', 'viewed'] }, validTill: { $lt: todayIST() } },
      { $set: { status: 'expired' } }
    );
    return result.modifiedCount;
  }

  // -------------------------------------------------------------------
  // Templates
  // -------------------------------------------------------------------

  static async listTemplates(vendorId: Id, all = false) {
    await CategoryConfigService.ensureDefaults();
    const vendor = await WeddingVendor.findById(vendorId).select('osCategory').lean();
    const systemFilter: any = { vendorId: null, isActive: true };
    if (!all && vendor?.osCategory) systemFilter.categoryKey = vendor.osCategory;
    const [own, system] = await Promise.all([
      QuoteTemplate.find({ vendorId, isActive: true }).sort({ updatedAt: -1 }).lean(),
      QuoteTemplate.find(systemFilter).lean(),
    ]);
    return [...own.map((t) => ({ ...t, system: false })), ...system.map((t) => ({ ...t, system: true }))];
  }

  static async getUsableTemplate(vendorId: Id, templateId: string) {
    const template = await QuoteTemplate.findOne({
      _id: toObjectId(templateId, 'Template'),
      $or: [{ vendorId }, { vendorId: null }],
      isActive: true,
    }).lean();
    if (!template) throw notFound('Template');
    return template;
  }

  static async createTemplate(vendorId: Id, data: any) {
    const vendor = await WeddingVendor.findById(vendorId).select('osCategory').lean();
    return QuoteTemplate.create({ ...data, vendorId, categoryKey: vendor?.osCategory });
  }

  static async updateTemplate(vendorId: Id, templateId: string, data: any) {
    const { vendorId: _v, categoryKey: _c, ...rest } = data;
    const template = await QuoteTemplate.findOneAndUpdate(
      { _id: toObjectId(templateId, 'Template'), vendorId },
      { $set: rest },
      { new: true, runValidators: true }
    );
    if (!template) throw notFound('Template (system templates are read-only — save a copy instead)');
    return template;
  }

  static async deleteTemplate(vendorId: Id, templateId: string) {
    const template = await QuoteTemplate.findOneAndDelete({ _id: toObjectId(templateId, 'Template'), vendorId });
    if (!template) throw notFound('Template');
  }

  static async saveAsTemplate(vendorId: Id, quoteId: string, name: string) {
    const quote = await this.getOwned(vendorId, quoteId);
    const total = quote.total || 1;
    return this.createTemplate(vendorId, {
      name,
      title: quote.title,
      items: quote.items.map(({ name: n, description, qty, unit, rate, taxPercent, packageId }) => ({ name: n, description, qty, unit, rate, taxPercent, packageId })),
      gstEnabled: quote.gstEnabled,
      validityDays: 15,
      terms: quote.terms,
      deliverables: quote.deliverables,
      paymentSchedule: quote.paymentSchedule.map((p) => ({ label: p.label, percent: p.percent ?? round2((p.amount / total) * 100) })),
    });
  }
}
