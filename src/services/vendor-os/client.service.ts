import mongoose from 'mongoose';
import { VendorClient } from '../../models/vendor-os/vendor-client.model';
import { VendorLead } from '../../models/vendor-os/vendor-lead.model';
import { VendorBooking } from '../../models/vendor-os/vendor-booking.model';
import { VendorQuote } from '../../models/vendor-os/vendor-quote.model';
import { VendorActivity } from '../../models/vendor-os/vendor-activity.model';
import { VendorPayment } from '../../models/vendor-os/vendor-payment.model';
import { VendorNotifyService } from './vendor-notify.service';
import { badRequest, conflict, escapeRegex, normalizePhone, notFound, round2, toObjectId } from '../../utils/vendorOs';

type ClientSort = 'recent' | 'name' | 'value' | 'bookings' | 'newest';
const OPEN_LEAD = ['new', 'contacted', 'quoted'];

export class VendorClientService {
  /**
   * Finds the vendor's client by phone, creating one if needed. Fills in
   * blanks (email/city/familyUserId) on an existing client but never
   * overwrites what the vendor already typed.
   */
  static async upsertByPhone(
    vendorId: mongoose.Types.ObjectId,
    data: { name: string; phone: string; email?: string; city?: string; familyUserId?: mongoose.Types.ObjectId | string }
  ) {
    const phone = normalizePhone(data.phone);
    if (phone.length < 10) throw badRequest('A valid client phone number is required');

    const existing = await VendorClient.findOne({ vendorId, phone });
    if (existing) {
      let changed = false;
      if (!existing.email && data.email) { existing.email = data.email; changed = true; }
      if (!existing.city && data.city) { existing.city = data.city; changed = true; }
      if (!existing.familyUserId && data.familyUserId) {
        existing.familyUserId = new mongoose.Types.ObjectId(String(data.familyUserId));
        changed = true;
      }
      if (changed) await existing.save();
      return existing;
    }

    try {
      return await VendorClient.create({
        vendorId,
        name: data.name,
        phone,
        email: data.email,
        city: data.city,
        familyUserId: data.familyUserId,
      });
    } catch (err: any) {
      // Concurrent create for the same phone — the other one won.
      if (err?.code === 11000) return (await VendorClient.findOne({ vendorId, phone }))!;
      throw err;
    }
  }

