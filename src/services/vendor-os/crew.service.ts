import mongoose from 'mongoose';
import { CrewMember, ICrewMember } from '../../models/vendor-os/crew-member.model';
import { CrewAssignment, ICrewAssignment } from '../../models/vendor-os/crew-assignment.model';
import { RunSheet } from '../../models/vendor-os/run-sheet.model';
import { VendorBooking, IVendorBooking, IBookingEvent } from '../../models/vendor-os/vendor-booking.model';
import { VendorResource } from '../../models/vendor-os/vendor-resource.model';
import { VendorUser } from '../../models/vendor-os/vendor-user.model';
import { VendorNotifyService } from './vendor-notify.service';
import { ACTIVE_BOOKING_STATUSES, AtomicSlot, BookingSlot, expandSlot } from '../../constants/vendorOs';
import {
  DAY_MS,
  addDays,
  badRequest,
  conflict,
  escapeRegex,
  formatDateKey,
  formatDisplayDate,
  normalizePhone,
  notFound,
  round2,
  toDateOnly,
  toObjectId,
  todayIST,
} from '../../utils/vendorOs';
import logger from '../../utils/logger';

type Id = mongoose.Types.ObjectId;

// Phase 2 "Team & crew management" (spec section 6): crew roster,
// availability, per-event assignment with double-booking prevention, crew
// self-service, and per-crew payout tracking. Call sheets and the
// event-day run sheet live in call-sheet.service.ts.

export interface AssignInput {
  crewMemberId: string;
  role?: string;
  callTime?: string;
  reportingLocation?: string;
  fee?: number;
  notes?: string;
}

const isDup = (err: any) => err?.code === 11000 || err?.writeErrors?.some?.((e: any) => e.code === 11000);

export class VendorCrewService {
  // -------------------------------------------------------------------
  // Roster
  // -------------------------------------------------------------------

  static async listMembers(vendorId: Id, q: { search?: string; active?: string; skill?: string; resourceId?: string }) {
    const filter: any = { vendorId };
    if (q.active !== 'all') filter.isActive = q.active === 'false' ? false : true;
    if (q.skill) filter.skills = q.skill;
    if (q.resourceId) filter.defaultResourceId = toObjectId(q.resourceId, 'Resource');
    if (q.search) {
      const rx = new RegExp(escapeRegex(q.search), 'i');
      filter.$or = [{ name: rx }, { phone: rx }, { role: rx }, { skills: rx }];
    }
    const members = await CrewMember.find(filter).sort({ isActive: -1, name: 1 }).populate('defaultResourceId', 'name type').lean();
    // Upcoming work per member for the roster (next assignment + count).
    const upcoming = await CrewAssignment.aggregate([
      { $match: { vendorId, kind: 'event', active: true, date: { $gte: todayIST() }, crewMemberId: { $in: members.map((m) => m._id) } } },
      { $sort: { date: 1 } },
      { $group: { _id: '$crewMemberId', count: { $sum: 1 }, next: { $first: '$date' }, pending: { $sum: { $cond: [{ $eq: ['$status', 'assigned'] }, 1, 0] } } } },
    ]);
    const map = new Map(upcoming.map((u: any) => [String(u._id), u]));
    return members.map((m) => {
      const u = map.get(String(m._id));
      return { ...m, upcomingCount: u?.count || 0, pendingCount: u?.pending || 0, nextDate: u ? formatDateKey(u.next) : null, hasLogin: !!m.vendorUserId };
    });
  }

  private static async assertResource(vendorId: Id, resourceId?: string | null) {
    if (!resourceId) return;
    const ok = await VendorResource.exists({ _id: toObjectId(resourceId, 'Resource'), vendorId, isActive: true });
    if (!ok) throw badRequest('defaultResourceId must be one of your active resources');
  }

  static async createMember(vendorId: Id, data: any) {
    const phone = normalizePhone(data.phone);
    if (phone.length !== 10) throw badRequest('Enter a valid 10-digit mobile number');
    const existing = await CrewMember.findOne({ vendorId, phone }).select('name').lean();
    if (existing) throw conflict(`${existing.name} already has this number`, { code: 'DUPLICATE_CREW', crewMemberId: existing._id, name: existing.name });
    await this.assertResource(vendorId, data.defaultResourceId);

    // Link to a panel login with the same phone (team member with role crew).
    const user = await VendorUser.findOne({ vendorId, phone }).select('_id').lean();
    return CrewMember.create({ ...data, phone, vendorId, vendorUserId: user?._id });
  }

