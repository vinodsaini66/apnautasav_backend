import mongoose from 'mongoose';
import { VendorLead } from '../../models/vendor-os/vendor-lead.model';
import { VendorBooking } from '../../models/vendor-os/vendor-booking.model';
import { VendorQuote } from '../../models/vendor-os/vendor-quote.model';
import { VendorPayment } from '../../models/vendor-os/vendor-payment.model';
import { VendorClient } from '../../models/vendor-os/vendor-client.model';
import { VendorNotification } from '../../models/vendor-os/vendor-notification.model';
import { WeddingVendor } from '../../models/wedding-vendor.model';
import { VendorResource } from '../../models/vendor-os/vendor-resource.model';
import { VendorUser } from '../../models/vendor-os/vendor-user.model';
import { VendorPaymentService } from './payment.service';
import { getPlanUsage } from './plan-limits';
import { toCSV, ExportColumn } from '../export.service';
import { LEAD_SOURCES } from '../../constants/vendorOs';
import { addDays, badRequest, formatDateKey, round2, toDateOnly, todayIST, parsePagination } from '../../utils/vendorOs';

type Id = mongoose.Types.ObjectId;

const monthBounds = () => {
  const today = todayIST();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const prevStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  return { today, start, end, prevStart };
};

const SEASON_DAYS = 180;

