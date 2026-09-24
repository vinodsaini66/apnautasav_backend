import crypto from 'crypto';
import mongoose from 'mongoose';
import { RunSheet, IRunSheet } from '../../models/vendor-os/run-sheet.model';
import { CrewAssignment } from '../../models/vendor-os/crew-assignment.model';
import { CrewMember } from '../../models/vendor-os/crew-member.model';
import { VendorBooking } from '../../models/vendor-os/vendor-booking.model';
import { VendorUser } from '../../models/vendor-os/vendor-user.model';
import { WeddingVendor } from '../../models/wedding-vendor.model';
import { VendorCrewService } from './crew.service';
import { VendorWhatsAppService } from './whatsapp.service';
import { VendorNotifyService } from './vendor-notify.service';
import { ACTIVE_BOOKING_STATUSES } from '../../constants/vendorOs';
import { VENDOR_OS_PUBLIC_URL, badRequest, formatDateKey, formatDisplayDate, notFound, toDateOnly, toObjectId } from '../../utils/vendorOs';

type Id = mongoose.Types.ObjectId;

// Phase 2 "Event-day timeline & run sheet" + crew call sheets (spec section
// 6). A run sheet is the minute-by-minute plan for one booking event; a
// call sheet is generated on demand from the booking event + its crew
// assignments + the run sheet, and sent to each crew member on WhatsApp.

// Starting points by function type — the vendor edits from here.
const RUN_SHEET_TEMPLATES: Record<string, { time: string; title: string }[]> = {
  haldi: [
    { time: '08:30', title: 'Crew call time & setup' },
    { time: '10:00', title: 'Haldi ceremony begins' },
    { time: '11:30', title: 'Family photos' },
    { time: '12:30', title: 'Wrap-up' },
  ],
  mehendi: [
    { time: '10:30', title: 'Crew call time & setup' },
    { time: '12:00', title: 'Bridal mehendi begins' },
    { time: '13:30', title: 'Guest mehendi & lunch' },
    { time: '16:00', title: 'Games / dholki' },
    { time: '18:00', title: 'Wrap-up' },
  ],
  sangeet: [
    { time: '17:30', title: 'Crew call time, sound & light check' },
    { time: '19:30', title: 'Guests arrive' },
    { time: '20:00', title: 'Family performances' },
    { time: '21:30', title: 'Couple performance' },
    { time: '22:00', title: 'DJ opens the floor' },
    { time: '23:30', title: 'Wrap-up' },
  ],
  cocktail: [
    { time: '18:30', title: 'Crew call time & setup' },
    { time: '20:00', title: 'Guests arrive' },
    { time: '21:00', title: 'Couple entry' },
    { time: '23:30', title: 'Wrap-up' },
  ],
  baraat: [
    { time: '17:00', title: 'Crew call time' },
    { time: '18:00', title: 'Baraat assembles' },
    { time: '18:30', title: 'Baraat procession starts' },
    { time: '19:30', title: 'Arrival & milni' },
  ],
  pheras: [
    { time: '17:00', title: 'Crew call time & setup' },
    { time: '18:30', title: 'Baraat procession' },
    { time: '19:30', title: 'Milni & welcome' },
    { time: '20:30', title: 'Varmala' },
    { time: '21:30', title: 'Dinner' },
    { time: '23:00', title: 'Pheras' },
    { time: '02:00', title: 'Vidaai' },
  ],
  reception: [
    { time: '18:00', title: 'Crew call time & setup' },
    { time: '19:30', title: 'Guests arrive' },
    { time: '20:00', title: 'Couple entry' },
    { time: '20:30', title: 'Stage photos with guests' },
    { time: '21:30', title: 'Dinner' },
    { time: '23:30', title: 'Wrap-up' },
  ],
};
RUN_SHEET_TEMPLATES.wedding = RUN_SHEET_TEMPLATES.pheras;

const GENERIC_TEMPLATE = [
  { time: '16:00', title: 'Crew call time & setup' },
  { time: '19:00', title: 'Event begins' },
  { time: '23:00', title: 'Wrap-up' },
];

