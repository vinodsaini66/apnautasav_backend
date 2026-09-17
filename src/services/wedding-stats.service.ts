import mongoose from 'mongoose';
import { Guest } from '../models/guest.model';
import { Task } from '../models/task.model';
import { Budget } from '../models/budget.model';
import { Vendor } from '../models/vendor.model';
import { Collaborator } from '../models/collaborator.model';
import { WeddingEvent } from '../models/event.model';

export interface WeddingStats {
  guests: { total: number; confirmed: number; pending: number; answered: number; rsvpRate: number };
  tasks: { total: number; completed: number; pending: number; overdue: number; completionRate: number };
  budget: { total: number; spent: number; remaining: number; items: number; trackedRate: number };
  payments: { total: number; paid: number; dueCount: number };
  vendors: { total: number; booked: number; gap: number; bookedRate: number };
  collaboratorsCount: number;
  planningProgress: number;
}

/**
 * The one place every guests/tasks/budget/vendors/collaborators aggregation
 * for a single wedding lives — shared by `GET /weddings/:id/stats` (the
 * Wedding Workspace Overview tab) and `GET /weddings` (the dashboard list,
 * which needs the exact same numbers per wedding card). Extracted here
 * specifically so those two call sites can never quietly drift apart on how
 * "answered", "booked", "overdue", etc. are each defined.
 */
export async function computeWeddingStats(weddingId: string, totalBudget: number): Promise<WeddingStats> {
  const now = new Date();
  const weddingObjectId = new mongoose.Types.ObjectId(weddingId);

  const [
    guestCount,
    confirmedGuestCount,
    pendingGuestCount,
    taskCount,
    completedTasks,
    overdueTasks,
    budgetItems,
    trackedBudgetItems,
    totalSpentAgg,
    paidAggregate,
    duePaymentsAggregate,
    vendorCount,
    bookedVendorCount,
    collaboratorsCount,
  ] = await Promise.all([
    Guest.countDocuments({ weddingId }),
    Guest.countDocuments({ weddingId, rsvpStatus: 'confirmed' }),
    Guest.countDocuments({ weddingId, rsvpStatus: 'pending' }),
    Task.countDocuments({ weddingId }),
    Task.countDocuments({ weddingId, status: 'completed' }),
    Task.countDocuments({ weddingId, status: { $nin: ['completed', 'cancelled'] }, dueDate: { $lt: now } }),
    Budget.countDocuments({ weddingId }),
    Budget.countDocuments({ weddingId, actualCost: { $ne: null, $exists: true } }),
    Budget.aggregate([
      { $match: { weddingId: weddingObjectId } },
      { $group: { _id: null, total: { $sum: '$actualCost' } } },
    ]),
    Budget.aggregate([
      { $match: { weddingId: weddingObjectId } },
      {
        $project: {
          paidAmount: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ['$installments', []] } }, 0] },
              { $ifNull: ['$amountPaid', 0] },
              {
                $cond: [
                  { $eq: ['$status', 'paid'] },
                  { $ifNull: ['$actualCost', { $ifNull: ['$estimatedCost', 0] }] },
                  0,
                ],
              },
            ],
          },
        },
      },
      { $group: { _id: null, total: { $sum: '$paidAmount' } } },
    ]),
    Budget.aggregate([
      { $match: { weddingId: weddingObjectId } },
      { $unwind: '$installments' },
      { $match: { 'installments.status': 'pending', 'installments.dueDate': { $lte: now } } },
      { $count: 'count' },
    ]),
    Vendor.countDocuments({ weddingId }),
    Vendor.countDocuments({ weddingId, bookingStatus: { $in: ['booked', 'confirmed'] } }),
    Collaborator.countDocuments({ weddingId, invitationStatus: 'accepted' }),
  ]);

  const completionRate = taskCount > 0 ? (completedTasks / taskCount) * 100 : 0;
  const rsvpRate = guestCount > 0 ? (confirmedGuestCount / guestCount) * 100 : 0;
  const trackedRate = budgetItems > 0 ? (trackedBudgetItems / budgetItems) * 100 : 0;
  const bookedRate = vendorCount > 0 ? (bookedVendorCount / vendorCount) * 100 : 0;
  const planningProgress = Math.round((completionRate + rsvpRate + trackedRate + bookedRate) / 4);
  const totalSpent = totalSpentAgg[0]?.total || 0;

  return {
    guests: {
      total: guestCount,
      confirmed: confirmedGuestCount,
      pending: pendingGuestCount,
      // "answered" = any real response, confirmed or declined — 'pending'
      // is the only "hasn't answered yet" value.
      answered: guestCount - pendingGuestCount,
      rsvpRate: guestCount > 0 ? Number(rsvpRate.toFixed(2)) : 0,
    },
    tasks: {
      total: taskCount,
      completed: completedTasks,
      pending: taskCount - completedTasks,
      overdue: overdueTasks,
      completionRate: taskCount > 0 ? Number(completionRate.toFixed(2)) : 0,
    },
    budget: {
      total: totalBudget || 0,
      spent: totalSpent,
      remaining: (totalBudget || 0) - totalSpent,
      items: budgetItems,
      trackedRate: budgetItems > 0 ? Number(trackedRate.toFixed(2)) : 0,
    },
    payments: {
      total: totalBudget || 0,
      paid: paidAggregate[0]?.total || 0,
      dueCount: duePaymentsAggregate[0]?.count || 0,
    },
    vendors: {
      total: vendorCount,
      booked: bookedVendorCount,
      // Vendors already added to this wedding's tracker but not yet
      // booked/confirmed — a real gap in what's actually locked in, not a
      // guess at missing categories (there's no fixed "you need N vendor
      // types" list anywhere in the schema).
      gap: vendorCount - bookedVendorCount,
      bookedRate: vendorCount > 0 ? Number(bookedRate.toFixed(2)) : 0,
    },
    collaboratorsCount,
    planningProgress,
  };
}