  /**
   * The Clients directory (prototype): each family with its booked value,
   * booking count, open leads and last contact (latest activity), plus tag
   * counts for the filter chips. Sorting by value / last contact needs the
   * stats, so the whole vendor directory is aggregated before paging.
   */
  static async list(
    vendorId: mongoose.Types.ObjectId,
    query: { search?: string; tag?: string; sort?: ClientSort; skip: number; limit: number },
    includeFinancials = true
  ) {
    const base: any = { vendorId };
    if (query.search?.trim()) {
      const term = query.search.trim();
      const rx = new RegExp(escapeRegex(term), 'i');
      const or: any[] = [{ name: rx }, { contactPerson: rx }, { email: rx }, { city: rx }, { tags: rx }];
      // "98290 11234" / "+91-98290…" should still find the stored 9829011234.
      const digits = term.replace(/\D/g, '');
      if (/^[\d\s+()-]+$/.test(term) && digits.length >= 3) or.push({ phone: new RegExp(escapeRegex(digits.slice(-10))) });
      base.$or = or;
    }
    const filter = query.tag ? { ...base, tags: query.tag } : base;

    const SORTS: Record<ClientSort, Record<string, 1 | -1>> = {
      recent: { lastContactAt: -1, _id: -1 },
      newest: { createdAt: -1, _id: -1 },
      name: { name: 1, _id: 1 },
      value: { bookedValue: -1, lastContactAt: -1 },
      bookings: { bookingCount: -1, lastContactAt: -1 },
    };
    const sort = SORTS[query.sort || 'recent'] || SORTS.recent;
    const effectiveSort = !includeFinancials && query.sort === 'value' ? SORTS.recent : sort;

    const [page, tagRows] = await Promise.all([
      VendorClient.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: VendorBooking.collection.name,
            let: { cid: '$_id' },
            pipeline: [
              { $match: { $expr: { $and: [{ $eq: ['$clientId', '$$cid'] }, { $eq: ['$vendorId', vendorId] }] }, status: { $ne: 'cancelled' } } },
              { $project: { totalAmount: 1, balanceDue: 1, firstDate: { $min: '$events.date' } } },
            ],
            as: 'bk',
          },
        },
        {
          $lookup: {
            from: VendorLead.collection.name,
            let: { cid: '$_id' },
            pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$clientId', '$$cid'] }, { $eq: ['$vendorId', vendorId] }] } } }, { $project: { status: 1 } }],
            as: 'ld',
          },
        },
        {
          $lookup: {
            from: VendorActivity.collection.name,
            let: { cid: '$_id' },
            pipeline: [
              { $match: { $expr: { $and: [{ $eq: ['$clientId', '$$cid'] }, { $eq: ['$vendorId', vendorId] }] } } },
              { $sort: { createdAt: -1 } },
              { $limit: 1 },
              { $project: { createdAt: 1, type: 1 } },
            ],
            as: 'act',
          },
        },
        {
          $addFields: {
            bookingCount: { $size: '$bk' },
            bookedValue: { $sum: '$bk.totalAmount' },
            balanceDue: { $sum: '$bk.balanceDue' },
            nextEventDate: { $min: { $filter: { input: '$bk.firstDate', as: 'd', cond: { $gte: ['$$d', new Date(new Date().setUTCHours(0, 0, 0, 0))] } } } },
            leadCount: { $size: '$ld' },
            openLeadCount: { $size: { $filter: { input: '$ld', as: 'l', cond: { $in: ['$$l.status', OPEN_LEAD] } } } },
            lastContactAt: { $ifNull: [{ $first: '$act.createdAt' }, '$createdAt'] },
            lastActivityType: { $first: '$act.type' },
          },
        },
        { $project: { bk: 0, ld: 0, act: 0, ...(includeFinancials ? {} : { bookedValue: 0, balanceDue: 0 }) } },
        { $sort: effectiveSort },
        { $facet: { items: [{ $skip: query.skip }, { $limit: query.limit }], total: [{ $count: 'n' }] } },
      ]),
      VendorClient.aggregate([{ $match: base }, { $unwind: '$tags' }, { $group: { _id: '$tags', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 30 }]),
    ]);
    return {
      items: page[0]?.items || [],
      total: page[0]?.total[0]?.n || 0,
      tagCounts: tagRows.map((t: any) => ({ tag: t._id, count: t.count })),
    };
  }

  static async get(vendorId: mongoose.Types.ObjectId, clientId: string, includeFinancials: boolean) {
    const client = await VendorClient.findOne({ _id: toObjectId(clientId, 'Client'), vendorId }).lean();
    if (!client) throw notFound('Client');

    const bookingProjection = includeFinancials ? {} : { totalAmount: 0, amountPaid: 0, balanceDue: 0, paymentSchedule: 0 };
    const [leads, bookings, quotes, timeline, payments] = await Promise.all([
      VendorLead.find({ vendorId, clientId: client._id }).sort({ createdAt: -1 }).lean(),
      VendorBooking.find({ vendorId, clientId: client._id }, bookingProjection).sort({ createdAt: -1 }).lean(),
      VendorQuote.find({ vendorId, clientId: client._id })
        .select(includeFinancials ? '-history -items' : '-history -items -total -subtotal -taxTotal -discountAmount -paymentSchedule')
        .sort({ createdAt: -1 })
        .lean(),
      VendorActivity.find({ vendorId, clientId: client._id }).sort({ createdAt: -1 }).limit(100).populate('createdBy', 'name').lean(),
      includeFinancials
        ? VendorPayment.find({ vendorId, clientId: client._id, isVoided: false }).select('receiptNo amount mode receivedAt bookingId').sort({ receivedAt: -1 }).lean()
        : Promise.resolve([]),
    ]);
    const live = bookings.filter((b) => b.status !== 'cancelled');
    const stats = {
      bookingCount: live.length,
      leadCount: leads.length,
      openLeadCount: leads.filter((l) => OPEN_LEAD.includes(l.status)).length,
      quoteCount: quotes.length,
      ...(includeFinancials
        ? {
            bookedValue: round2(live.reduce((s, b: any) => s + (b.totalAmount || 0), 0)),
            paid: round2(payments.reduce((s: number, p: any) => s + p.amount, 0)),
            balanceDue: round2(live.reduce((s, b: any) => s + (b.balanceDue || 0), 0)),
          }
        : {}),
      lastContactAt: timeline[0]?.createdAt || client.createdAt,
    };
    return { ...client, leads, bookings, quotes, timeline, payments, stats };
  }

  static async create(vendorId: mongoose.Types.ObjectId, data: any, userId?: string) {
    const phone = normalizePhone(data.phone);
    if (phone.length < 10) throw badRequest('A valid client phone number is required');
    const existing = await VendorClient.findOne({ vendorId, phone }).select('name').lean();
    if (existing) {
      throw conflict(`${existing.name} already has this number`, { code: 'DUPLICATE_CLIENT', clientId: existing._id, name: existing.name });
    }
    const client = await VendorClient.create({ ...data, email: data.email || undefined, vendorId, phone });
    await VendorNotifyService.logActivity({
      vendorId,
      clientId: client._id as mongoose.Types.ObjectId,
      type: 'note',
      text: 'Client added',
      createdBy: userId,
    });
    return client;
  }

  static async addNote(vendorId: mongoose.Types.ObjectId, clientId: string, data: { type: 'note' | 'call' | 'meeting'; text: string }, userId: string) {
    const client = await VendorClient.findOne({ _id: toObjectId(clientId, 'Client'), vendorId }).select('_id').lean();
    if (!client) throw notFound('Client');
    await VendorNotifyService.logActivity({ vendorId, clientId: client._id as mongoose.Types.ObjectId, type: data.type, text: data.text, createdBy: userId });
    // Touch the client so "recently contacted" ordering and updatedAt follow.
    await VendorClient.updateOne({ _id: client._id }, { $set: { updatedAt: new Date() } });
    return { ok: true };
  }

  static async update(vendorId: mongoose.Types.ObjectId, clientId: string, data: any) {
    const update = { ...data };
    const unset: Record<string, 1> = {};
    if (update.email === '') {
      delete update.email;
      unset.email = 1;
    }
    if (update.phone) {
      update.phone = normalizePhone(update.phone);
      if (update.phone.length < 10) throw badRequest('A valid client phone number is required');
      const dup = await VendorClient.findOne({ vendorId, phone: update.phone, _id: { $ne: toObjectId(clientId, 'Client') } }).select('name').lean();
      if (dup) throw conflict(`${dup.name} already has this number`, { code: 'DUPLICATE_CLIENT', clientId: dup._id, name: dup.name });
    }
    const client = await VendorClient.findOneAndUpdate(
      { _id: toObjectId(clientId, 'Client'), vendorId },
      Object.keys(unset).length ? { $set: update, $unset: unset } : { $set: update },
      { new: true, runValidators: true }
    );
    if (!client) throw notFound('Client');
    return client;
  }
}
