import crypto from 'crypto';
import mongoose from 'mongoose';
import { VendorPayment } from '../../models/vendor-os/vendor-payment.model';
import { VendorBooking } from '../../models/vendor-os/vendor-booking.model';
import { nextVendorSequence } from '../../models/vendor-os/vendor-counter.model';
import { VendorBookingService } from './booking.service';
import { VendorNotifyService } from './vendor-notify.service';
import { FamilyBindingService } from './family-binding.service';
import { addDays, badRequest, escapeRegex, formatINR, notFound, round2, toDateOnly, toObjectId, todayIST, DAY_MS } from '../../utils/vendorOs';

type Id = mongoose.Types.ObjectId;

export class VendorPaymentService {
  static async record(
    vendorId: Id,
    bookingId: string,
    data: { amount: number; mode: string; reference?: string; proofUrl?: string; receivedAt?: string; milestoneId?: string; notes?: string },
    recordedBy: string
  ) {
    const booking = await VendorBookingService.getOwned(vendorId, bookingId);
    if (booking.status === 'cancelled') throw badRequest('Cannot record a payment on a cancelled booking');
    const amount = round2(data.amount);
    if (amount <= 0) throw badRequest('Amount must be greater than zero');
    if (booking.totalAmount > 0 && amount > booking.balanceDue + 0.5) {
      throw badRequest(`Amount is more than the balance due (${formatINR(booking.balanceDue)}). Update the booking total first.`);
    }
    if (data.milestoneId && !booking.paymentSchedule.some((m) => String(m._id) === data.milestoneId)) {
      throw badRequest('milestoneId does not belong to this booking');
    }

    const payment = await VendorPayment.create({
      vendorId,
      bookingId: booking._id,
      clientId: booking.clientId,
      milestoneId: data.milestoneId,
      amount,
      mode: data.mode,
      reference: data.reference,
      proofUrl: data.proofUrl,
      receivedAt: data.receivedAt ? new Date(data.receivedAt) : new Date(),
      receiptNo: await nextVendorSequence(vendorId, 'receipt', 'R'),
      publicToken: crypto.randomBytes(16).toString('hex'),
      notes: data.notes,
      recordedBy,
    });

    await VendorBookingService.recomputePayments(booking);
    await VendorNotifyService.logActivity({
      vendorId,
      bookingId: booking._id as Id,
      leadId: booking.leadId,
      clientId: booking.clientId,
      type: 'payment_received',
      text: `${formatINR(amount)} received via ${data.mode.toUpperCase()} (receipt ${payment.receiptNo})`,
      meta: { paymentId: payment._id, amount },
      createdBy: recordedBy,
    });
    await FamilyBindingService.syncBooking(booking);

    return { payment, booking: { _id: booking._id, amountPaid: booking.amountPaid, balanceDue: booking.balanceDue, paymentSchedule: booking.paymentSchedule } };
  }

  static async void(vendorId: Id, paymentId: string, reason: string, userId: string) {
    const payment = await VendorPayment.findOne({ _id: toObjectId(paymentId, 'Payment'), vendorId });
    if (!payment) throw notFound('Payment');
    if (payment.isVoided) throw badRequest('Payment is already voided');
    payment.isVoided = true;
    payment.voidReason = reason;
    await payment.save();

    const booking = await VendorBooking.findById(payment.bookingId);
    if (booking) {
      await VendorBookingService.recomputePayments(booking);
      await FamilyBindingService.syncBooking(booking);
      await VendorNotifyService.logActivity({
        vendorId,
        bookingId: booking._id as Id,
        clientId: booking.clientId,
        type: 'payment_voided',
        text: `Receipt ${payment.receiptNo} (${formatINR(payment.amount)}) voided: ${reason}`,
        createdBy: userId,
      });
    }
    return payment;
  }