export interface WeddingFunctionSummary {
  _id: string;
  title: string;
  eventType: string;
  startDateTime?: Date;
  guestCount: number;
}

export interface ConsoleFunction {
  _id: string;
  title: string;
  eventType: string;
  startDateTime?: Date;
  endDateTime?: Date;
  venueName?: string;
  guestCount: number;
  budgetEstimated: number;
  budgetSpent: number;
  vendors: { vendorName: string; bookingStatus: string }[];
  hasOverduePayment: boolean;
  tasksTotal: number;
  tasksCompleted: number;
}

export interface ConsoleOverduePayment {
  budgetId: string;
  installmentId: string;
  label: string;
  vendorName: string;
  amount: number;
  dueDate: Date;
  daysOverdue: number;
  eventId?: string;
  eventTitle?: string;
}

export interface ConsoleOverview {
  functions: ConsoleFunction[];
  needsYou: {
    overduePayments: ConsoleOverduePayment[];
    vendorGapFunctions: { eventId: string; title: string }[];
    guestsPending: { count: number; noPhoneCount: number };
  };
}

/**
 * The Wedding Workspace's "Console" (Overview) tab — a purpose-built
 * aggregation distinct from computeWeddingStats: that one gives wedding-wide
 * totals, this one gives the per-function breakdown (budget/vendors/guests
 * per Mehendi/Haldi/...) plus a real, non-fabricated "needs you" list.
 *
 * Deliberately does NOT attempt the design reference's literal "3 vendors
 * available for 9 Dec" (no marketplace availability/calendar data exists)
 * or a "guests need rooms" bulk rooming feature (no Room/inventory model —
 * only a free-text per-guest accommodation note) — see the Console
 * redesign's own notes for why those two were dropped rather than faked.
 */