  static async getOwnedMember(vendorId: Id, memberId: string) {
    const member = await CrewMember.findOne({ _id: toObjectId(memberId, 'Crew member'), vendorId });
    if (!member) throw notFound('Crew member');
    return member;
  }

  static async updateMember(vendorId: Id, memberId: string, data: any) {
    const member = await this.getOwnedMember(vendorId, memberId);
    const { vendorId: _v, vendorUserId: _u, ...rest } = data;
    if (rest.phone) {
      rest.phone = normalizePhone(rest.phone);
      if (rest.phone.length !== 10) throw badRequest('Enter a valid 10-digit mobile number');
      const dup = await CrewMember.findOne({ vendorId, phone: rest.phone, _id: { $ne: member._id } }).select('name').lean();
      if (dup) throw conflict(`${dup.name} already has this number`, { code: 'DUPLICATE_CREW', crewMemberId: dup._id, name: dup.name });
      const user = await VendorUser.findOne({ vendorId, phone: rest.phone }).select('_id').lean();
      member.vendorUserId = user?._id as Id | undefined;
    }
    if (rest.defaultResourceId !== undefined) await this.assertResource(vendorId, rest.defaultResourceId);
    if (rest.isActive === false && member.isActive) await this.assertNoUpcomingWork(member._id as Id);
    Object.assign(member, rest);
    if (rest.defaultResourceId === null) member.defaultResourceId = undefined;
    await member.save();
    return member;
  }

  static async deactivateMember(vendorId: Id, memberId: string) {
    const member = await this.getOwnedMember(vendorId, memberId);
    await this.assertNoUpcomingWork(member._id as Id);
    member.isActive = false;
    await member.save();
    await CrewAssignment.updateMany(
      { crewMemberId: member._id, kind: 'unavailable', active: true },
      { $set: { active: false, status: 'cancelled' } }
    );
  }

  private static async assertNoUpcomingWork(memberId: Id) {
    const upcoming = await CrewAssignment.exists({ crewMemberId: memberId, kind: 'event', active: true, date: { $gte: todayIST() } });
    if (upcoming) throw conflict('This crew member has upcoming assignments. Reassign them first.');
  }

  static async getMember(vendorId: Id, memberId: string, includeFinancials: boolean) {
    const member = await CrewMember.findOne({ _id: toObjectId(memberId, 'Crew member'), vendorId })
      .populate('defaultResourceId', 'name type')
      .lean();
    if (!member) throw notFound('Crew member');
    const upcoming = await CrewAssignment.find({ crewMemberId: member._id, active: true, date: { $gte: todayIST() } })
      .sort({ date: 1 })
      .limit(100)
      .populate('bookingId', 'bookingNumber title client.name status')
      .lean();
    const result: any = {
      ...member,
      upcoming: upcoming.map((a) => (includeFinancials ? a : { ...a, fee: undefined, payoutStatus: undefined })),
    };
    if (includeFinancials) {
      const payout = await CrewAssignment.aggregate([
        { $match: { crewMemberId: member._id, kind: 'event', status: { $nin: ['declined', 'cancelled'] }, fee: { $gt: 0 } } },
        { $group: { _id: '$payoutStatus', amount: { $sum: '$fee' }, count: { $sum: 1 } } },
      ]);
      result.payouts = Object.fromEntries(payout.map((p: any) => [p._id, { amount: p.amount, count: p.count }]));
    }
    return result;
  }

  // -------------------------------------------------------------------
  // Availability / unavailability
  // -------------------------------------------------------------------

  private static async describeBusy(blocking: ICrewAssignment[] | any[]) {
    const bookingIds = [...new Set(blocking.filter((b) => b.bookingId).map((b) => String(b.bookingId)))];
    const bookings = await VendorBooking.find({ _id: { $in: bookingIds } }).select('bookingNumber client.name events').lean();
    const map = new Map(bookings.map((b) => [String(b._id), b]));
    return blocking.map((b) => {
      const booking = b.bookingId ? map.get(String(b.bookingId)) : undefined;
      const event = booking?.events.find((e) => String(e._id) === String(b.bookingEventId));
      return {
        assignmentId: b._id,
        kind: b.kind,
        date: formatDateKey(b.date),
        slots: b.slots,
        bookingId: b.bookingId,
        bookingNumber: booking?.bookingNumber,
        clientName: booking?.client?.name,
        functionType: event?.functionType,
        reason: b.reason,
      };
    });
  }

