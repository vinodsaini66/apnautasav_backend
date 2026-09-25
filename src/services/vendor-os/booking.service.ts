import mongoose from 'mongoose';
import { VendorBooking, IVendorBooking } from '../../models/vendor-os/vendor-booking.model';
import { VendorPayment } from '../../models/vendor-os/vendor-payment.model';
import { VendorLead } from '../../models/vendor-os/vendor-lead.model';
import { VendorClient } from '../../models/vendor-os/vendor-client.model';
import { VendorQuote } from '../../models/vendor-os/vendor-quote.model';
import { VendorActivity } from '../../models/vendor-os/vendor-activity.model';
import { VendorResource } from '../../models/vendor-os/vendor-resource.model';
import { CrewAssignment } from '../../models/vendor-os/crew-assignment.model';
import { RunSheet } from '../../models/vendor-os/run-sheet.model';
import { WeddingVendor } from '../../models/wedding-vendor.model';
import { nextVendorSequence } from '../../models/vendor-os/vendor-counter.model';
import { CalendarService } from './calendar.service';
import { VendorClientService } from './client.service';
import { VendorNotifyService } from './vendor-notify.service';
import { VendorLeadService } from './lead.service';
import { FamilyBindingService } from './family-binding.service';
import { VendorCrewService } from './crew.service';
import { BookingStatus, BookingSlot, ACTIVE_BOOKING_STATUSES } from '../../constants/vendorOs';
import { addDays, badRequest, escapeRegex, notFound, round2, toDateOnly, toObjectId, todayIST } from '../../utils/vendorOs';
import logger from '../../utils/logger';

type Id = mongoose.Types.ObjectId;

export interface BookingEventInput {
  _id?: string;
  functionType: string;
  date: string;
  slot?: BookingSlot;
  startTime?: string;
  endTime?: string;
  venue?: string;
  city?: string;
  guestCount?: number;
  notes?: string;
  resourceAllocations?: { resourceId: string; units?: number }[];
}