export const runSheetPublicUrl = (token: string) => `${VENDOR_OS_PUBLIC_URL}/run/${token}`;

interface RunSheetItemInput {
  _id?: string;
  time: string;
  endTime?: string;
  title: string;
  description?: string;
  location?: string;
  crewMemberIds?: string[];
  status?: 'pending' | 'in_progress' | 'done' | 'skipped';
}

const byTime = (a: { time: string }, b: { time: string }) => a.time.localeCompare(b.time);

export class VendorCallSheetService {
  // -------------------------------------------------------------------
  // Run sheet (event-day timeline)
  // -------------------------------------------------------------------

  static templateFor(functionType: string) {
    return (RUN_SHEET_TEMPLATES[functionType.toLowerCase()] || GENERIC_TEMPLATE).map((i) => ({ ...i, crewMemberIds: [], status: 'pending' as const }));
  }

  static async getRunSheet(vendorId: Id, bookingId: string, eventId: string) {
    const { event } = await VendorCrewService.loadEvent(vendorId, bookingId, eventId, false);
    const sheet = await RunSheet.findOne({ vendorId, bookingEventId: event._id })
      .populate('items.crewMemberIds', 'name role phone')
      .lean();
    return sheet ? { ...sheet, publicUrl: runSheetPublicUrl(sheet.shareToken) } : null;
  }

  private static async validateCrew(vendorId: Id, items: RunSheetItemInput[]) {
    const ids = [...new Set(items.flatMap((i) => i.crewMemberIds || []))];
    if (!ids.length) return;
    const count = await CrewMember.countDocuments({ _id: { $in: ids.map((id) => toObjectId(id, 'Crew member')) }, vendorId });
    if (count !== ids.length) throw badRequest('Run sheet items reference unknown crew members');
  }

  /** Creates the run sheet if missing (optionally from the function's template). */
  static async ensureRunSheet(vendorId: Id, bookingId: string, eventId: string, useTemplate = true): Promise<IRunSheet> {
    const { booking, event } = await VendorCrewService.loadEvent(vendorId, bookingId, eventId, false);
    const existing = await RunSheet.findOne({ bookingEventId: event._id });
    if (existing) return existing;
    try {
      return await RunSheet.create({
        vendorId,
        bookingId: booking._id,
        bookingEventId: event._id,
        functionType: event.functionType,
        date: event.date,
        items: useTemplate ? this.templateFor(event.functionType) : [],
        shareToken: crypto.randomBytes(16).toString('hex'),
      });
    } catch (err: any) {
      if (err?.code === 11000) return (await RunSheet.findOne({ bookingEventId: event._id }))!;
      throw err;
    }
  }

  /** Replace the timeline (items are kept sorted by time). */
  static async saveRunSheet(
    vendorId: Id,
    bookingId: string,
    eventId: string,
    data: { items?: RunSheetItemInput[]; notes?: string; useTemplate?: boolean },
    userId: string
  ) {
    const sheet = await this.ensureRunSheet(vendorId, bookingId, eventId, data.useTemplate ?? !data.items);
    if (data.items) {
      await this.validateCrew(vendorId, data.items);
      sheet.items = data.items
        .map((i) => ({
          _id: i._id && mongoose.Types.ObjectId.isValid(i._id) ? new mongoose.Types.ObjectId(i._id) : new mongoose.Types.ObjectId(),
          time: i.time,
          endTime: i.endTime,
          title: i.title,
          description: i.description,
          location: i.location,
          crewMemberIds: (i.crewMemberIds || []).map((id) => new mongoose.Types.ObjectId(id)),
          status: i.status || 'pending',
        }))
        .sort(byTime) as any;
    }
    if (data.notes !== undefined) sheet.notes = data.notes;
    sheet.updatedBy = new mongoose.Types.ObjectId(userId);
    await sheet.save();
    return { ...sheet.toObject(), publicUrl: runSheetPublicUrl(sheet.shareToken) };
  }