  static async addUnavailability(
    vendorId: Id,
    memberId: string,
    data: { dates?: string[]; from?: string; to?: string; slot: BookingSlot; reason?: string },
    userId: string
  ) {
    const member = await this.getOwnedMember(vendorId, memberId);
    let dates: Date[] = (data.dates || []).map(toDateOnly);
    if (data.from && data.to) {
      const from = toDateOnly(data.from);
      const to = toDateOnly(data.to);
      if (to < from) throw badRequest('"to" must be on or after "from"');
      if ((to.getTime() - from.getTime()) / DAY_MS > 90) throw badRequest('Mark at most 90 days at a time');
      for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
    }
    dates = [...new Set(dates.map((d) => d.getTime()))].map((t) => new Date(t));
    if (!dates.length) throw badRequest('Provide dates or a from/to range');
    // Zod defaults aren't written back to req.body by validate(), so default here.
    const slots = expandSlot(data.slot || 'full_day');

    const clashes = await CrewAssignment.find({ crewMemberId: member._id, active: true, date: { $in: dates }, slots: { $in: slots } }).lean();
    if (clashes.length) {
      throw conflict(`${member.name} is already busy on some of these dates`, { code: 'CREW_CONFLICT', conflicts: await this.describeBusy(clashes) });
    }
    try {
      return await CrewAssignment.insertMany(
        dates.map((date) => ({ vendorId, crewMemberId: member._id, kind: 'unavailable', date, slots, reason: data.reason, createdBy: userId }))
      );
    } catch (err) {
      if (isDup(err)) throw conflict(`${member.name} was just assigned on one of these dates`, { code: 'CREW_CONFLICT' });
      throw err;
    }
  }

  static async removeUnavailability(vendorId: Id, entryId: string) {
    const entry = await CrewAssignment.findOneAndDelete({ _id: toObjectId(entryId, 'Entry'), vendorId, kind: 'unavailable' });
    if (!entry) throw notFound('Unavailability entry');
  }

  /** Who is free on a date/slot — for picking crew for an event. */
  static async availability(vendorId: Id, date: string, slot: BookingSlot = 'full_day', skill?: string) {
    const day = toDateOnly(date);
    const slots = expandSlot(slot);
    const filter: any = { vendorId, isActive: true };
    if (skill) filter.skills = skill;
    const members = await CrewMember.find(filter).sort({ name: 1 }).lean();
    const busy = await CrewAssignment.find({ vendorId, active: true, date: day, crewMemberId: { $in: members.map((m) => m._id) } }).lean();
    const described = await this.describeBusy(busy);

    return {
      date: formatDateKey(day),
      slot,
      members: members.map((m) => {
        const mine = described.filter((_, i) => String(busy[i].crewMemberId) === String(m._id));
        const blocking = mine.filter((b) => b.slots.some((s: AtomicSlot) => slots.includes(s)));
        return {
          crewMemberId: m._id,
          name: m.name,
          phone: m.phone,
          role: m.role,
          skills: m.skills,
          type: m.type,
          defaultResourceId: m.defaultResourceId,
          status: blocking.length ? (blocking.some((b) => b.kind === 'unavailable') ? 'unavailable' : 'busy') : 'free',
          busyWith: mine,
        };
      }),
    };
  }

  // -------------------------------------------------------------------
  // Assignments
  // -------------------------------------------------------------------

  static async loadEvent(vendorId: Id, bookingId: string, eventId: string, requireActive = true) {
    const booking = await VendorBooking.findOne({ _id: toObjectId(bookingId, 'Booking'), vendorId });
    if (!booking) throw notFound('Booking');
    const event = booking.events.find((e) => String(e._id) === eventId);
    if (!event) throw notFound('Event');
    if (requireActive && !ACTIVE_BOOKING_STATUSES.includes(booking.status)) {
      throw badRequest(`Crew can't be assigned to a ${booking.status} booking`);
    }
    return { booking, event };
  }