export interface MilestoneInput {
  _id?: string;
  label: string;
  amount: number;
  dueDate?: string;
}

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  hold: ['tentative', 'confirmed', 'cancelled'],
  tentative: ['hold', 'confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export const FINANCIAL_FIELDS = ['totalAmount', 'amountPaid', 'balanceDue', 'paymentSchedule'] as const;

export const stripFinancials = <T extends Record<string, any>>(booking: T): T => {
  const copy: any = { ...booking };
  for (const f of FINANCIAL_FIELDS) delete copy[f];
  return copy;
};

export class VendorBookingService {
  static toEvents(inputs: BookingEventInput[]) {
    if (!inputs?.length) throw badRequest('A booking needs at least one event');
    return inputs.map((e) => ({
      _id: e._id && mongoose.Types.ObjectId.isValid(e._id) ? new mongoose.Types.ObjectId(e._id) : new mongoose.Types.ObjectId(),
      functionType: e.functionType,
      date: toDateOnly(e.date),
      slot: e.slot || 'full_day',
      startTime: e.startTime,
      endTime: e.endTime,
      venue: e.venue,
      city: e.city,
      guestCount: e.guestCount,
      notes: e.notes,
      resourceAllocations: (e.resourceAllocations || []).map((a) => ({
        resourceId: toObjectId(a.resourceId, 'Resource'),
        units: a.units || 1,
      })),
    }));
  }

  static toMilestones(inputs: MilestoneInput[] = [], existing: IVendorBooking['paymentSchedule'] = []) {
    return inputs.map((m) => {
      const prior = m._id ? existing.find((e) => String(e._id) === m._id) : undefined;
      return {
        _id: prior?._id || new mongoose.Types.ObjectId(),
        label: m.label,
        amount: round2(m.amount),
        dueDate: m.dueDate ? toDateOnly(m.dueDate) : undefined,
        paidAmount: 0,
        status: 'pending' as const,
        lastReminderAt: prior?.lastReminderAt,
        autoReminderStages: prior?.autoReminderStages || [],
      };
    });
  }

  private static assertScheduleFits(total: number, schedule: { amount: number }[]) {
    const sum = schedule.reduce((s, m) => s + m.amount, 0);
    if (sum > total + 0.5) throw badRequest(`Payment schedule (${sum}) is more than the booking total (${total})`);
  }

  // Resource allocation is required once the vendor has any resources —
  // otherwise the conflict engine has nothing to check.
  private static async assertAllocated(vendorId: Id, events: { resourceAllocations: unknown[] }[]) {
    if (events.every((e) => e.resourceAllocations.length)) return;
    const hasResources = await VendorResource.exists({ vendorId, isActive: true });
    if (hasResources) throw badRequest('Assign a resource (hall/crew/artist/vehicle) to every event before confirming');
  }

  /**
   * FIFO-allocates the booking's non-voided payments across its schedule
   * (earliest due first) and recomputes paid/balance. Called after every
   * payment add/void and schedule/total edit.
   */
  static async recomputePayments(booking: IVendorBooking): Promise<IVendorBooking> {
    const payments = await VendorPayment.find({ bookingId: booking._id, isVoided: false }).select('amount').lean();
    const paid = round2(payments.reduce((s, p) => s + p.amount, 0));
    let remaining = paid;

    const ordered = [...booking.paymentSchedule].sort(
      (a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity)
    );
    for (const milestone of ordered) {
      const applied = Math.min(remaining, milestone.amount);
      milestone.paidAmount = round2(applied);
      milestone.status = applied >= milestone.amount - 0.005 ? 'paid' : applied > 0 ? 'partially_paid' : 'pending';
      remaining = round2(remaining - applied);
    }
    booking.amountPaid = paid;
    booking.balanceDue = round2(Math.max(booking.totalAmount - paid, 0));
    booking.markModified('paymentSchedule');
    await booking.save();
    return booking;
  }

  static async create(
    vendorId: Id,
    data: {
      leadId?: string;
      quoteId?: string;
      clientId?: string;
      client?: { name: string; phone: string; email?: string };
      title?: string;
      status?: 'hold' | 'tentative' | 'confirmed';
      holdExpiresAt?: string;
      events: BookingEventInput[];
      totalAmount?: number;
      paymentSchedule?: MilestoneInput[];
      autoReminders?: boolean;
      autoAllocate?: boolean;
      notes?: string;
    },
    createdBy?: string
  ) {
    const lead = data.leadId ? await VendorLeadService.getOwned(vendorId, data.leadId) : null;
    if (lead?.bookingId) {
      const existing = await VendorBooking.findById(lead.bookingId).select('status').lean();
      if (existing && existing.status !== 'cancelled') throw badRequest('This lead already has an active booking');
    }

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

    const status = data.status || 'tentative';
    let events = this.toEvents(data.events);
    let unallocated = 0;
    if (data.autoAllocate !== false) {
      const result = await CalendarService.autoAllocate(vendorId, events);
      events = result.events;
      unallocated = result.unallocated;
    }
    if (status === 'confirmed') await this.assertAllocated(vendorId, events);

    const totalAmount = round2(data.totalAmount || 0);
    const paymentSchedule = this.toMilestones(data.paymentSchedule);
    this.assertScheduleFits(totalAmount, paymentSchedule);

    let holdExpiresAt: Date | undefined;
    if (status !== 'confirmed') {
      holdExpiresAt = data.holdExpiresAt ? new Date(data.holdExpiresAt) : status === 'hold' ? addDays(new Date(), 3) : undefined;
      if (holdExpiresAt && holdExpiresAt <= new Date()) throw badRequest('holdExpiresAt must be in the future');
    }

    const bookingId = new mongoose.Types.ObjectId();
    const specs = await CalendarService.buildSpecs(vendorId, events);
    const { warnings } = await CalendarService.applyBookingBlocks(vendorId, bookingId, specs, createdBy);

    let booking: IVendorBooking;
    try {
      booking = await VendorBooking.create({
        _id: bookingId,
        vendorId,
        bookingNumber: await nextVendorSequence(vendorId, 'booking', 'B'),
        leadId: lead?._id,
        quoteId: data.quoteId,
        clientId: client._id,
        client: { name: client.name, phone: client.phone, email: client.email },
        familyUserId: lead?.familyUserId || client.familyUserId,
        weddingId: lead?.weddingId,
        title: data.title || `${client.name}${events[0] ? ` — ${events[0].functionType}` : ''}`,
        status,
        holdExpiresAt,
        events,
        totalAmount,
        amountPaid: 0,
        balanceDue: totalAmount,
        paymentSchedule,
        autoReminders: !!data.autoReminders,
        notes: data.notes,
        confirmedAt: status === 'confirmed' ? new Date() : undefined,
        createdBy,
      });
    } catch (err) {
      await CalendarService.releaseBookingBlocks(bookingId);
      throw err;
    }

    if (lead) {
      lead.bookingId = booking._id as Id;
      await VendorLeadService.markContacted(lead, createdBy, 'booked');
    }

    await VendorNotifyService.logActivity({
      vendorId,
      bookingId: booking._id as Id,
      leadId: lead?._id as Id | undefined,
      clientId: client._id as Id,
      type: 'booking_created',
      text: `Booking ${booking.bookingNumber} created (${status})`,
      createdBy,
    });
    await FamilyBindingService.syncBooking(booking);

    return { booking, warnings, unallocatedEvents: unallocated };
  }

  static async getOwned(vendorId: Id, bookingId: string) {
    const booking = await VendorBooking.findOne({ _id: toObjectId(bookingId, 'Booking'), vendorId });
    if (!booking) throw notFound('Booking');
    return booking;
  }

  static async get(vendorId: Id, bookingId: string, includeFinancials: boolean) {
    const booking = await VendorBooking.findOne({ _id: toObjectId(bookingId, 'Booking'), vendorId })
      .populate('events.resourceAllocations.resourceId', 'name type capacity')
      .lean();
    if (!booking) throw notFound('Booking');
    const [payments, quote, lead, timeline, crewRows, runSheets] = await Promise.all([
      includeFinancials ? VendorPayment.find({ bookingId: booking._id }).sort({ receivedAt: -1 }).lean() : Promise.resolve(undefined),
      booking.quoteId ? VendorQuote.findById(booking.quoteId).select('quoteNumber status total version').lean() : null,
      booking.leadId ? VendorLead.findById(booking.leadId).select('source status contact').lean() : null,
      VendorActivity.find({ vendorId, bookingId: booking._id }).sort({ createdAt: -1 }).limit(100).populate('createdBy', 'name').lean(),
      // Per-function crew summary for the booking drawer (who's on it, who hasn't confirmed).
      CrewAssignment.find({ bookingId: booking._id, kind: 'event', status: { $ne: 'cancelled' } })
        .select('bookingEventId status active crewMemberId')
        .populate('crewMemberId', 'name')
        .lean(),
      RunSheet.find({ bookingId: booking._id }).select('bookingEventId items.status sharedWithClient').lean(),
    ]);
    const crew = booking.events.map((e) => {
      const rows = crewRows.filter((a: any) => String(a.bookingEventId) === String(e._id));
      const sheet = runSheets.find((r) => String(r.bookingEventId) === String(e._id));
      return {
        eventId: e._id,
        assigned: rows.filter((a) => a.active).length,
        confirmed: rows.filter((a) => a.active && a.status === 'confirmed').length,
        pending: rows.filter((a) => a.active && a.status === 'assigned').length,
        declined: rows.filter((a) => a.status === 'declined').length,
        names: rows.filter((a) => a.active).map((a: any) => a.crewMemberId?.name).filter(Boolean),
        runSheet: sheet ? { items: sheet.items.length, done: sheet.items.filter((i) => i.status === 'done').length, shared: sheet.sharedWithClient } : null,
      };
    });
    const base = includeFinancials ? booking : stripFinancials(booking);
    return { ...base, payments, quote, lead, timeline, crew };
  }

  static async list(
    vendorId: Id,
    q: {
      status?: string;
      from?: string;
      to?: string;
      search?: string;
      clientId?: string;
      when?: 'upcoming' | 'past';
      balance?: 'due' | 'cleared';
      sort?: 'eventDate' | 'eventDateDesc' | 'newest' | 'oldest';
      skip: number;
      limit: number;
    },
    includeFinancials: boolean
  ) {
    // `base` holds every filter except status, so the status tab counts
    // reflect the current search/date filters.
    const base: any = { vendorId };
    if (q.clientId) base.clientId = toObjectId(q.clientId, 'Client');
    const dateRange: any = {};
    if (q.from) dateRange.$gte = toDateOnly(q.from);
    if (q.to) dateRange.$lte = toDateOnly(q.to);
    const today = todayIST();
    if (q.when === 'upcoming') dateRange.$gte = dateRange.$gte && dateRange.$gte > today ? dateRange.$gte : today;
    if (Object.keys(dateRange).length) base.events = { $elemMatch: { date: dateRange } };
    // "Past" = every event is before today.
    if (q.when === 'past') base['events.date'] = { $not: { $gte: today } };
    if (q.search) {
      const rx = new RegExp(escapeRegex(q.search), 'i');
      const digits = q.search.replace(/\D/g, '');
      base.$or = [
        { 'client.name': rx },
        { bookingNumber: rx },
        { title: rx },
        { 'events.venue': rx },
        { 'events.functionType': rx },
        // Phone only for number-like queries ("B-0001" must not match phones containing 0001).
        ...(digits.length >= 3 && /^[\d\s+()-]+$/.test(q.search) ? [{ 'client.phone': new RegExp(digits) }] : []),
      ];
    }
    if (includeFinancials && q.balance === 'due') base.balanceDue = { $gt: 0 };
    if (includeFinancials && q.balance === 'cleared') base.balanceDue = { $lte: 0 };

    const filter: any = { ...base };
    if (q.status) filter.status = { $in: q.status.split(',') };

    const sort: Record<string, 1 | -1> =
      q.sort === 'newest'
        ? { createdAt: -1 }
        : q.sort === 'oldest'
          ? { createdAt: 1 }
          : q.sort === 'eventDateDesc'
            ? { 'events.0.date': -1, createdAt: -1 }
            : { 'events.0.date': 1, createdAt: -1 };

    const projection = includeFinancials ? {} : Object.fromEntries(FINANCIAL_FIELDS.map((f) => [f, 0]));
    const [items, total, counts] = await Promise.all([
      VendorBooking.find(filter, projection)
        .sort(sort)
        .skip(q.skip)
        .limit(q.limit)
        .populate('events.resourceAllocations.resourceId', 'name type color')
        .lean(),
      VendorBooking.countDocuments(filter),
      VendorBooking.aggregate([{ $match: base }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);
    const statusCounts = Object.fromEntries(['hold', 'tentative', 'confirmed', 'completed', 'cancelled'].map((st) => [st, 0]));
    for (const c of counts) statusCounts[c._id] = c.n;
    return { items, total, statusCounts };
  }

  static async update(
    vendorId: Id,
    bookingId: string,
    data: {
      title?: string;
      notes?: string;
      events?: BookingEventInput[];
      totalAmount?: number;
      paymentSchedule?: MilestoneInput[];
      autoReminders?: boolean;
      holdExpiresAt?: string | null;
    },
    userId: string,
    includeFinancials: boolean
  ) {
    const booking = await this.getOwned(vendorId, bookingId);
    const closed = booking.status === 'completed' || booking.status === 'cancelled';
    if (closed && Object.keys(data).some((k) => k !== 'notes')) {
      throw badRequest(`A ${booking.status} booking can only have its notes edited`);
    }
    if (!includeFinancials && (data.totalAmount !== undefined || data.paymentSchedule)) {
      throw badRequest('You do not have permission to edit booking amounts');
    }

    let warnings: unknown[] = [];
    if (data.events) {
      const events = this.toEvents(data.events);
      if (booking.status === 'confirmed') await this.assertAllocated(vendorId, events);
      const specs = await CalendarService.buildSpecs(vendorId, events);
      warnings = (await CalendarService.applyBookingBlocks(vendorId, booking._id as Id, specs, userId)).warnings;
      booking.events = events as any;
    }
    if (data.title !== undefined) booking.title = data.title;
    if (data.notes !== undefined) booking.notes = data.notes;
    if (data.autoReminders !== undefined) booking.autoReminders = data.autoReminders;
    if (data.holdExpiresAt !== undefined && booking.status !== 'confirmed') {
      booking.holdExpiresAt = data.holdExpiresAt ? new Date(data.holdExpiresAt) : undefined;
    }
    if (data.totalAmount !== undefined) booking.totalAmount = round2(data.totalAmount);
    if (data.paymentSchedule) booking.paymentSchedule = this.toMilestones(data.paymentSchedule, booking.paymentSchedule) as any;
    this.assertScheduleFits(booking.totalAmount, booking.paymentSchedule);

    await this.recomputePayments(booking);
    if (data.events) await VendorCrewService.syncWithBooking(booking);
    await FamilyBindingService.syncBooking(booking);
    return { booking: includeFinancials ? booking.toObject() : stripFinancials(booking.toObject()), warnings };
  }

  static async changeStatus(
    vendorId: Id,
    bookingId: string,
    data: { status: BookingStatus; reason?: string; holdExpiresAt?: string },
    userId?: string
  ) {
    const booking = await this.getOwned(vendorId, bookingId);
    const from = booking.status;
    if (from === data.status) return booking;
    if (!TRANSITIONS[from].includes(data.status)) throw badRequest(`Cannot move a booking from ${from} to ${data.status}`);

    if (data.status === 'confirmed') {
      await this.assertAllocated(vendorId, booking.events);
      // Re-run the engine: blocks exist already, but this also catches a
      // booking whose blocks were released (e.g. restored from cancelled).
      const specs = await CalendarService.buildSpecs(vendorId, booking.events);
      await CalendarService.applyBookingBlocks(vendorId, booking._id as Id, specs, userId);
      booking.holdExpiresAt = undefined;
      booking.confirmedAt = new Date();
    } else if (data.status === 'hold' || data.status === 'tentative') {
      if (data.holdExpiresAt) booking.holdExpiresAt = new Date(data.holdExpiresAt);
    } else if (data.status === 'cancelled') {
      await CalendarService.releaseBookingBlocks(booking._id as Id);
      await VendorCrewService.releaseBooking(booking._id as Id);
      booking.cancelReason = data.reason;
      booking.cancelledAt = new Date();
    } else if (data.status === 'completed') {
      booking.completedAt = new Date();
      // Spec 4.1: "weddings done" auto-increments from completed bookings.
      await WeddingVendor.updateOne({ _id: vendorId }, { $inc: { weddingsDone: 1 } });
    }

    booking.status = data.status;
    await booking.save();

    await VendorNotifyService.logActivity({
      vendorId,
      bookingId: booking._id as Id,
      leadId: booking.leadId,
      clientId: booking.clientId,
      type: 'booking_status',
      text: `Booking ${from} → ${data.status}${data.reason ? `: ${data.reason}` : ''}`,
      meta: { from, to: data.status },
      createdBy: userId,
    });
    await FamilyBindingService.syncBooking(booking);
    return booking;
  }

  // -------------------------------------------------------------------
  // Cron jobs (cron/vendorOs.ts)
  // -------------------------------------------------------------------

  /** Auto-release holds past their expiry ("hold till 25 Sep, then auto-release"). */
  static async expireHolds(): Promise<number> {
    const expired = await VendorBooking.find({
      status: { $in: ['hold', 'tentative'] },
      holdExpiresAt: { $lte: new Date() },
    }).limit(500);

    for (const booking of expired) {
      try {
        await CalendarService.releaseBookingBlocks(booking._id as Id);
        await VendorCrewService.releaseBooking(booking._id as Id);
        booking.status = 'cancelled';
        booking.cancelReason = 'Hold expired';
        booking.cancelledAt = new Date();
        await booking.save();
        await VendorNotifyService.logActivity({
          vendorId: booking.vendorId,
          bookingId: booking._id as Id,
          leadId: booking.leadId,
          type: 'booking_status',
          text: 'Hold expired — dates released automatically',
        });
        await VendorNotifyService.notify({
          vendorId: booking.vendorId,
          type: 'hold_expired',
          title: `Hold released: ${booking.client.name}`,
          body: `${booking.bookingNumber} expired and its dates are free again`,
          entityType: 'booking',
          entityId: booking._id as Id,
        });
      } catch (error) {
        logger.error(`Vendor OS: failed to expire hold ${booking._id}`, error);
      }
    }
    return expired.length;
  }

  /** Confirmed bookings whose last event was before yesterday become completed. */
  static async autoComplete(): Promise<number> {
    const cutoff = addDays(todayIST(), -1);
    const candidates = await VendorBooking.find({ status: 'confirmed', 'events.date': { $lt: cutoff } }).limit(500);
    let count = 0;
    for (const booking of candidates) {
      const last = Math.max(...booking.events.map((e) => e.date.getTime()));
      if (last >= cutoff.getTime()) continue;
      try {
        await this.changeStatus(booking.vendorId, String(booking._id), { status: 'completed' });
        count++;
      } catch (error) {
        logger.error(`Vendor OS: failed to auto-complete ${booking._id}`, error);
      }
    }
    return count;
  }

  static isActive(status: BookingStatus) {
    return ACTIVE_BOOKING_STATUSES.includes(status);
  }
}