  static async list(
    vendorId: Id,
    q: { from?: string; to?: string; mode?: string; bookingId?: string; search?: string; includeVoided?: boolean; skip: number; limit: number }
  ) {
    const filter: any = { vendorId };
    if (!q.includeVoided) filter.isVoided = false;
    if (q.mode) filter.mode = { $in: q.mode.split(',') };
    if (q.bookingId) filter.bookingId = toObjectId(q.bookingId, 'Booking');
    if (q.from || q.to) {
      filter.receivedAt = {};
      if (q.from) filter.receivedAt.$gte = toDateOnly(q.from);
      if (q.to) filter.receivedAt.$lt = addDays(toDateOnly(q.to), 1);
    }
    if (q.search?.trim()) {
      const term = q.search.trim();
      const rx = new RegExp(escapeRegex(term), 'i');
      // Client name / booking number via the booking; phone only for numeric queries.
      const bookingOr: any[] = [{ 'client.name': rx }, { bookingNumber: rx }, { title: rx }];
      const digits = term.replace(/\D/g, '');
      if (/^[\d\s+()-]+$/.test(term) && digits.length >= 3) bookingOr.push({ 'client.phone': new RegExp(escapeRegex(digits.slice(-10))) });
      const bookings = await VendorBooking.find({ vendorId, $or: bookingOr }).select('_id').lean();
      filter.$or = [{ receiptNo: rx }, { reference: rx }, { bookingId: { $in: bookings.map((b) => b._id) } }];
    }
    const [items, total, sum] = await Promise.all([
      VendorPayment.find(filter)
        .sort({ receivedAt: -1, createdAt: -1 })
        .skip(q.skip)
        .limit(q.limit)
        .populate('bookingId', 'bookingNumber title client paymentSchedule._id paymentSchedule.label')
        .populate('recordedBy', 'name')
        .lean(),
      VendorPayment.countDocuments(filter),
      VendorPayment.aggregate([{ $match: { ...filter, isVoided: false } }, { $group: { _id: null, amount: { $sum: '$amount' } } }]),
    ]);
    // Name the milestone each payment was applied to, then drop the schedule.
    const rows = items.map((p: any) => {
      const booking = p.bookingId;
      const milestone = p.milestoneId && booking?.paymentSchedule?.find((m: any) => String(m._id) === String(p.milestoneId));
      if (booking) delete booking.paymentSchedule;
      return { ...p, milestoneLabel: milestone?.label };
    });
    return { items: rows, total, totalAmount: sum[0]?.amount || 0 };
  }

  /** The Payments screen's three cards (prototype `collect`): due this week, overdue, collected this month. */
  static async summary(vendorId: Id) {
    const today = todayIST();
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
    const prevStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    const collectedIn = (from: Date, to: Date) =>
      VendorPayment.aggregate([
        { $match: { vendorId, isVoided: false, receivedAt: { $gte: from, $lt: to } } },
        { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]).then((r) => ({ amount: round2(r[0]?.amount || 0), count: r[0]?.count || 0 }));
    const [week, overdue, collected, lastMonth] = await Promise.all([
      this.dues(vendorId, 'week'),
      this.dues(vendorId, 'overdue'),
      collectedIn(monthStart, nextMonth),
      collectedIn(prevStart, monthStart),
    ]);
    return {
      dueThisWeek: { amount: week.totalDue, count: week.items.length },
      overdue: { amount: overdue.totalDue, count: overdue.items.length },
      collectedThisMonth: collected,
      collectedLastMonth: lastMonth,
    };
  }

  static async getOwned(vendorId: Id, paymentId: string) {
    const payment = await VendorPayment.findOne({ _id: toObjectId(paymentId, 'Payment'), vendorId });
    if (!payment) throw notFound('Payment');
    return payment;
  }

  /**
   * Unpaid milestones across live bookings, bucketed for the money
   * dashboard: "Due this week", "Overdue", or everything upcoming.
   */
  static async dues(vendorId: Id, bucket: 'week' | 'overdue' | 'upcoming' | 'today' = 'week') {
    const today = todayIST();
    const match: any = {};
    if (bucket === 'overdue') match['paymentSchedule.dueDate'] = { $lt: today };
    if (bucket === 'today') match['paymentSchedule.dueDate'] = today;
    if (bucket === 'week') match['paymentSchedule.dueDate'] = { $gte: today, $lt: addDays(today, 7) };
    if (bucket === 'upcoming') match['paymentSchedule.dueDate'] = { $gte: today };

    const rows = await VendorBooking.aggregate([
      { $match: { vendorId, status: { $in: ['hold', 'tentative', 'confirmed', 'completed'] } } },
      { $unwind: '$paymentSchedule' },
      { $match: { 'paymentSchedule.status': { $ne: 'paid' }, ...match } },
      { $sort: { 'paymentSchedule.dueDate': 1 } },
      { $limit: 500 },
      {
        $project: {
          bookingId: '$_id',
          bookingNumber: 1,
          title: 1,
          status: 1,
          client: 1,
          autoReminders: 1,
          milestone: '$paymentSchedule',
        },
      },
    ]);

    const items = rows.map((r) => ({
      ...r,
      _id: undefined,
      amountDue: round2(r.milestone.amount - (r.milestone.paidAmount || 0)),
      daysOverdue: r.milestone.dueDate && r.milestone.dueDate < today ? Math.round((today.getTime() - r.milestone.dueDate.getTime()) / DAY_MS) : 0,
    }));
    return { items, totalDue: round2(items.reduce((s, i) => s + i.amountDue, 0)) };
  }
}