  static async listForEvent(vendorId: Id, bookingId: string, eventId: string, includeFinancials: boolean) {
    const { event } = await this.loadEvent(vendorId, bookingId, eventId, false);
    const assignments = await CrewAssignment.find({ vendorId, bookingEventId: event._id, kind: 'event' })
      .sort({ active: -1, callTime: 1 })
      .populate('crewMemberId', 'name phone role skills type')
      .lean();
    return assignments.map((a) => (includeFinancials ? a : { ...a, fee: undefined, payoutStatus: undefined, paidAt: undefined }));
  }

  static async assign(vendorId: Id, bookingId: string, eventId: string, items: AssignInput[], userId: string, includeFinancials: boolean) {
    const { booking, event } = await this.loadEvent(vendorId, bookingId, eventId);
    if (!items.length) throw badRequest('Pick at least one crew member');
    const ids = items.map((i) => i.crewMemberId);
    if (new Set(ids).size !== ids.length) throw badRequest('The same crew member is listed twice');

    const members = await CrewMember.find({ _id: { $in: ids.map((id) => toObjectId(id, 'Crew member')) }, vendorId, isActive: true });
    if (members.length !== ids.length) throw badRequest('One or more crew members are invalid or inactive');
    const memberMap = new Map(members.map((m) => [String(m._id), m]));

    const already = await CrewAssignment.find({ bookingEventId: event._id, crewMemberId: { $in: members.map((m) => m._id) }, active: true }).lean();
    if (already.length) {
      const names = already.map((a) => memberMap.get(String(a.crewMemberId))?.name).join(', ');
      throw badRequest(`Already assigned to this event: ${names}`);
    }

    const slots = expandSlot(event.slot);
    const clashes = await CrewAssignment.find({ crewMemberId: { $in: members.map((m) => m._id) }, active: true, date: event.date, slots: { $in: slots } }).lean();
    if (clashes.length) {
      const details = (await this.describeBusy(clashes)).map((d, i) => ({ ...d, crewMemberId: clashes[i].crewMemberId, name: memberMap.get(String(clashes[i].crewMemberId))?.name }));
      throw conflict('Some crew members are not free for this event', { code: 'CREW_CONFLICT', conflicts: details });
    }

    const created: ICrewAssignment[] = [];
    try {
      for (const item of items) {
        const member = memberMap.get(item.crewMemberId)!;
        created.push(
          await CrewAssignment.create({
            vendorId,
            crewMemberId: member._id,
            kind: 'event',
            bookingId: booking._id,
            bookingEventId: event._id,
            date: event.date,
            slots,
            role: item.role || member.role,
            callTime: item.callTime,
            // Unset = use the event's venue at send time (it may still change).
            reportingLocation: item.reportingLocation,
            fee: includeFinancials ? (item.fee ?? member.defaultRate) : member.defaultRate,
            notes: item.notes,
            createdBy: userId,
          })
        );
      }
    } catch (err) {
      await CrewAssignment.deleteMany({ _id: { $in: created.map((c) => c._id) } });
      if (isDup(err)) throw conflict('A crew member was just booked elsewhere for this slot — refresh and try again', { code: 'CREW_CONFLICT' });
      throw err;
    }

    await VendorNotifyService.logActivity({
      vendorId,
      bookingId: booking._id as Id,
      clientId: booking.clientId,
      type: 'crew_assigned',
      text: `Crew for ${event.functionType} (${formatDisplayDate(event.date)}): ${members.map((m) => m.name).join(', ')}`,
      meta: { bookingEventId: event._id, crewMemberIds: members.map((m) => m._id) },
      createdBy: userId,
    });
    for (const member of members.filter((m) => m.vendorUserId)) {
      await VendorNotifyService.notify({
        vendorId,
        vendorUserId: member.vendorUserId,
        type: 'crew_assigned',
        title: `New assignment: ${event.functionType} on ${formatDisplayDate(event.date)}`,
        body: `${booking.client.name}${event.venue ? ` · ${event.venue}` : ''}`,
        entityType: 'crew_assignment',
        entityId: created.find((c) => String(c.crewMemberId) === String(member._id))?._id as Id,
      });
    }

    return created.map((c) => (includeFinancials ? c.toObject() : { ...c.toObject(), fee: undefined }));
  }