  /** On the day: tick items off (done / in progress / skipped). */
  static async updateItemStatus(vendorId: Id, bookingId: string, eventId: string, itemId: string, status: 'pending' | 'in_progress' | 'done' | 'skipped') {
    const { event } = await VendorCrewService.loadEvent(vendorId, bookingId, eventId, false);
    const sheet = await RunSheet.findOne({ vendorId, bookingEventId: event._id });
    if (!sheet) throw notFound('Run sheet');
    const item = sheet.items.find((i) => String(i._id) === itemId);
    if (!item) throw notFound('Run sheet item');
    item.status = status;
    item.completedAt = status === 'done' ? new Date() : undefined;
    await sheet.save();
    return sheet;
  }

  static async deleteRunSheet(vendorId: Id, bookingId: string, eventId: string) {
    const { event } = await VendorCrewService.loadEvent(vendorId, bookingId, eventId, false);
    const result = await RunSheet.deleteOne({ vendorId, bookingEventId: event._id });
    if (!result.deletedCount) throw notFound('Run sheet');
  }

  /** Share the timeline with the family: public link + WhatsApp message. */
  static async shareRunSheet(vendorId: Id, bookingId: string, eventId: string, userId: string, language?: 'en' | 'hi' | 'hinglish') {
    const { booking, event } = await VendorCrewService.loadEvent(vendorId, bookingId, eventId, false);
    const sheet = await this.ensureRunSheet(vendorId, bookingId, eventId);
    sheet.sharedWithClient = true;
    sheet.lastSharedAt = new Date();
    await sheet.save();

    const whatsapp = await VendorWhatsAppService.compose(vendorId, userId, {
      templateKey: 'run_sheet_share',
      language,
      bookingId: String(booking._id),
      log: false,
      variables: {
        functionType: event.functionType,
        eventDate: formatDisplayDate(event.date),
        runSheetLink: runSheetPublicUrl(sheet.shareToken),
        runSheetSummary: sheet.items.map((i) => `• ${i.time} — ${i.title}`).join('\n'),
      },
    });
    await VendorNotifyService.logActivity({
      vendorId,
      bookingId: booking._id as Id,
      clientId: booking.clientId,
      type: 'run_sheet_shared',
      channel: 'whatsapp',
      direction: 'outbound',
      text: `Event-day schedule for ${event.functionType} shared with the client`,
      createdBy: userId,
    });
    return { publicUrl: runSheetPublicUrl(sheet.shareToken), whatsapp };
  }

  // -------------------------------------------------------------------
  // Call sheets
  // -------------------------------------------------------------------

  private static async managerContacts(vendorId: Id) {
    const [vendor, managers] = await Promise.all([
      WeddingVendor.findById(vendorId).select('businessName phone whatsappNumber email gstNumber location').lean(),
      VendorUser.find({ vendorId, status: { $ne: 'disabled' }, role: { $in: ['owner', 'manager'] } }).select('name phone role').lean(),
    ]);
    return { vendor: vendor!, managers };
  }

  /** Everything the crew needs for one booking event. */
  static async buildCallSheet(vendorId: Id, bookingId: string, eventId: string) {
    const { booking, event } = await VendorCrewService.loadEvent(vendorId, bookingId, eventId, false);
    const [assignments, sheet, contacts] = await Promise.all([
      CrewAssignment.find({ bookingEventId: event._id, kind: 'event', active: true }).populate('crewMemberId', 'name phone role').sort({ callTime: 1 }).lean(),
      RunSheet.findOne({ bookingEventId: event._id }).populate('items.crewMemberIds', 'name').lean(),
      this.managerContacts(vendorId),
    ]);
    return {
      vendor: { businessName: contacts.vendor.businessName, phone: contacts.vendor.whatsappNumber || contacts.vendor.phone },
      managers: contacts.managers.map((m) => ({ name: m.name, phone: m.phone, role: m.role })),
      booking: { _id: booking._id, bookingNumber: booking.bookingNumber, title: booking.title, status: booking.status },
      client: { name: booking.client.name, phone: booking.client.phone },
      event: {
        _id: event._id,
        functionType: event.functionType,
        date: formatDateKey(event.date),
        slot: event.slot,
        startTime: event.startTime,
        endTime: event.endTime,
        venue: event.venue,
        city: event.city,
        guestCount: event.guestCount,
        notes: event.notes,
      },
      crew: assignments.map((a: any) => ({
        assignmentId: a._id,
        crewMemberId: a.crewMemberId?._id,
        name: a.crewMemberId?.name,
        phone: a.crewMemberId?.phone,
        role: a.role || a.crewMemberId?.role,
        callTime: a.callTime,
        reportingLocation: a.reportingLocation,
        status: a.status,
        notifiedAt: a.notifiedAt,
        notes: a.notes,
      })),
      runSheet: sheet
        ? { items: sheet.items, notes: sheet.notes, publicUrl: runSheetPublicUrl(sheet.shareToken) }
        : null,
      generatedAt: new Date(),
    };
  }

