import mongoose from 'mongoose';
import { VendorLead, IVendorLead } from '../../models/vendor-os/vendor-lead.model';
import { VendorActivity } from '../../models/vendor-os/vendor-activity.model';
import { VendorQuote } from '../../models/vendor-os/vendor-quote.model';
import { VendorBooking } from '../../models/vendor-os/vendor-booking.model';
import { VendorUser } from '../../models/vendor-os/vendor-user.model';
import { VendorClientService } from './client.service';
import { VendorNotifyService } from './vendor-notify.service';
import { CalendarService } from './calendar.service';
import { LeadSource, LeadStatus } from '../../constants/vendorOs';
import { VendorOsError, addDays, badRequest, escapeRegex, normalizePhone, notFound, toDateOnly, toObjectId, todayIST } from '../../utils/vendorOs';

type Id = mongoose.Types.ObjectId;

const EDITABLE = ['eventType', 'weddingDates', 'functions', 'city', 'venue', 'budgetBand', 'budgetAmount', 'guestCount', 'notes', 'message', 'assignedTo', 'source'] as const;

const SOURCE_LABELS: Record<string, string> = {
  apnautsav: 'ApnaUtsav',
  whatsapp: 'WhatsApp',
  call: 'Call',
  instagram: 'Instagram',
  wedmegood: 'WedMeGood',
  referral: 'Referral',
  walk_in: 'Walk-in',
  website: 'Website',
  other: 'Other',
};

export class VendorLeadService {
  static async create(
    vendorId: Id,
    data: {
      name: string;
      phone: string;
      email?: string;
      source: LeadSource;
      weddingDates?: string[];
      functions?: string[];
      city?: string;
      venue?: string;
      budgetBand?: string;
      budgetAmount?: number;
      guestCount?: number;
      message?: string;
      notes?: string;
      assignedTo?: string;
      nextFollowUpAt?: string;
      familyUserId?: Id | string;
      weddingId?: Id | string;
      marketplaceInquiryId?: Id | string;
      eventType?: string;
      force?: boolean;
    },
    createdBy?: string
  ) {
    // Vendor-typed leads: warn before creating a second open lead for the
    // same family (they usually just called again). Automatic sources
    // (ApnaUtsav enquiries, WhatsApp clicks) dedupe on their own paths.
    if (createdBy && !data.force) {
      const existing = await VendorLead.findOne({
        vendorId,
        'contact.phone': normalizePhone(data.phone),
        status: { $nin: ['booked', 'lost'] },
      })
        .select('contact.name status createdAt')
        .lean();
      if (existing) {
        throw new VendorOsError(409, `${existing.contact.name} already has an open lead with this number`, {
          code: 'DUPLICATE_LEAD',
          leadId: existing._id,
          name: existing.contact.name,
          status: existing.status,
        });
      }
    }

    const client = await VendorClientService.upsertByPhone(vendorId, {
      name: data.name,
      phone: data.phone,
      email: data.email,
      city: data.city,
      familyUserId: data.familyUserId,
    });

    if (data.assignedTo) await this.assertTeamMember(vendorId, data.assignedTo);

    const lead = await VendorLead.create({
      vendorId,
      clientId: client._id,
      familyUserId: data.familyUserId,
      weddingId: data.weddingId,
      marketplaceInquiryId: data.marketplaceInquiryId,
      source: data.source,
      eventType: data.eventType,
      contact: { name: data.name, phone: client.phone, email: data.email },
      weddingDates: (data.weddingDates || []).map(toDateOnly),
      functions: data.functions || [],
      city: data.city,
      venue: data.venue,
      budgetBand: data.budgetBand,
      budgetAmount: data.budgetAmount,
      guestCount: data.guestCount,
      message: data.message,
      notes: data.notes,
      assignedTo: data.assignedTo,
      nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : undefined,
      createdBy,
    });

    await VendorNotifyService.logActivity({
      vendorId,
      leadId: lead._id as Id,
      clientId: client._id as Id,
      type: 'lead_created',
      text: `Lead added from ${SOURCE_LABELS[data.source] || data.source}`,
      createdBy,
    });

    // Leads the vendor typed in themselves don't need a push.
    if (!createdBy) {
      await VendorNotifyService.notify({
        vendorId,
        type: 'new_lead',
        title: `New ${SOURCE_LABELS[data.source] || ''} enquiry from ${data.name}`.replace(/\s+/g, ' '),
        body: data.weddingDates?.length ? `Wedding date: ${data.weddingDates.join(', ')}` : data.message?.slice(0, 120),
        entityType: 'lead',
        entityId: lead._id as Id,
      });
    }

    return lead;
  }