  /**
   * "Assign default team": every active member whose defaultResourceId is
   * one of the resources allocated to this event, skipping anyone already
   * assigned or busy elsewhere (returned so the vendor can swap them).
   */
  static async assignDefaultTeam(vendorId: Id, bookingId: string, eventId: string, userId: string, includeFinancials: boolean) {
    const { event } = await this.loadEvent(vendorId, bookingId, eventId);
    const resourceIds = event.resourceAllocations.map((a) => a.resourceId);
    if (!resourceIds.length) throw badRequest('This event has no resource allocated — assign a team/crew resource first');

    const members = await CrewMember.find({ vendorId, isActive: true, defaultResourceId: { $in: resourceIds } });
    if (!members.length) throw badRequest('No crew members have these resources as their default team');

    const slots = expandSlot(event.slot);
    const occupied = await CrewAssignment.find({ crewMemberId: { $in: members.map((m) => m._id) }, active: true, date: event.date, slots: { $in: slots } }).lean();
    const occupiedIds = new Set(occupied.map((o) => String(o.crewMemberId)));
    const free = members.filter((m) => !occupiedIds.has(String(m._id)));
    const skipped = members
      .filter((m) => occupiedIds.has(String(m._id)))
      .map((m) => {
        const o = occupied.find((x) => String(x.crewMemberId) === String(m._id))!;
        return { crewMemberId: m._id, name: m.name, reason: String(o.bookingEventId) === String(event._id) ? 'already assigned' : o.kind === 'unavailable' ? 'unavailable' : 'busy at another event' };
      });

    const assigned = free.length
      ? await this.assign(vendorId, bookingId, eventId, free.map((m) => ({ crewMemberId: String(m._id) })), userId, includeFinancials)
      : [];
    return { assigned, skipped };
  }

  static async getOwnedAssignment(vendorId: Id, assignmentId: string) {
    const a = await CrewAssignment.findOne({ _id: toObjectId(assignmentId, 'Assignment'), vendorId, kind: 'event' });
    if (!a) throw notFound('Assignment');
    return a;
  }

  static async updateAssignment(vendorId: Id, assignmentId: string, data: any, includeFinancials: boolean) {
    const a = await this.getOwnedAssignment(vendorId, assignmentId);
    if (data.fee !== undefined && !includeFinancials) throw badRequest('You do not have permission to edit crew fees');
    for (const f of ['role', 'callTime', 'reportingLocation', 'notes', 'fee'] as const) {
      if (data[f] !== undefined) (a as any)[f] = data[f];
    }
    await a.save();
    return includeFinancials ? a : { ...a.toObject(), fee: undefined };
  }

  static async removeAssignment(vendorId: Id, assignmentId: string, userId: string) {
    const a = await this.getOwnedAssignment(vendorId, assignmentId);
    if (a.payoutStatus === 'paid') throw badRequest('This assignment has a recorded payout — it cannot be removed');
    await a.deleteOne();
    const member = await CrewMember.findById(a.crewMemberId).select('name').lean();
    await VendorNotifyService.logActivity({
      vendorId,
      bookingId: a.bookingId,
      type: 'crew_unassigned',
      text: `${member?.name || 'Crew member'} removed from ${formatDisplayDate(a.date)}`,
      createdBy: userId,
    });
    await RunSheet.updateOne({ bookingEventId: a.bookingEventId }, { $pull: { 'items.$[].crewMemberIds': a.crewMemberId } });
  }

  /**
   * Confirm / decline — by the crew member themselves (role 'crew', must be
   * their own assignment) or by a manager on their behalf.
   */
  static async respond(
    vendorId: Id,
    assignmentId: string,
    data: { response: 'confirm' | 'decline'; reason?: string },
    actor: { vendorUserId: string; role: string }
  ) {
    const a = await this.getOwnedAssignment(vendorId, assignmentId);
    const member = await CrewMember.findById(a.crewMemberId);
    if (actor.role === 'crew' && String(member?.vendorUserId) !== actor.vendorUserId) throw notFound('Assignment');
    if (!a.active && a.status !== 'declined') throw badRequest(`This assignment is ${a.status}`);

    if (data.response === 'confirm') {
      if (!a.active) {
        // Re-accepting after a decline: slot must still be free.
        try {
          a.active = true;
          a.status = 'confirmed';
          await a.save();
        } catch (err) {
          if (isDup(err)) throw conflict('You are now busy elsewhere in this slot', { code: 'CREW_CONFLICT' });
          throw err;
        }
      } else {
        a.status = 'confirmed';
      }
      a.declineReason = undefined;
    } else {
      a.status = 'declined';
      a.active = false;
      a.declineReason = data.reason;
    }
    a.respondedAt = new Date();
    await a.save();

    if (data.response === 'decline') {
      await VendorNotifyService.notify({
        vendorId,
        type: 'crew_declined',
        title: `${member?.name || 'Crew member'} declined ${formatDisplayDate(a.date)}`,
        body: data.reason || 'Find a replacement',
        entityType: 'booking',
        entityId: a.bookingId,
      });
    }
    return a;
  }