  /**
   * The event-day board: every live booking event on a date with its crew
   * and timeline — the vendor's "what's happening today" view. Crew
   * members (role 'crew') see only events they're assigned to.
   */
  static async daySheet(vendorId: Id, date: string, crewVendorUserId?: string) {
    const day = toDateOnly(date);
    let eventFilter: Set<string> | null = null;
    if (crewVendorUserId) {
      const member = await CrewMember.findOne({ vendorId, vendorUserId: new mongoose.Types.ObjectId(crewVendorUserId) }).select('_id').lean();
      const mine = member ? await CrewAssignment.find({ crewMemberId: member._id, kind: 'event', active: true, date: day }).select('bookingEventId').lean() : [];
      eventFilter = new Set(mine.map((a) => String(a.bookingEventId)));
    }

    const bookings = await VendorBooking.find({ vendorId, status: { $in: [...ACTIVE_BOOKING_STATUSES, 'completed'] }, 'events.date': day })
      .select('_id events')
      .lean();
    const events = bookings.flatMap((b) =>
      b.events.filter((e) => e.date.getTime() === day.getTime()).map((e) => ({ bookingId: String(b._id), eventId: String(e._id), startTime: e.startTime || '' }))
    );
    const wanted = events.filter((e) => !eventFilter || eventFilter.has(e.eventId)).sort((a, b) => a.startTime.localeCompare(b.startTime));
    const sheets = await Promise.all(wanted.map((e) => this.buildCallSheet(vendorId, e.bookingId, e.eventId)));

    const crewIds = new Set(sheets.flatMap((s) => s.crew.map((c) => String(c.crewMemberId))));
    return {
      date: formatDateKey(day),
      events: crewVendorUserId ? sheets.map((s) => ({ ...s, client: { name: s.client.name } })) : sheets,
      totals: { events: sheets.length, crewOnDuty: crewIds.size, unconfirmed: sheets.flatMap((s) => s.crew).filter((c) => c.status === 'assigned').length },
    };
  }