export class VendorInsightsService {
  /** Spec M7 dashboard: this month's events, collections, pending quotes, new leads. */
  static async dashboard(vendorId: Id, vendorUserId: string, includeFinancials: boolean) {
    const { today, start, end } = monthBounds();
    const now = new Date();

    const [vendor, newLeads, leadsThisMonth, overdueFollowUps, pendingQuotes, holdsExpiring, monthBookings, upcoming] = await Promise.all([
      WeddingVendor.findById(vendorId).select('businessName status profileCompleteness osPlan osCategory').lean(),
      VendorLead.countDocuments({ vendorId, status: 'new' }),
      VendorLead.countDocuments({ vendorId, createdAt: { $gte: start, $lt: end } }),
      VendorLead.find({ vendorId, status: { $nin: ['booked', 'lost'] }, nextFollowUpAt: { $lt: now } })
        .select('contact nextFollowUpAt followUpNote status')
        .sort({ nextFollowUpAt: 1 })
        .limit(10)
        .lean(),
      VendorQuote.aggregate([
        { $match: { vendorId, status: { $in: ['sent', 'viewed'] } } },
        { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: '$total' } } },
      ]),
      VendorBooking.find({ vendorId, status: { $in: ['hold', 'tentative'] }, holdExpiresAt: { $gte: now, $lt: addDays(now, 2) } })
        .select('bookingNumber client.name holdExpiresAt status')
        .lean(),
      VendorBooking.aggregate([
        { $match: { vendorId, status: { $in: ['hold', 'tentative', 'confirmed', 'completed'] } } },
        { $unwind: '$events' },
        { $match: { 'events.date': { $gte: start, $lt: end } } },
        { $count: 'events' },
      ]),
      VendorBooking.aggregate([
        { $match: { vendorId, status: { $in: ['hold', 'tentative', 'confirmed'] } } },
        { $unwind: '$events' },
        { $match: { 'events.date': { $gte: today } } },
        { $sort: { 'events.date': 1 } },
        { $limit: 10 },
        {
          $project: {
            bookingId: '$_id',
            bookingNumber: 1,
            status: 1,
            clientName: '$client.name',
            functionType: '$events.functionType',
            date: '$events.date',
            slot: '$events.slot',
            venue: '$events.venue',
          },
        },
      ]),
    ]);

    const quoteStats = { sent: 0, viewed: 0, value: 0 };
    for (const q of pendingQuotes as any[]) {
      (quoteStats as any)[q._id] = q.count;
      quoteStats.value += q.value;
    }

    const result: any = {
      profile: vendor,
      leads: { new: newLeads, thisMonth: leadsThisMonth, overdueFollowUps: overdueFollowUps.length, followUps: overdueFollowUps },
      quotes: { pending: quoteStats.sent + quoteStats.viewed, sent: quoteStats.sent, viewed: quoteStats.viewed },
      bookings: {
        eventsThisMonth: monthBookings[0]?.events || 0,
        upcoming: upcoming.map((u: any) => ({ ...u, _id: undefined, date: formatDateKey(u.date) })),
        holdsExpiringSoon: holdsExpiring,
      },
    };

    result.unreadNotifications = await this.unreadCount(vendorId, vendorUserId);
    Object.assign(result, await this.dashboardExtras(vendorId, vendorUserId, upcoming as any[], includeFinancials));

    if (includeFinancials) {
      const [collected, dueWeek, overdue] = await Promise.all([
        VendorPayment.aggregate([
          { $match: { vendorId, isVoided: false, receivedAt: { $gte: start, $lt: end } } },
          { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]),
        VendorPaymentService.dues(vendorId, 'week'),
        VendorPaymentService.dues(vendorId, 'overdue'),
      ]);
      result.quotes.pendingValue = round2(quoteStats.value);
      result.money = {
        collectedThisMonth: collected[0]?.amount || 0,
        paymentsThisMonth: collected[0]?.count || 0,
        dueThisWeek: { amount: dueWeek.totalDue, count: dueWeek.items.length, items: dueWeek.items.slice(0, 10) },
        overdue: { amount: overdue.totalDue, count: overdue.items.length, items: overdue.items.slice(0, 10) },
        // One list for the dashboard's "Collections" card: overdue first, then due this week.
        dues: [...overdue.items, ...dueWeek.items].slice(0, 6),
      };
      result.plan = await getPlanUsage(vendorId);
    }
    return result;
  }

  /**
   * Prototype dashboard extras: stat cards with last-month comparison,
   * resource names on upcoming events, today's follow-ups and the season's
   * lead-source conversion.
   */
  private static async dashboardExtras(vendorId: Id, vendorUserId: string, upcoming: any[], includeFinancials: boolean) {
    const { today, start, end, prevStart } = monthBounds();
    const endOfToday = addDays(today, 1);

    const eventsIn = (from: Date, to: Date) =>
      VendorBooking.aggregate([
        { $match: { vendorId, status: { $in: ['hold', 'tentative', 'confirmed', 'completed'] } } },
        { $unwind: '$events' },
        { $match: { 'events.date': { $gte: from, $lt: to } } },
        { $count: 'n' },
      ]).then((r) => r[0]?.n || 0);
    const collectedIn = (from: Date, to: Date) =>
      VendorPayment.aggregate([
        { $match: { vendorId, isVoided: false, receivedAt: { $gte: from, $lt: to } } },
        { $group: { _id: null, amount: { $sum: '$amount' } } },
      ]).then((r) => r[0]?.amount || 0);

    const [user, leadsNow, leadsPrev, acceptedNow, acceptedPrev, eventsNow, eventsPrev, collectedNow, collectedPrev, dueLeads, freshLeads, resources, sources] =
      await Promise.all([
        VendorUser.findById(vendorUserId).select('name role').lean(),
        VendorLead.countDocuments({ vendorId, createdAt: { $gte: start, $lt: end } }),
        VendorLead.countDocuments({ vendorId, createdAt: { $gte: prevStart, $lt: start } }),
        VendorQuote.countDocuments({ vendorId, acceptedAt: { $gte: start, $lt: end } }),
        VendorQuote.countDocuments({ vendorId, acceptedAt: { $gte: prevStart, $lt: start } }),
        eventsIn(start, end),
        eventsIn(prevStart, start),
        includeFinancials ? collectedIn(start, end) : Promise.resolve(0),
        includeFinancials ? collectedIn(prevStart, start) : Promise.resolve(0),
        VendorLead.find({ vendorId, status: { $nin: ['booked', 'lost'] }, nextFollowUpAt: { $lt: endOfToday } })
          .select('contact nextFollowUpAt followUpNote status source')
          .sort({ nextFollowUpAt: 1 })
          .limit(6)
          .lean(),
        VendorLead.find({ vendorId, status: 'new', nextFollowUpAt: { $exists: false } })
          .select('contact source createdAt')
          .sort({ createdAt: -1 })
          .limit(3)
          .lean(),
        VendorResource.find({ vendorId }).select('name').lean(),
        this.sourceConversion(vendorId, formatDateKey(addDays(today, -SEASON_DAYS)), formatDateKey(today), includeFinancials),
      ]);

    const resourceName = new Map(resources.map((r) => [String(r._id), r.name]));
    const bookingEvents = await VendorBooking.find({ _id: { $in: upcoming.map((u) => u.bookingId) } })
      .select('events._id events.date events.startTime events.resourceAllocations')
      .lean();
    const allocations = new Map<string, { names: string[]; startTime?: string }>();
    for (const b of bookingEvents) {
      for (const e of b.events) {
        allocations.set(`${b._id}|${formatDateKey(e.date)}`, {
          names: e.resourceAllocations.map((a) => resourceName.get(String(a.resourceId)) || '').filter(Boolean),
          startTime: e.startTime,
        });
      }
    }

    const followUpsToday = [
      ...dueLeads.map((l) => ({
        leadId: l._id,
        name: l.contact.name,
        kind: l.nextFollowUpAt! < today ? ('overdue' as const) : ('today' as const),
        note: l.followUpNote,
        at: l.nextFollowUpAt,
      })),
      ...freshLeads.map((l) => ({ leadId: l._id, name: l.contact.name, kind: 'new' as const, note: `New ${l.source} lead`, at: l.createdAt })),
    ].slice(0, 6);

    const stat = (current: number, previous: number) => ({ current, previous });
    return {
      greetingName: user?.name?.split(' ')[0] || null,
      role: user?.role,
      stats: {
        newLeads: stat(leadsNow, leadsPrev),
        quotesAccepted: stat(acceptedNow, acceptedPrev),
        eventsThisMonth: stat(eventsNow, eventsPrev),
        ...(includeFinancials ? { collected: stat(collectedNow, collectedPrev) } : {}),
      },
      upcomingEvents: upcoming.map((u) => {
        const key = `${u.bookingId}|${formatDateKey(u.date)}`;
        return {
          bookingId: u.bookingId,
          bookingNumber: u.bookingNumber,
          status: u.status,
          clientName: u.clientName,
          functionType: u.functionType,
          date: formatDateKey(u.date),
          slot: u.slot,
          venue: u.venue,
          startTime: allocations.get(key)?.startTime,
          resources: allocations.get(key)?.names || [],
        };
      }),
      followUpsToday,
      sources: { seasonDays: SEASON_DAYS, ...sources },
    };
  }

  /**
   * The demo line from the spec: "WedMeGood: 40 leads, 3 booked; ApnaUtsav:
   * 12 leads, 4 booked". Leads are bucketed by creation date.
   */
  static async sourceConversion(vendorId: Id, from?: string, to?: string, includeFinancials = true) {
    const match: any = { vendorId };
    if (from || to) {
      match.createdAt = {};
      if (from) match.createdAt.$gte = toDateOnly(from);
      if (to) match.createdAt.$lt = addDays(toDateOnly(to), 1);
    }
    const rows = await VendorLead.aggregate([
      { $match: match },
      {
        $lookup: { from: 'vendorbookings', localField: 'bookingId', foreignField: '_id', as: 'booking' },
      },
      {
        $group: {
          _id: '$source',
          leads: { $sum: 1 },
          contacted: { $sum: { $cond: [{ $in: ['$status', ['contacted', 'quoted', 'booked']] }, 1, 0] } },
          quoted: { $sum: { $cond: [{ $in: ['$status', ['quoted', 'booked']] }, 1, 0] } },
          booked: { $sum: { $cond: [{ $eq: ['$status', 'booked'] }, 1, 0] } },
          lost: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, 1, 0] } },
          bookedValue: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'booked'] },
                { $ifNull: [{ $arrayElemAt: ['$booking.totalAmount', 0] }, 0] },
                0,
              ],
            },
          },
          lostReasons: { $push: '$lostReason' },
        },
      },
    ]);

    const bySource = new Map(rows.map((r: any) => [r._id, r]));
    const sources = LEAD_SOURCES.map((source) => {
      const r: any = bySource.get(source) || { leads: 0, contacted: 0, quoted: 0, booked: 0, lost: 0, bookedValue: 0, lostReasons: [] };
      const lostReasons: Record<string, number> = {};
      for (const reason of r.lostReasons.filter(Boolean)) lostReasons[reason] = (lostReasons[reason] || 0) + 1;
      return {
        source,
        leads: r.leads,
        contacted: r.contacted,
        quoted: r.quoted,
        booked: r.booked,
        lost: r.lost,
        conversionRate: r.leads ? round2((r.booked / r.leads) * 100) : 0,
        ...(includeFinancials ? { bookedValue: r.bookedValue } : {}),
        lostReasons,
      };
    }).filter((s) => s.leads > 0);

    const totals = sources.reduce(
      (t, s) => ({ leads: t.leads + s.leads, booked: t.booked + s.booked }),
      { leads: 0, booked: 0 }
    );
    return { sources, totals: { ...totals, conversionRate: totals.leads ? round2((totals.booked / totals.leads) * 100) : 0 } };
  }

  // -------------------------------------------------------------------
  // CSV export (spec M7: "vendors must never feel locked in")
  // -------------------------------------------------------------------

  static async exportCsv(vendorId: Id, entity: string, includeFinancials: boolean): Promise<{ filename: string; csv: string }> {
    const d = (v?: Date | null) => (v ? formatDateKey(new Date(v)) : '');
    let rows: Record<string, any>[] = [];
    let columns: ExportColumn[] = [];

    switch (entity) {
      case 'leads': {
        const leads = await VendorLead.find({ vendorId }).sort({ createdAt: -1 }).lean();
        rows = leads.map((l) => ({
          createdAt: d(l.createdAt),
          name: l.contact.name,
          phone: l.contact.phone,
          email: l.contact.email,
          source: l.source,
          status: l.status,
          lostReason: l.lostReason,
          weddingDates: l.weddingDates.map((x) => d(x)).join(' '),
          functions: l.functions.join(', '),
          city: l.city,
          venue: l.venue,
          guestCount: l.guestCount,
          budgetBand: l.budgetBand,
          nextFollowUpAt: d(l.nextFollowUpAt),
          notes: l.notes,
        }));
        columns = Object.keys(rows[0] || { createdAt: 1 }).map((k) => ({ key: k, label: k }));
        break;
      }
      case 'bookings': {
        const bookings = await VendorBooking.find({ vendorId }).sort({ createdAt: -1 }).lean();
        rows = bookings.map((b) => ({
          bookingNumber: b.bookingNumber,
          status: b.status,
          client: b.client.name,
          phone: b.client.phone,
          title: b.title,
          events: b.events.map((e) => `${e.functionType} ${d(e.date)} ${e.slot}`).join('; '),
          ...(includeFinancials ? { total: b.totalAmount, paid: b.amountPaid, balance: b.balanceDue } : {}),
          createdAt: d(b.createdAt),
        }));
        columns = Object.keys(rows[0] || { bookingNumber: 1 }).map((k) => ({ key: k, label: k }));
        break;
      }
      case 'payments': {
        if (!includeFinancials) throw badRequest('You do not have permission to export payments');
        const payments = await VendorPayment.find({ vendorId }).sort({ receivedAt: -1 }).populate('bookingId', 'bookingNumber client').lean();
        rows = payments.map((p: any) => ({
          receiptNo: p.receiptNo,
          receivedAt: d(p.receivedAt),
          amount: p.amount,
          mode: p.mode,
          reference: p.reference,
          booking: p.bookingId?.bookingNumber,
          client: p.bookingId?.client?.name,
          voided: p.isVoided ? 'yes' : '',
          notes: p.notes,
        }));
        columns = Object.keys(rows[0] || { receiptNo: 1 }).map((k) => ({ key: k, label: k }));
        break;
      }
      case 'clients': {
        const clients = await VendorClient.find({ vendorId }).sort({ name: 1 }).lean();
        rows = clients.map((c) => ({ name: c.name, phone: c.phone, email: c.email, city: c.city, notes: c.notes, createdAt: d(c.createdAt) }));
        columns = Object.keys(rows[0] || { name: 1 }).map((k) => ({ key: k, label: k }));
        break;
      }
      case 'quotes': {
        const quotes = await VendorQuote.find({ vendorId }).sort({ createdAt: -1 }).populate('clientId', 'name phone').lean();
        rows = quotes.map((q: any) => ({
          quoteNumber: q.quoteNumber,
          version: q.version,
          status: q.status,
          client: q.clientId?.name,
          phone: q.clientId?.phone,
          total: q.total,
          validTill: d(q.validTill),
          sentAt: d(q.sentAt),
          createdAt: d(q.createdAt),
        }));
        columns = Object.keys(rows[0] || { quoteNumber: 1 }).map((k) => ({ key: k, label: k }));
        break;
      }
      default:
        throw badRequest('entity must be one of: leads, bookings, payments, clients, quotes');
    }

    return { filename: `${entity}-${formatDateKey(todayIST())}.csv`, csv: toCSV(rows, columns) };
  }

  // -------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------

  private static notificationFilter(vendorId: Id, vendorUserId: string) {
    return { vendorId, $or: [{ vendorUserId: { $exists: false } }, { vendorUserId: null }, { vendorUserId: new mongoose.Types.ObjectId(vendorUserId) }] };
  }

  static async listNotifications(vendorId: Id, vendorUserId: string, query: any) {
    const { page, limit, skip } = parsePagination(query);
    const filter: any = this.notificationFilter(vendorId, vendorUserId);
    const userOid = new mongoose.Types.ObjectId(vendorUserId);
    if (query.unread === 'true') filter.readBy = { $ne: userOid };
    const [items, total, unread] = await Promise.all([
      VendorNotification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      VendorNotification.countDocuments(filter),
      VendorNotification.countDocuments({ ...this.notificationFilter(vendorId, vendorUserId), readBy: { $ne: userOid } }),
    ]);
    return {
      items: items.map(({ readBy, ...n }) => ({ ...n, read: readBy.some((id) => String(id) === vendorUserId) })),
      page,
      limit,
      total,
      unread,
    };
  }

  static async unreadCount(vendorId: Id, vendorUserId: string) {
    return VendorNotification.countDocuments({
      ...this.notificationFilter(vendorId, vendorUserId),
      readBy: { $ne: new mongoose.Types.ObjectId(vendorUserId) },
    });
  }

  static async markRead(vendorId: Id, vendorUserId: string, notificationId?: string) {
    const filter: any = this.notificationFilter(vendorId, vendorUserId);
    if (notificationId) filter._id = new mongoose.Types.ObjectId(notificationId);
    await VendorNotification.updateMany(filter, { $addToSet: { readBy: new mongoose.Types.ObjectId(vendorUserId) } });
  }
}