  /** The logged-in crew member's own schedule (role 'crew'). */
  static async myAssignments(vendorId: Id, vendorUserId: string, from?: string, to?: string) {
    const member = await CrewMember.findOne({ vendorId, vendorUserId: new mongoose.Types.ObjectId(vendorUserId) }).lean();
    if (!member) return { member: null, assignments: [] };
    const start = from ? toDateOnly(from) : todayIST();
    const end = to ? toDateOnly(to) : addDays(start, 60);
    const assignments = await CrewAssignment.find({
      crewMemberId: member._id,
      kind: 'event',
      status: { $nin: ['cancelled'] },
      date: { $gte: start, $lte: end },
    })
      .sort({ date: 1, callTime: 1 })
      .lean();

    const bookings = await VendorBooking.find({ _id: { $in: assignments.map((a) => a.bookingId) } })
      .select('bookingNumber title client.name events')
      .lean();
    const sheets = await RunSheet.find({ bookingEventId: { $in: assignments.map((a) => a.bookingEventId) } }).lean();
    const bmap = new Map(bookings.map((b) => [String(b._id), b]));
    const smap = new Map(sheets.map((s) => [String(s.bookingEventId), s]));

    return {
      member: { _id: member._id, name: member.name, role: member.role },
      assignments: assignments.map((a) => {
        const booking = bmap.get(String(a.bookingId));
        const event = booking?.events.find((e) => String(e._id) === String(a.bookingEventId));
        const sheet = smap.get(String(a.bookingEventId));
        return {
          _id: a._id,
          status: a.status,
          role: a.role,
          callTime: a.callTime,
          reportingLocation: a.reportingLocation,
          notes: a.notes,
          date: formatDateKey(a.date),
          bookingNumber: booking?.bookingNumber,
          clientName: booking?.client?.name,
          event: event && { functionType: event.functionType, slot: event.slot, startTime: event.startTime, endTime: event.endTime, venue: event.venue, city: event.city },
          runSheet: sheet?.items.filter((i) => !i.crewMemberIds.length || i.crewMemberIds.some((c) => String(c) === String(member._id))),
          runSheetToken: sheet?.shareToken,
        };
      }),
    };
  }

  // -------------------------------------------------------------------
  // Keeping assignments in step with the booking
  // -------------------------------------------------------------------

  /** Booking cancelled / hold expired → free every crew member on it. */
  static async releaseBooking(bookingId: Id) {
    await CrewAssignment.updateMany({ bookingId, kind: 'event', active: true }, { $set: { active: false, status: 'cancelled' } });
  }

  /**
   * After a booking's events are edited: drop assignments whose event was
   * removed, and move the rest to the event's new date/slot. If a crew
   * member is busy at the new time, their assignment is parked as
   * `needs_reassign` (inactive) and the vendor is notified.
   */
  static async syncWithBooking(booking: IVendorBooking) {
    try {
      if (booking.status === 'cancelled') return this.releaseBooking(booking._id as Id);
      const assignments = await CrewAssignment.find({ bookingId: booking._id, kind: 'event', status: { $nin: ['cancelled', 'declined'] } });
      const eventMap = new Map<string, IBookingEvent>(booking.events.map((e) => [String(e._id), e]));

      const removedEventIds = new Set<string>();
      let needsReassign = 0;
      for (const a of assignments) {
        const event = eventMap.get(String(a.bookingEventId));
        if (!event) {
          removedEventIds.add(String(a.bookingEventId));
          if (a.payoutStatus === 'paid') {
            a.active = false;
            a.status = 'cancelled';
            await a.save();
          } else {
            await a.deleteOne();
          }
          continue;
        }
        const slots = expandSlot(event.slot);
        const moved = a.date.getTime() !== event.date.getTime() || a.slots.join() !== slots.join();
        if (!moved && a.status !== 'needs_reassign') continue;
        a.date = event.date;
        a.slots = slots;
        a.active = true;
        if (a.status === 'needs_reassign') a.status = 'assigned';
        try {
          await a.save();
        } catch (err) {
          if (!isDup(err)) throw err;
          a.active = false;
          a.status = 'needs_reassign';
          await a.save();
          needsReassign++;
        }
      }

      if (removedEventIds.size) await RunSheet.deleteMany({ bookingEventId: { $in: [...removedEventIds] } });
      // Run sheets follow their event's date.
      for (const event of booking.events) {
        await RunSheet.updateOne({ bookingEventId: event._id }, { $set: { date: event.date, functionType: event.functionType } });
      }

      if (needsReassign) {
        await VendorNotifyService.notify({
          vendorId: booking.vendorId,
          type: 'crew_needs_reassign',
          title: `${needsReassign} crew assignment(s) need reassigning`,
          body: `${booking.bookingNumber}: dates changed and some crew are busy at the new time`,
          entityType: 'booking',
          entityId: booking._id as Id,
        });
      }
    } catch (error) {
      logger.error(`Vendor OS: failed to sync crew for booking ${booking._id}`, error);
    }
  }

