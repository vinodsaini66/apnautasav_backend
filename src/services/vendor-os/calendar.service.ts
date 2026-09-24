import mongoose from 'mongoose';
import { VendorResource, IVendorResource } from '../../models/vendor-os/vendor-resource.model';
import { ResourceBlock, IResourceBlock } from '../../models/vendor-os/resource-block.model';
import { VendorBooking } from '../../models/vendor-os/vendor-booking.model';
import { WeddingVendor } from '../../models/wedding-vendor.model';
import { VendorUser } from '../../models/vendor-os/vendor-user.model';
import { CategoryConfigService } from './category-config.service';
import { assertWithinPlan } from './plan-limits';
import { AtomicSlot, ACTIVE_BOOKING_STATUSES, BookingSlot, expandSlot, ATOMIC_SLOTS } from '../../constants/vendorOs';
import { addDays, badRequest, conflict, formatDateKey, notFound, toDateOnly, toObjectId, DAY_MS } from '../../utils/vendorOs';

// The conflict engine (spec M2). Occupancy lives in ResourceBlock, one row
// per resource per half-day:
//   - exclusive resources (capacity 1): the DB unique index is the final
//     guard, so two simultaneous confirms can never both succeed;
//   - capacity resources (capacity > 1): units are summed per slot here,
//     then re-verified after insert to catch a concurrent write;
//   - soft blocks (setup day before, manual "tentative" notes) only warn.

type Id = mongoose.Types.ObjectId;

export interface BlockSpec {
  resourceId: Id;
  date: Date;
  slot: AtomicSlot;
  units: number;
  soft: boolean;
  bookingEventId?: Id;
}

export interface ConflictInfo {
  resourceId: string;
  resourceName: string;
  date: string;
  slot: AtomicSlot;
  reason: string;
  blockedBy?: { bookingId?: string; bookingNumber?: string; clientName?: string; manualReason?: string }[];
}

export interface EventLike {
  _id?: Id;
  date: Date | string;
  slot: BookingSlot;
  guestCount?: number;
  resourceAllocations?: { resourceId: Id | string; units?: number }[];
}

const MAX_RANGE_DAYS = 400;

export class CalendarService {
  // -------------------------------------------------------------------
  // Resources
  // -------------------------------------------------------------------

  static async listResources(vendorId: Id, includeInactive = false) {
    const filter: any = { vendorId };
    if (!includeInactive) filter.isActive = true;
    return VendorResource.find(filter).sort({ sortOrder: 1, createdAt: 1 }).lean();
  }

  private static async assertMember(vendorId: Id, memberId?: string | null) {
    if (!memberId) return;
    const ok = await VendorUser.exists({ _id: toObjectId(memberId, 'Team member'), vendorId, status: { $ne: 'disabled' } });
    if (!ok) throw badRequest('memberId must be one of your team members');
  }

  static async createResource(vendorId: Id, data: any) {
    await assertWithinPlan(vendorId, 'resources');
    await this.assertMember(vendorId, data.memberId);
    const type = data.type || (await this.defaultResourceType(vendorId));
    return VendorResource.create({ ...data, type, vendorId });
  }

  static async updateResource(vendorId: Id, resourceId: string, data: any) {
    const { vendorId: _v, ...rest } = data;
    const resource = await VendorResource.findOne({ _id: toObjectId(resourceId, 'Resource'), vendorId });
    if (!resource) throw notFound('Resource');
    await this.assertMember(vendorId, rest.memberId);

    if (rest.isActive === false && resource.isActive) await this.assertNoFutureBookings(resource._id as Id);
    if (rest.isActive === true && !resource.isActive) await assertWithinPlan(vendorId, 'resources');
    if (rest.capacity !== undefined && rest.capacity < resource.capacity) {
      // Shrinking capacity must not silently overbook existing dates.
      const over = await ResourceBlock.aggregate([
        { $match: { resourceId: resource._id, soft: false, date: { $gte: toDateOnly(new Date()) } } },
        { $group: { _id: { date: '$date', slot: '$slot' }, units: { $sum: '$units' } } },
        { $match: { units: { $gt: rest.capacity } } },
        { $limit: 1 },
      ]);
      if (over.length) throw conflict(`Existing bookings already use more than ${rest.capacity} on ${formatDateKey(over[0]._id.date)}`);
    }
    const wasExclusive = resource.capacity === 1;
    Object.assign(resource, rest);
    await resource.save();
    if (wasExclusive !== (resource.capacity === 1)) {
      await ResourceBlock.updateMany({ resourceId: resource._id }, { $set: { exclusive: resource.capacity === 1 } });
    }
    return resource;
  }