  /**
   * One personalised WhatsApp message per crew member (their role, call
   * time, venue, run-sheet link). Returns a wa.me link each — the vendor
   * taps through them — and stamps `notifiedAt`.
   */
  static async shareCallSheet(
    vendorId: Id,
    bookingId: string,
    eventId: string,
    userId: string,
    opts: { crewMemberIds?: string[]; language?: 'en' | 'hi' | 'hinglish' }
  ) {
    const sheet = await this.buildCallSheet(vendorId, bookingId, eventId);
    const targets = opts.crewMemberIds?.length ? sheet.crew.filter((c) => opts.crewMemberIds!.includes(String(c.crewMemberId))) : sheet.crew;
    if (!targets.length) throw badRequest('No crew assigned to this event yet');

    const runSheet = await this.ensureRunSheet(vendorId, bookingId, eventId);
    const managerPhone = sheet.managers.find((m) => m.role === 'manager')?.phone || sheet.managers[0]?.phone || sheet.vendor.phone || '';
    const venue = [sheet.event.venue, sheet.event.city].filter(Boolean).join(', ') || 'TBC';

    const messages = [];
    for (const crew of targets) {
      const whatsapp = await VendorWhatsAppService.compose(vendorId, userId, {
        templateKey: 'call_sheet',
        language: opts.language,
        bookingId,
        phone: crew.phone,
        log: false,
        variables: {
          crewName: crew.name,
          crewRole: crew.role || 'Crew',
          callTime: crew.callTime || sheet.event.startTime || 'TBC',
          eventDate: formatDisplayDate(toDateOnly(sheet.event.date)),
          functionType: sheet.event.functionType,
          venue: crew.reportingLocation || venue,
          clientName: sheet.client.name,
          runSheetLink: runSheetPublicUrl(runSheet.shareToken),
          managerPhone,
        },
      });
      messages.push({ crewMemberId: crew.crewMemberId, name: crew.name, phone: crew.phone, waLink: whatsapp.waLink, message: whatsapp.message });
    }

    await CrewAssignment.updateMany(
      { _id: { $in: targets.map((t) => t.assignmentId) } },
      { $set: { notifiedAt: new Date() } }
    );
    const booking = await VendorBooking.findById(bookingId).select('clientId').lean();
    await VendorNotifyService.logActivity({
      vendorId,
      bookingId: toObjectId(bookingId),
      clientId: booking?.clientId,
      type: 'call_sheet_sent',
      channel: 'whatsapp',
      direction: 'outbound',
      text: `Call sheet for ${sheet.event.functionType} (${formatDisplayDate(toDateOnly(sheet.event.date))}) sent to ${targets.map((t) => t.name).join(', ')}`,
      createdBy: userId,
    });
    return { messages, runSheetUrl: runSheetPublicUrl(runSheet.shareToken) };
  }

  // -------------------------------------------------------------------
  // Public & family
  // -------------------------------------------------------------------

  /** Read-only timeline for the family and crew — no fees, no phone numbers. */
  static async publicRunSheet(token: string) {
    const sheet = await RunSheet.findOne({ shareToken: token }).populate('items.crewMemberIds', 'name role').lean();
    if (!sheet) throw notFound('Schedule');
    const [booking, vendor] = await Promise.all([
      VendorBooking.findById(sheet.bookingId).select('client.name events status').lean(),
      WeddingVendor.findById(sheet.vendorId).select('businessName logo slug').lean(),
    ]);
    if (!booking || booking.status === 'cancelled') throw notFound('Schedule');
    const event = booking.events.find((e) => String(e._id) === String(sheet.bookingEventId));
    return {
      vendor,
      clientName: booking.client.name,
      event: event && { functionType: event.functionType, date: formatDateKey(event.date), slot: event.slot, startTime: event.startTime, venue: event.venue, city: event.city },
      items: sheet.items.map((i: any) => ({
        _id: i._id,
        time: i.time,
        endTime: i.endTime,
        title: i.title,
        description: i.description,
        location: i.location,
        status: i.status,
        crew: (i.crewMemberIds || []).map((c: any) => ({ name: c.name, role: c.role })),
      })),
      notes: sheet.notes,
      updatedAt: sheet.updatedAt,
    };
  }

  /** Family app: vendor timelines the vendor has shared, for the family's day plan. */
  static async familyRunSheets(userId: string, weddingId?: string) {
    const filter: any = { familyUserId: new mongoose.Types.ObjectId(userId), status: { $ne: 'cancelled' } };
    if (weddingId) filter.weddingId = new mongoose.Types.ObjectId(weddingId);
    const bookings = await VendorBooking.find(filter).select('_id vendorId events').populate('vendorId', 'businessName osCategory').lean();
    const sheets = await RunSheet.find({ bookingId: { $in: bookings.map((b) => b._id) }, sharedWithClient: true }).sort({ date: 1 }).lean();
    const bmap = new Map(bookings.map((b) => [String(b._id), b]));
    return sheets.map((s) => {
      const b: any = bmap.get(String(s.bookingId));
      return {
        vendor: b?.vendorId,
        functionType: s.functionType,
        date: formatDateKey(s.date),
        items: s.items.map((i) => ({ time: i.time, endTime: i.endTime, title: i.title, location: i.location, status: i.status })),
        publicUrl: runSheetPublicUrl(s.shareToken),
      };
    });
  }
}