  // -------------------------------------------------------------------
  // Payouts (freelancer fees per assignment)
  // -------------------------------------------------------------------

  static async payouts(vendorId: Id, q: { from?: string; to?: string; crewMemberId?: string; status?: string }) {
    // Totals and the per-member summary cover every payout status; `status`
    // only narrows the returned rows (the list's To pay / Paid tabs).
    const filter: any = { vendorId, kind: 'event', status: { $nin: ['declined', 'cancelled'] }, fee: { $gt: 0 } };
    if (q.crewMemberId) filter.crewMemberId = toObjectId(q.crewMemberId, 'Crew member');
    if (q.from || q.to) {
      filter.date = {};
      if (q.from) filter.date.$gte = toDateOnly(q.from);
      if (q.to) filter.date.$lte = toDateOnly(q.to);
    }
    const items = await CrewAssignment.find(filter)
      .sort({ date: -1 })
      .limit(1000)
      .populate('crewMemberId', 'name phone type')
      .populate('bookingId', 'bookingNumber client.name')
      .lean();

    const byMember = new Map<string, { crewMemberId: any; name: string; total: number; paid: number; unpaid: number; count: number }>();
    for (const a of items as any[]) {
      const key = String(a.crewMemberId?._id);
      const row = byMember.get(key) || { crewMemberId: a.crewMemberId?._id, name: a.crewMemberId?.name, total: 0, paid: 0, unpaid: 0, count: 0 };
      row.total = round2(row.total + a.fee);
      row.count += 1;
      if (a.payoutStatus === 'paid') row.paid = round2(row.paid + a.fee);
      else row.unpaid = round2(row.unpaid + a.fee);
      byMember.set(key, row);
    }
    const summary = [...byMember.values()].sort((x, y) => y.unpaid - x.unpaid);
    const rows = q.status ? items.filter((a: any) => (a.payoutStatus || 'unpaid') === q.status) : items;
    return {
      items: rows.map((a: any) => ({ ...a, date: formatDateKey(a.date) })),
      summary,
      totals: {
        total: round2(summary.reduce((s, r) => s + r.total, 0)),
        paid: round2(summary.reduce((s, r) => s + r.paid, 0)),
        unpaid: round2(summary.reduce((s, r) => s + r.unpaid, 0)),
      },
    };
  }

  static async markPaid(vendorId: Id, data: { assignmentIds: string[]; mode?: string; reference?: string; paid?: boolean }) {
    const ids = data.assignmentIds.map((id) => toObjectId(id, 'Assignment'));
    const paid = data.paid !== false;
    const result = await CrewAssignment.updateMany(
      { _id: { $in: ids }, vendorId, kind: 'event' },
      paid
        ? { $set: { payoutStatus: 'paid', paidAt: new Date(), payoutMode: data.mode, payoutReference: data.reference } }
        : { $set: { payoutStatus: 'unpaid' }, $unset: { paidAt: 1, payoutMode: 1, payoutReference: 1 } }
    );
    if (result.matchedCount !== ids.length) throw notFound('One or more assignments');
    return { updated: result.modifiedCount };
  }

  static memberLabel(member?: Pick<ICrewMember, 'name' | 'role'> | null) {
    return member ? `${member.name}${member.role ? ` (${member.role})` : ''}` : '';
  }
}