  static async deleteResource(vendorId: Id, resourceId: string) {
    const resource = await VendorResource.findOne({ _id: toObjectId(resourceId, 'Resource'), vendorId });
    if (!resource) throw notFound('Resource');
    await this.assertNoFutureBookings(resource._id as Id);
    resource.isActive = false;
    await resource.save();
    await ResourceBlock.deleteMany({ resourceId: resource._id, kind: 'manual' });
  }

  private static async assertNoFutureBookings(resourceId: Id) {
    const future = await ResourceBlock.exists({ resourceId, kind: 'booking', date: { $gte: toDateOnly(new Date()) } });
    if (future) throw conflict('This resource has upcoming bookings. Move them to another resource first.');
  }

  private static async defaultResourceType(vendorId: Id) {
    const vendor = await WeddingVendor.findById(vendorId).select('osCategory').lean();
    const config = vendor?.osCategory ? await CategoryConfigService.getByKey(vendor.osCategory).catch(() => null) : null;
    return config?.resourceType || 'crew';
  }

  private static async loadResources(vendorId: Id, ids: (Id | string)[]): Promise<Map<string, IVendorResource>> {
    const unique = [...new Set(ids.map(String))];
    const resources = await VendorResource.find({ _id: { $in: unique }, vendorId, isActive: true });
    if (resources.length !== unique.length) throw badRequest('One or more resources are invalid or inactive');
    return new Map(resources.map((r) => [String(r._id), r]));
  }

  // -------------------------------------------------------------------
  // Block specs & conflict checking
  // -------------------------------------------------------------------

  /**
   * Turns booking events into half-day block specs. Adds a soft block on
   * the day before each event when the vendor's category needs setup time
   * (decor), per spec 5.4.
   */
  static async buildSpecs(vendorId: Id, events: EventLike[], resources?: Map<string, IVendorResource>): Promise<BlockSpec[]> {
    const vendor = await WeddingVendor.findById(vendorId).select('osCategory').lean();
    const config = vendor?.osCategory ? await CategoryConfigService.getByKey(vendor.osCategory).catch(() => null) : null;
    const resourceMap =
      resources || (await this.loadResources(vendorId, events.flatMap((e) => (e.resourceAllocations || []).map((a) => a.resourceId))));

    const specs: BlockSpec[] = [];
    for (const event of events) {
      const date = toDateOnly(event.date);
      for (const alloc of event.resourceAllocations || []) {
        const resource = resourceMap.get(String(alloc.resourceId));
        if (!resource) throw badRequest('One or more resources are invalid or inactive');
        const units = resource.capacity === 1 ? 1 : Math.max(1, alloc.units || event.guestCount || 1);
        if (units > resource.capacity) {
          throw badRequest(`${resource.name} can take at most ${resource.capacity} (requested ${units})`);
        }
        for (const slot of expandSlot(event.slot)) {
          specs.push({ resourceId: resource._id as Id, date, slot, units, soft: false, bookingEventId: event._id });
        }
        if (config?.softBlockDayBefore) {
          for (const slot of ATOMIC_SLOTS) {
            specs.push({ resourceId: resource._id as Id, date: addDays(date, -1), slot, units, soft: true, bookingEventId: event._id });
          }
        }
      }
    }
    // A soft setup-day block on the same slot as one of this booking's own
    // hard blocks is redundant (two consecutive event days).
    const hardKeys = new Set(specs.filter((s) => !s.soft).map((s) => `${s.resourceId}|${s.date.getTime()}|${s.slot}`));
    return specs.filter((s) => !s.soft || !hardKeys.has(`${s.resourceId}|${s.date.getTime()}|${s.slot}`));
  }