  private static async assertTeamMember(vendorId: Id, vendorUserId: string) {
    const ok = await VendorUser.exists({ _id: toObjectId(vendorUserId, 'Team member'), vendorId, status: { $ne: 'disabled' } });
    if (!ok) throw badRequest('assignedTo must be an active team member');
  }

  static async list(
    vendorId: Id,
    q: {
      status?: string;
      source?: string;
      search?: string;
      assignedTo?: string;
      followUp?: 'today' | 'overdue' | 'upcoming';
      sort?: 'newest' | 'oldest' | 'wedding' | 'followUp' | 'activity';
      weddingFrom?: string;
      weddingTo?: string;
      skip: number;
      limit: number;
    }
  ) {
    // Everything except status — the pipeline counts (board column badges,
    // list tabs) reflect the current search/source filters.
    const base: any = { vendorId };
    if (q.source) base.source = { $in: q.source.split(',') };
    if (q.assignedTo) base.assignedTo = toObjectId(q.assignedTo);
    if (q.search?.trim()) {
      const term = q.search.trim();
      const rx = new RegExp(escapeRegex(term), 'i');
      const or: any[] = [{ 'contact.name': rx }, { 'contact.email': rx }, { city: rx }, { venue: rx }];
      // "98290 41122" / "+91-98290…" should still find the stored 9829041122.
      const digits = term.replace(/\D/g, '');
      or.push({ 'contact.phone': digits.length >= 3 ? new RegExp(escapeRegex(normalizePhone(digits) || digits)) : rx });
      base.$or = or;
    }
    if (q.weddingFrom || q.weddingTo) {
      base.weddingDates = { $elemMatch: {} as any };
      if (q.weddingFrom) base.weddingDates.$elemMatch.$gte = toDateOnly(q.weddingFrom);
      if (q.weddingTo) base.weddingDates.$elemMatch.$lte = toDateOnly(q.weddingTo);
    }
    if (q.followUp) {
      const now = new Date();
      const endOfToday = addDays(todayIST(), 1);
      base.status = { $nin: ['booked', 'lost'] };
      if (q.followUp === 'overdue') base.nextFollowUpAt = { $lt: now };
      if (q.followUp === 'today') base.nextFollowUpAt = { $gte: todayIST(), $lt: endOfToday };
      if (q.followUp === 'upcoming') base.nextFollowUpAt = { $gte: now };
    }

    const filter: any = { ...base };
    if (q.status) {
      const wanted = q.status.split(',');
      filter.status = base.status ? { $in: wanted.filter((s) => !['booked', 'lost'].includes(s)) } : { $in: wanted };
    }

    const sort: Record<string, 1 | -1> =
      q.sort === 'oldest'
        ? { createdAt: 1 }
        : q.sort === 'wedding'
          ? { 'weddingDates.0': 1, createdAt: -1 }
          : q.sort === 'followUp' || (q.followUp && !q.sort)
            ? { nextFollowUpAt: 1, createdAt: -1 }
            : q.sort === 'activity'
              ? { lastActivityAt: -1 }
              : { createdAt: -1 };

    const [items, total, counts, overdueFollowUps] = await Promise.all([
      VendorLead.find(filter).sort(sort).skip(q.skip).limit(q.limit).populate('assignedTo', 'name phone').lean(),
      VendorLead.countDocuments(filter),
      VendorLead.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      VendorLead.countDocuments({ vendorId, status: { $nin: ['booked', 'lost'] }, nextFollowUpAt: { $lt: new Date() } }),
    ]);

    // Latest quote per lead, for the card's "Q-0012 viewed twice" line.
    const quotes = await VendorQuote.aggregate([
      { $match: { vendorId, leadId: { $in: items.map((l) => l._id) } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$leadId', quoteNumber: { $first: '$quoteNumber' }, status: { $first: '$status' }, viewCount: { $first: '$viewCount' }, total: { $first: '$total' }, sentAt: { $first: '$sentAt' } } },
    ]);
    const quoteByLead = new Map(quotes.map((qt: any) => [String(qt._id), { ...qt, _id: undefined }]));

    const pipeline: Record<string, number> = { new: 0, contacted: 0, quoted: 0, booked: 0, lost: 0 };
    for (const c of counts as any[]) pipeline[c._id] = c.count;
    return {
      items: items.map((l) => ({ ...l, latestQuote: quoteByLead.get(String(l._id)) || null })),
      total,
      pipeline,
      overdueFollowUps,
    };
  }

  static async getOwned(vendorId: Id, leadId: string) {
    const lead = await VendorLead.findOne({ _id: toObjectId(leadId, 'Lead'), vendorId });
    if (!lead) throw notFound('Lead');
    return lead;
  }

  static async get(vendorId: Id, leadId: string, includeFinancials: boolean) {
    const lead = await VendorLead.findOne({ _id: toObjectId(leadId, 'Lead'), vendorId })
      .populate('assignedTo', 'name phone')
      .populate('clientId')
      .lean();
    if (!lead) throw notFound('Lead');
    const [timeline, quotes, booking] = await Promise.all([
      VendorActivity.find({ vendorId, leadId: lead._id }).sort({ createdAt: -1 }).limit(200).populate('createdBy', 'name').lean(),
      VendorQuote.find({ vendorId, leadId: lead._id }).select('-history').sort({ createdAt: -1 }).lean(),
      lead.bookingId
        ? VendorBooking.findById(lead.bookingId)
            .select(includeFinancials ? '' : '-totalAmount -amountPaid -balanceDue -paymentSchedule')
            .lean()
        : null,
    ]);
    return { ...lead, timeline, quotes, booking };
  }

  static async update(vendorId: Id, leadId: string, data: Record<string, any>) {
    const lead = await this.getOwned(vendorId, leadId);
    for (const field of EDITABLE) {
      if (data[field] === undefined) continue;
      if (field === 'weddingDates') lead.weddingDates = data.weddingDates.map(toDateOnly);
      else if (field === 'assignedTo') {
        if (data.assignedTo) await this.assertTeamMember(vendorId, data.assignedTo);
        lead.assignedTo = data.assignedTo || undefined;
      } else (lead as any)[field] = data[field];
    }
    if (data.name || data.email) {
      lead.contact = { ...lead.contact, name: data.name || lead.contact.name, email: data.email ?? lead.contact.email };
    }
    lead.lastActivityAt = new Date();
    await lead.save();
    return lead;
  }

  static async changeStatus(
    vendorId: Id,
    leadId: string,
    data: { status: LeadStatus; lostReason?: string; lostNote?: string },
    createdBy?: string
  ) {
    const lead = await this.getOwned(vendorId, leadId);
    if (data.status === 'lost' && !data.lostReason) throw badRequest('lostReason is required when marking a lead lost');
    const from = lead.status;
    if (from === data.status) return lead;

    lead.status = data.status;
    if (data.status === 'lost') {
      lead.lostReason = data.lostReason;
      lead.lostNote = data.lostNote;
      lead.nextFollowUpAt = undefined;
    } else {
      lead.lostReason = undefined;
      lead.lostNote = undefined;
    }
    if (from === 'new' && !lead.firstRespondedAt) lead.firstRespondedAt = new Date();
    lead.lastActivityAt = new Date();
    await lead.save();

    await VendorNotifyService.logActivity({
      vendorId,
      leadId: lead._id as Id,
      clientId: lead.clientId,
      type: 'status_change',
      text: `Status: ${from} → ${data.status}${data.lostReason ? ` (${data.lostReason.replace(/_/g, ' ')})` : ''}`,
      meta: { from, to: data.status, lostReason: data.lostReason },
      createdBy,
    });
    return lead;
  }

  /**
   * Any outbound touch (call logged, WhatsApp sent, quote sent) moves a
   * brand-new lead to "contacted" and stamps the first response time.
   */
  static async markContacted(lead: IVendorLead, createdBy?: string, toStatus: LeadStatus = 'contacted') {
    const order: LeadStatus[] = ['new', 'contacted', 'quoted', 'booked'];
    const changed = lead.status !== 'lost' && order.indexOf(lead.status) < order.indexOf(toStatus);
    const from = lead.status;
    if (changed) lead.status = toStatus;
    if (!lead.firstRespondedAt) lead.firstRespondedAt = new Date();
    lead.lastActivityAt = new Date();
    await lead.save();
    if (changed) {
      await VendorNotifyService.logActivity({
        vendorId: lead.vendorId,
        leadId: lead._id as Id,
        clientId: lead.clientId,
        type: 'status_change',
        text: `Status: ${from} → ${toStatus}`,
        meta: { from, to: toStatus, automatic: true },
        createdBy,
      });
    }
  }

  static async addNote(vendorId: Id, leadId: string, data: { type?: 'note' | 'call' | 'meeting'; text: string }, createdBy: string) {
    const lead = await this.getOwned(vendorId, leadId);
    data = { ...data, type: data.type || 'note' };
    const activity = await VendorNotifyService.logActivity({
      vendorId,
      leadId: lead._id as Id,
      clientId: lead.clientId,
      type: data.type!,
      text: data.text,
      channel: data.type === 'call' ? 'call' : undefined,
      createdBy,
    });
    if (data.type === 'note') {
      lead.lastActivityAt = new Date();
      await lead.save();
    } else {
      await this.markContacted(lead, createdBy);
    }
    return activity;
  }

  static async setFollowUp(vendorId: Id, leadId: string, data: { at: string | null; note?: string }, createdBy: string) {
    const lead = await this.getOwned(vendorId, leadId);
    lead.nextFollowUpAt = data.at ? new Date(data.at) : undefined;
    lead.followUpNote = data.at ? data.note : undefined;
    lead.followUpNotifiedAt = undefined;
    await lead.save();
    await VendorNotifyService.logActivity({
      vendorId,
      leadId: lead._id as Id,
      clientId: lead.clientId,
      type: 'follow_up_set',
      text: data.at
        ? `Follow-up set for ${new Date(data.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}${data.note ? `: ${data.note}` : ''}`
        : 'Follow-up cleared',
      meta: { at: data.at },
      createdBy,
    });
    return lead;
  }

  static async availability(vendorId: Id, leadId: string) {
    const lead = await this.getOwned(vendorId, leadId);
    if (!lead.weddingDates.length) return [];
    return CalendarService.availabilityForDates(vendorId, lead.weddingDates);
  }

  static async remove(vendorId: Id, leadId: string) {
    const lead = await this.getOwned(vendorId, leadId);
    if (lead.bookingId) throw badRequest('This lead has a booking — mark it lost instead of deleting');
    await VendorQuote.deleteMany({ vendorId, leadId: lead._id, status: 'draft' });
    await VendorActivity.deleteMany({ vendorId, leadId: lead._id });
    await lead.deleteOne();
  }
}