export async function getConsoleOverview(weddingId: string): Promise<ConsoleOverview> {
  const now = new Date();
  const weddingObjectId = new mongoose.Types.ObjectId(weddingId);

  const events = await WeddingEvent.find({ weddingId })
    .select('title eventType startDateTime endDateTime location.venueName estimatedBudget')
    .sort({ startDateTime: 1 })
    .lean();
  const eventIds = events.map((e) => e._id);

  const [guestCounts, budgetByEvent, vendors, overdueInstallments, guestsPendingCount, guestsPendingNoPhoneCount, tasksByEvent] =
    await Promise.all([
      Guest.aggregate([
        { $match: { weddingId: weddingObjectId } },
        { $unwind: '$eventIds' },
        { $group: { _id: '$eventIds', count: { $sum: 1 } } },
      ]),
      Budget.aggregate([
        { $match: { weddingId: weddingObjectId, eventId: { $ne: null } } },
        {
          $group: {
            _id: '$eventId',
            estimated: { $sum: '$estimatedCost' },
            spent: { $sum: { $ifNull: ['$actualCost', 0] } },
          },
        },
      ]),
      Vendor.find({ weddingId: weddingObjectId, eventIds: { $in: eventIds } })
        .select('vendorName eventIds bookingStatus')
        .lean(),
      Budget.aggregate([
        { $match: { weddingId: weddingObjectId } },
        { $unwind: '$installments' },
        { $match: { 'installments.status': 'pending', 'installments.dueDate': { $lte: now } } },
        {
          $lookup: {
            from: 'vendors',
            localField: 'vendor',
            foreignField: '_id',
            as: 'vendorDoc',
          },
        },
        {
          $project: {
            _id: 0,
            budgetId: '$_id',
            installmentId: '$installments._id',
            label: '$installments.label',
            amount: '$installments.amount',
            dueDate: '$installments.dueDate',
            eventId: '$eventId',
            vendorName: { $ifNull: [{ $arrayElemAt: ['$vendorDoc.vendorName', 0] }, '$description'] },
          },
        },
        { $sort: { dueDate: 1 } },
      ]),
      Guest.countDocuments({ weddingId: weddingObjectId, rsvpStatus: 'pending' }),
      Guest.countDocuments({
        weddingId: weddingObjectId,
        rsvpStatus: 'pending',
        $or: [{ phoneNumber: { $exists: false } }, { phoneNumber: '' }],
      }),
      Task.aggregate([
        { $match: { weddingId: weddingObjectId, eventId: { $ne: null } } },
        {
          $group: {
            _id: '$eventId',
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          },
        },
      ]),
    ]);

  const guestCountByEvent = new Map<string, number>(
    guestCounts.map((c: { _id: mongoose.Types.ObjectId; count: number }) => [String(c._id), c.count])
  );
  const budgetByEventMap = new Map<string, { estimated: number; spent: number }>(
    budgetByEvent.map((b: { _id: mongoose.Types.ObjectId; estimated: number; spent: number }) => [
      String(b._id),
      { estimated: b.estimated, spent: b.spent },
    ])
  );
  const vendorsByEvent = new Map<string, { vendorName: string; bookingStatus: string }[]>();
  for (const v of vendors as { vendorName: string; bookingStatus: string; eventIds: mongoose.Types.ObjectId[] }[]) {
    for (const eid of v.eventIds) {
      const key = String(eid);
      if (!vendorsByEvent.has(key)) vendorsByEvent.set(key, []);
      vendorsByEvent.get(key)!.push({ vendorName: v.vendorName, bookingStatus: v.bookingStatus });
    }
  }
  const overdueEventIds = new Set(
    (overdueInstallments as { eventId?: mongoose.Types.ObjectId }[])
      .filter((o) => o.eventId)
      .map((o) => String(o.eventId))
  );
  const eventTitleById = new Map<string, string>(events.map((e) => [String(e._id), e.title]));
  const tasksByEventMap = new Map<string, { total: number; completed: number }>(
    tasksByEvent.map((t: { _id: mongoose.Types.ObjectId; total: number; completed: number }) => [
      String(t._id),
      { total: t.total, completed: t.completed },
    ])
  );

  const functions: ConsoleFunction[] = events.map((event) => {
    const id = String(event._id);
    const budget = budgetByEventMap.get(id);
    const tasks = tasksByEventMap.get(id);
    return {
      _id: id,
      title: event.title,
      eventType: event.eventType,
      startDateTime: event.startDateTime,
      endDateTime: event.endDateTime,
      venueName: event.location?.venueName,
      guestCount: guestCountByEvent.get(id) ?? 0,
      budgetEstimated: budget?.estimated ?? event.estimatedBudget ?? 0,
      budgetSpent: budget?.spent ?? 0,
      vendors: vendorsByEvent.get(id) ?? [],
      hasOverduePayment: overdueEventIds.has(id),
      tasksTotal: tasks?.total ?? 0,
      tasksCompleted: tasks?.completed ?? 0,
    };
  });

  const overduePayments: ConsoleOverduePayment[] = (
    overdueInstallments as {
      budgetId: mongoose.Types.ObjectId;
      installmentId: mongoose.Types.ObjectId;
      label: string;
      vendorName: string;
      amount: number;
      dueDate: Date;
      eventId?: mongoose.Types.ObjectId;
    }[]
  ).map((o) => ({
    budgetId: String(o.budgetId),
    installmentId: String(o.installmentId),
    label: o.label,
    vendorName: o.vendorName,
    amount: o.amount,
    dueDate: o.dueDate,
    daysOverdue: Math.max(0, Math.floor((now.getTime() - new Date(o.dueDate).getTime()) / 86_400_000)),
    eventId: o.eventId ? String(o.eventId) : undefined,
    eventTitle: o.eventId ? eventTitleById.get(String(o.eventId)) : undefined,
  }));

  // A function counts as a vendor gap only when it has zero vendors tracked
  // at all — not "missing a specific category" (there's no fixed
  // per-function-type category checklist anywhere in the schema, same
  // reasoning computeWeddingStats's own vendor gap already documents).
  const vendorGapFunctions = events
    .filter((event) => !vendorsByEvent.has(String(event._id)))
    .map((event) => ({ eventId: String(event._id), title: event.title }));

  return {
    functions,
    needsYou: {
      overduePayments,
      vendorGapFunctions,
      guestsPending: { count: guestsPendingCount, noPhoneCount: guestsPendingNoPhoneCount },
    },
  };
}

/**
 * This wedding's functions (Mehendi/Haldi/Sangeet/...) each with how many
 * guests are tagged to it — powers the dashboard card's mini ceremony strip.
 * One aggregation for all of a wedding's guests grouped by tagged event,
 * not one query per function.
 */
export async function getWeddingFunctionsSummary(weddingId: string): Promise<WeddingFunctionSummary[]> {
  const events = await WeddingEvent.find({ weddingId })
    .select('title eventType startDateTime')
    .sort({ startDateTime: 1 })
    .lean();

  if (events.length === 0) return [];

  const counts = await Guest.aggregate([
    { $match: { weddingId: new mongoose.Types.ObjectId(weddingId) } },
    { $unwind: '$eventIds' },
    { $group: { _id: '$eventIds', count: { $sum: 1 } } },
  ]);
  const countByEventId = new Map<string, number>(counts.map((c: { _id: mongoose.Types.ObjectId; count: number }) => [String(c._id), c.count]));

  return events.map((event) => ({
    _id: String(event._id),
    title: event.title,
    eventType: event.eventType,
    startDateTime: event.startDateTime,
    guestCount: countByEventId.get(String(event._id)) ?? 0,
  }));
}