  static async checkConflicts(
    vendorId: Id,
    specs: BlockSpec[],
    excludeBookingId?: Id | string
  ): Promise<{ conflicts: ConflictInfo[]; warnings: ConflictInfo[] }> {
    const conflicts: ConflictInfo[] = [];
    const warnings: ConflictInfo[] = [];
    if (!specs.length) return { conflicts, warnings };

    const resourceMap = await this.loadResources(vendorId, specs.map((s) => s.resourceId));
    const existing = await ResourceBlock.find({
      resourceId: { $in: [...resourceMap.keys()] },
      date: { $in: [...new Set(specs.map((s) => s.date.getTime()))].map((t) => new Date(t)) },
      ...(excludeBookingId ? { bookingId: { $ne: toObjectId(excludeBookingId) } } : {}),
    }).lean();

    const bookingIds = [...new Set(existing.filter((b) => b.bookingId).map((b) => String(b.bookingId)))];
    const bookings = await VendorBooking.find({ _id: { $in: bookingIds } }).select('bookingNumber client.name status').lean();
    const bookingMap = new Map(bookings.map((b) => [String(b._id), b]));

    const keyOf = (r: Id | string, d: Date, s: string) => `${r}|${d.getTime()}|${s}`;
    const byKey = new Map<string, typeof existing>();
    for (const block of existing) {
      const k = keyOf(block.resourceId, block.date, block.slot);
      byKey.set(k, [...(byKey.get(k) || []), block]);
    }

    const describe = (blocks: typeof existing) =>
      blocks.map((b) => {
        const booking = b.bookingId ? bookingMap.get(String(b.bookingId)) : undefined;
        return {
          bookingId: b.bookingId ? String(b.bookingId) : undefined,
          bookingNumber: booking?.bookingNumber,
          clientName: booking?.client?.name,
          manualReason: b.manualReason,
        };
      });

    // Units requested per key by this batch (a booking can put two events on
    // the same capacity resource/slot).
    const requested = new Map<string, number>();
    for (const spec of specs.filter((s) => !s.soft)) {
      const k = keyOf(spec.resourceId, spec.date, spec.slot);
      requested.set(k, (requested.get(k) || 0) + spec.units);
    }

    const seen = new Set<string>();
    for (const spec of specs) {
      const k = keyOf(spec.resourceId, spec.date, spec.slot);
      const dedupeKey = `${k}|${spec.soft}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const resource = resourceMap.get(String(spec.resourceId))!;
      const blocks = byKey.get(k) || [];
      const hard = blocks.filter((b) => !b.soft);
      const soft = blocks.filter((b) => b.soft);
      const base = { resourceId: String(resource._id), resourceName: resource.name, date: formatDateKey(spec.date), slot: spec.slot };

      if (spec.soft) {
        if (hard.length) warnings.push({ ...base, reason: 'Setup/buffer day overlaps another booking', blockedBy: describe(hard) });
        continue;
      }

      if (resource.capacity === 1) {
        if (hard.length) conflicts.push({ ...base, reason: `${resource.name} is already booked`, blockedBy: describe(hard) });
      } else {
        const used = hard.reduce((sum, b) => sum + b.units, 0);
        const want = requested.get(k) || spec.units;
        if (used + want > resource.capacity) {
          conflicts.push({
            ...base,
            reason: `${resource.name}: only ${Math.max(resource.capacity - used, 0)} of ${resource.capacity} left (need ${want})`,
            blockedBy: describe(hard),
          });
        }
      }
      if (soft.length) warnings.push({ ...base, reason: `${resource.name} has a soft block (setup/buffer)`, blockedBy: describe(soft) });
    }

    return { conflicts, warnings };
  }

  /**
   * Replaces a booking's calendar blocks with `specs`. Throws 409 with the
   * conflict list if any hard block collides; on a race (unique index or
   * capacity re-check) the previous blocks are restored.
   */
  static async applyBookingBlocks(vendorId: Id, bookingId: Id, specs: BlockSpec[], createdBy?: Id | string) {
    const { conflicts, warnings } = await this.checkConflicts(vendorId, specs, bookingId);
    if (conflicts.length) throw conflict('Double booking: the selected resources are not free', { code: 'BOOKING_CONFLICT', conflicts, warnings });

    const resourceMap = specs.length ? await this.loadResources(vendorId, specs.map((s) => s.resourceId)) : new Map();
    const previous = await ResourceBlock.find({ bookingId }).lean();
    await ResourceBlock.deleteMany({ bookingId });

    const docs = specs.map((s) => ({
      vendorId,
      resourceId: s.resourceId,
      date: s.date,
      slot: s.slot,
      units: s.units,
      soft: s.soft,
      exclusive: resourceMap.get(String(s.resourceId))?.capacity === 1,
      kind: 'booking' as const,
      bookingId,
      bookingEventId: s.bookingEventId,
      createdBy,
    }));

    const restore = async () => {
      await ResourceBlock.deleteMany({ bookingId });
      if (previous.length) await ResourceBlock.insertMany(previous.map(({ _id, ...rest }) => rest));
    };

    try {
      if (docs.length) await ResourceBlock.insertMany(docs, { ordered: true });
    } catch (err: any) {
      await restore();
      if (err?.code === 11000 || err?.writeErrors?.some?.((e: any) => e.code === 11000)) {
        throw conflict('Double booking: someone just booked one of these slots', { code: 'BOOKING_CONFLICT' });
      }
      throw err;
    }

    // Capacity race re-check (no DB constraint can express a SUM).
    const capacityKeys = docs.filter((d) => !d.exclusive && !d.soft);
    for (const d of capacityKeys) {
      const total = await ResourceBlock.aggregate([
        { $match: { resourceId: d.resourceId, date: d.date, slot: d.slot, soft: false } },
        { $group: { _id: null, units: { $sum: '$units' } } },
      ]);
      const capacity = resourceMap.get(String(d.resourceId))!.capacity;
      if ((total[0]?.units || 0) > capacity) {
        await restore();
        throw conflict('Double booking: capacity was just taken by another booking', { code: 'BOOKING_CONFLICT' });
      }
    }

    return { warnings };
  }

  static async releaseBookingBlocks(bookingId: Id) {
    await ResourceBlock.deleteMany({ bookingId });
  }

  /**
   * Picks a free resource for every event that has no allocation yet
   * (quote accepted from the family side carries dates but no crew/hall).
   * Events that can't be placed are returned so the vendor can resolve them.
   */
  static async autoAllocate<T extends EventLike>(vendorId: Id, events: T[], excludeBookingId?: Id): Promise<{ events: T[]; unallocated: number }> {
    const resources = await VendorResource.find({ vendorId, isActive: true }).sort({ sortOrder: 1, createdAt: 1 });
    let unallocated = 0;
    const planned: BlockSpec[] = [];

    for (const event of events) {
      if (event.resourceAllocations?.length) continue;
      let placed = false;
      for (const resource of resources) {
        const units = resource.capacity === 1 ? 1 : Math.max(1, event.guestCount || 1);
        if (units > resource.capacity) continue;
        const specs: BlockSpec[] = expandSlot(event.slot).map((slot) => ({
          resourceId: resource._id as Id,
          date: toDateOnly(event.date),
          slot,
          units,
          soft: false,
        }));
        const { conflicts } = await this.checkConflicts(vendorId, [...planned, ...specs], excludeBookingId);
        if (!conflicts.length) {
          event.resourceAllocations = [{ resourceId: resource._id as Id, units }];
          planned.push(...specs);
          placed = true;
          break;
        }
      }
      if (!placed) unallocated++;
    }
    return { events, unallocated };
  }

  // -------------------------------------------------------------------
  // Manual blocks ("personal", "booked on another platform")
  // -------------------------------------------------------------------

  static async createManualBlocks(
    vendorId: Id,
    data: { resourceIds?: string[]; dates?: string[]; from?: string; to?: string; slot: BookingSlot; reason?: string; soft?: boolean },
    createdBy: string
  ) {
    const resources = data.resourceIds?.length
      ? [...(await this.loadResources(vendorId, data.resourceIds)).values()]
      : await VendorResource.find({ vendorId, isActive: true });
    if (!resources.length) throw badRequest('Add a resource before blocking dates');

    let dates: Date[] = (data.dates || []).map(toDateOnly);
    if (data.from && data.to) {
      const from = toDateOnly(data.from);
      const to = toDateOnly(data.to);
      if (to < from) throw badRequest('"to" must be on or after "from"');
      if ((to.getTime() - from.getTime()) / DAY_MS > 90) throw badRequest('Block at most 90 days at a time');
      for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
    }
    dates = [...new Set(dates.map((d) => d.getTime()))].map((t) => new Date(t));
    if (!dates.length) throw badRequest('Provide dates or a from/to range');

    const specs: BlockSpec[] = [];
    for (const resource of resources) {
      for (const date of dates) {
        for (const slot of expandSlot(data.slot || 'full_day')) {
          // A manual block takes the whole resource, whatever its capacity.
          specs.push({ resourceId: resource._id as Id, date, slot, units: resource.capacity, soft: !!data.soft });
        }
      }
    }

    if (!data.soft) {
      const { conflicts } = await this.checkConflicts(vendorId, specs);
      if (conflicts.length) throw conflict('Some of these dates already have bookings', { code: 'BOOKING_CONFLICT', conflicts });
    }

    const resourceMap = new Map(resources.map((r) => [String(r._id), r]));
    try {
      return await ResourceBlock.insertMany(
        specs.map((s) => ({
          vendorId,
          resourceId: s.resourceId,
          date: s.date,
          slot: s.slot,
          units: s.units,
          soft: s.soft,
          exclusive: resourceMap.get(String(s.resourceId))!.capacity === 1,
          kind: 'manual',
          manualReason: data.reason,
          createdBy,
        }))
      );
    } catch (err: any) {
      if (err?.code === 11000) throw conflict('Some of these dates were just booked', { code: 'BOOKING_CONFLICT' });
      throw err;
    }
  }

  static async deleteManualBlock(vendorId: Id, blockId: string) {
    const block = await ResourceBlock.findOneAndDelete({ _id: toObjectId(blockId, 'Block'), vendorId, kind: 'manual' });
    if (!block) throw notFound('Block');
  }

  // -------------------------------------------------------------------
  // Views
  // -------------------------------------------------------------------

  static parseRange(from?: string, to?: string, defaultDays = 31) {
    const start = from ? toDateOnly(from) : toDateOnly(new Date());
    const end = to ? toDateOnly(to) : addDays(start, defaultDays - 1);
    if (end < start) throw badRequest('"to" must be on or after "from"');
    if ((end.getTime() - start.getTime()) / DAY_MS > MAX_RANGE_DAYS) throw badRequest(`Range cannot exceed ${MAX_RANGE_DAYS} days`);
    return { start, end };
  }

  /**
   * Month/week/agenda data: resources, raw blocks and booking events in
   * range. Crew members only see events on resources assigned to them.
   */
  static async getCalendar(vendorId: Id, opts: { from?: string; to?: string; resourceId?: string; crewMemberId?: string }) {
    const { start, end } = this.parseRange(opts.from, opts.to);
    const resourceFilter: any = { vendorId, isActive: true };
    if (opts.crewMemberId) resourceFilter.memberId = toObjectId(opts.crewMemberId);
    if (opts.resourceId) resourceFilter._id = toObjectId(opts.resourceId, 'Resource');
    const resources = await VendorResource.find(resourceFilter).sort({ sortOrder: 1, createdAt: 1 }).lean();
    const resourceIds = resources.map((r) => r._id);

    const blocks = await ResourceBlock.find({ vendorId, resourceId: { $in: resourceIds }, date: { $gte: start, $lte: end } })
      .sort({ date: 1, slot: 1 })
      .lean();

    const bookingFilter: any = {
      vendorId,
      status: { $in: [...ACTIVE_BOOKING_STATUSES, 'completed'] },
      events: { $elemMatch: { date: { $gte: start, $lte: end } } },
    };
    if (opts.crewMemberId || opts.resourceId) bookingFilter['events.resourceAllocations.resourceId'] = { $in: resourceIds };

    const bookings = await VendorBooking.find(bookingFilter)
      .select('bookingNumber title status client.name holdExpiresAt events')
      .lean();

    const resourceIdSet = new Set(resourceIds.map(String));
    const events = bookings.flatMap((b) =>
      b.events
        .filter((e) => e.date >= start && e.date <= end)
        .filter((e) => !(opts.crewMemberId || opts.resourceId) || e.resourceAllocations.some((a) => resourceIdSet.has(String(a.resourceId))))
        .map((e) => ({
          bookingId: b._id,
          bookingNumber: b.bookingNumber,
          title: b.title,
          status: b.status,
          clientName: b.client?.name,
          holdExpiresAt: b.holdExpiresAt,
          eventId: e._id,
          functionType: e.functionType,
          date: formatDateKey(e.date),
          slot: e.slot,
          startTime: e.startTime,
          endTime: e.endTime,
          venue: e.venue,
          resourceIds: e.resourceAllocations.map((a) => a.resourceId),
        }))
    );
    events.sort((a, b) => a.date.localeCompare(b.date));

    return {
      from: formatDateKey(start),
      to: formatDateKey(end),
      resources,
      events,
      blocks: blocks.map((b) => ({ ...b, date: formatDateKey(b.date) })),
    };
  }

  /**
   * Per date → per resource → per slot free/booked/soft. Powers the lead
   * card's "14 Nov: Crew A free, Crew B booked" (spec M5).
   */
  static async availabilityForDates(vendorId: Id, rawDates: (string | Date)[]) {
    const dates = [...new Set(rawDates.map((d) => toDateOnly(d).getTime()))].map((t) => new Date(t));
    if (!dates.length) return [];
    const resources = await VendorResource.find({ vendorId, isActive: true }).sort({ sortOrder: 1, createdAt: 1 }).lean();
    const blocks = await ResourceBlock.find({ vendorId, resourceId: { $in: resources.map((r) => r._id) }, date: { $in: dates } }).lean();
    const bookingIds = [...new Set(blocks.filter((b) => b.bookingId).map((b) => String(b.bookingId)))];
    const bookings = await VendorBooking.find({ _id: { $in: bookingIds } }).select('bookingNumber client.name status').lean();
    const bookingMap = new Map(bookings.map((b) => [String(b._id), b]));

    return dates.map((date) => ({
      date: formatDateKey(date),
      resources: resources.map((resource) => {
        const slots = ATOMIC_SLOTS.map((slot) => {
          const here = blocks.filter((b) => String(b.resourceId) === String(resource._id) && b.date.getTime() === date.getTime() && b.slot === slot);
          const hard = here.filter((b) => !b.soft);
          const used = hard.reduce((s, b) => s + b.units, 0);
          const free = Math.max(resource.capacity - used, 0);
          const status = free === 0 ? 'booked' : used > 0 ? 'partial' : here.some((b) => b.soft) ? 'soft' : 'free';
          return {
            slot,
            status,
            freeUnits: free,
            capacity: resource.capacity,
            blockedBy: here.map((b: IResourceBlock | any) => {
              const booking = b.bookingId ? bookingMap.get(String(b.bookingId)) : undefined;
              return {
                bookingId: b.bookingId,
                bookingNumber: booking?.bookingNumber,
                clientName: booking?.client?.name,
                bookingStatus: booking?.status,
                manualReason: b.manualReason,
                soft: b.soft,
              };
            }),
          };
        });
        return { resourceId: resource._id, name: resource.name, type: resource.type, slots };
      }),
    }));
  }
}
