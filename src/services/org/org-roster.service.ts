import mongoose from 'mongoose';
import { OrgVendorRoster, IOrgVendorRoster } from '../../models/org/org-vendor-roster.model';
import { Vendor } from '../../models/vendor.model';
import { Wedding } from '../../models/wedding.model';
import { WeddingVendor } from '../../models/wedding-vendor.model';
import { VendorCategoryMapping } from '../../models/vendor-category-mapping.model';
import { VendorCategory as MarketplaceCategory } from '../../models/vendor-category.model';
import { mapMarketplaceCategoryToVendorCategory } from '../../utils/vendorCategoryMapping';
import { resolveWeddingAccess, hasPermission } from '../access.service';
import { ActivityService } from '../activity.service';
import { OrgMembership } from './org-access';
import { badRequest, forbidden, notFound, OrgError } from '../../utils/org';
import { cleanVendorRow, ImportRowResult, MAX_IMPORT_ROWS, VendorImportRow, vendorKey } from '../vendor-import.service';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const digits = (s?: string) => (s ?? '').replace(/\D/g, '').slice(-10);

const EDITABLE = ['name', 'category', 'contactPerson', 'phone', 'email', 'city', 'website', 'priceRange', 'notes', 'tags', 'rating', 'isArchived'] as const;

/** Rejects a second roster entry for the same phone number in the same agency. */
const assertNotDuplicate = async (orgId: unknown, phone: string, exceptId?: unknown) => {
  const key = digits(phone);
  if (!key) return;
  const existing = await OrgVendorRoster.find({ organizationId: orgId, ...(exceptId ? { _id: { $ne: exceptId } } : {}) })
    .select('name phone')
    .lean();
  const clash = existing.find((r) => digits(r.phone) === key);
  if (clash) throw new OrgError(409, `${clash.name} already has this phone number in your roster`, { code: 'ROSTER_DUPLICATE', id: String(clash._id) });
};

export class OrgRosterService {
  static async list(m: OrgMembership, query: { q?: string; category?: string; archived?: string }) {
    const filter: Record<string, unknown> = { organizationId: m.org._id, isArchived: query.archived === '1' };
    if (query.category) filter.category = query.category;
    if (query.q?.trim()) {
      const rx = new RegExp(escapeRegex(query.q.trim()), 'i');
      filter.$or = [{ name: rx }, { contactPerson: rx }, { city: rx }, { tags: rx }, { phone: rx }];
    }
    return OrgVendorRoster.find(filter).sort({ category: 1, name: 1 }).limit(1000).lean();
  }

  static async create(m: OrgMembership, body: Partial<IOrgVendorRoster>) {
    await assertNotDuplicate(m.org._id, String(body.phone ?? ''));
    const doc: Record<string, unknown> = { organizationId: m.org._id, createdBy: m.member.userId };
    for (const k of EDITABLE) if (body[k] !== undefined) doc[k] = body[k];
    return OrgVendorRoster.create(doc);
  }

  private static async find(m: OrgMembership, id: string) {
    if (!mongoose.isValidObjectId(id)) throw notFound('Vendor');
    const doc = await OrgVendorRoster.findOne({ _id: id, organizationId: m.org._id });
    if (!doc) throw notFound('Vendor');
    return doc;
  }

  static async update(m: OrgMembership, id: string, body: Partial<IOrgVendorRoster>) {
    const doc = await this.find(m, id);
    if (body.phone !== undefined) await assertNotDuplicate(m.org._id, String(body.phone), doc._id);
    for (const k of EDITABLE) if (body[k] !== undefined) doc.set(k, body[k]);
    await doc.save();
    return doc;
  }

  static async remove(m: OrgMembership, id: string) {
    const doc = await this.find(m, id);
    await doc.deleteOne();
    return { removed: true };
  }

  /**
   * Copies roster vendors into one client wedding's vendor tracker. The
   * caller needs vendors.manage on that wedding (resolved the normal way, so a
   * coordinator can only push into weddings they're on), and the wedding must
   * belong to this agency. Vendors already on the wedding (same phone or
   * name) are skipped, not duplicated. The agency's private notes and rating
   * stay in the roster.
   */
  static async pushToWedding(m: OrgMembership, input: { rosterIds: string[]; weddingId: string; eventIds?: string[] }) {
    const userId = String(m.member.userId);
    const access = await resolveWeddingAccess(userId, input.weddingId);
    if (!access.ok || access.access.kind !== 'org' || access.access.org?.id !== String(m.org._id)) throw notFound('Wedding');
    if (!hasPermission(access.access, 'vendors.manage')) throw forbidden('You can\'t add vendors to this wedding');

    const ids = input.rosterIds.filter((id) => mongoose.isValidObjectId(id));
    const roster = await OrgVendorRoster.find({ _id: { $in: ids }, organizationId: m.org._id });
    if (roster.length !== input.rosterIds.length) throw badRequest('Some of those vendors aren\'t in your roster');

    const existing = await Vendor.find({ weddingId: input.weddingId }).select('vendorName phoneNumber').lean();
    const taken = new Set(existing.flatMap((v) => [`n:${vendorKey(v.vendorName, '').name}`, `p:${digits(v.phoneNumber)}`]));

    const results: { rosterId: string; name: string; added: boolean; vendorId?: string; reason?: string }[] = [];
    for (const r of roster) {
      const key = vendorKey(r.name, r.phone);
      if (taken.has(`n:${key.name}`) || (key.phone && taken.has(`p:${key.phone}`))) {
        results.push({ rosterId: String(r._id), name: r.name, added: false, reason: 'Already on this wedding' });
        continue;
      }
      const vendor = await Vendor.create({
        weddingId: input.weddingId,
        vendorName: r.name,
        category: r.category,
        contactPerson: r.contactPerson,
        phoneNumber: r.phone,
        email: r.email,
        website: r.website,
        bookingStatus: 'inquiry',
        marketplaceVendorId: r.linkedWeddingVendorId ?? undefined,
        eventIds: (input.eventIds ?? []).filter((id) => mongoose.isValidObjectId(id)),
        addedBy: userId,
      });
      taken.add(`n:${key.name}`).add(`p:${key.phone}`);
      results.push({ rosterId: String(r._id), name: r.name, added: true, vendorId: String(vendor._id) });
    }

    const added = results.filter((r) => r.added).length;
    if (added) {
      await ActivityService.logActivity({
        weddingId: input.weddingId,
        userId,
        actionType: 'created',
        entityType: 'vendor',
        description: `Added ${added} vendor${added === 1 ? '' : 's'} from ${m.org.name}'s roster`,
      });
    }
    return { added, results };
  }

  /** "Save to roster" from a vendor already on one of this agency's weddings. */
  static async fromWeddingVendor(m: OrgMembership, input: { weddingId: string; vendorId: string }) {
    if (!mongoose.isValidObjectId(input.weddingId) || !mongoose.isValidObjectId(input.vendorId)) throw notFound('Vendor');
    const wedding = await Wedding.exists({ _id: input.weddingId, organizationId: m.org._id });
    if (!wedding) throw notFound('Wedding');
    const vendor = await Vendor.findOne({ _id: input.vendorId, weddingId: input.weddingId }).lean();
    if (!vendor) throw notFound('Vendor');
    return this.create(m, {
      name: vendor.vendorName,
      category: vendor.category,
      contactPerson: vendor.contactPerson,
      phone: vendor.phoneNumber,
      email: vendor.email,
      website: vendor.website,
      linkedWeddingVendorId: vendor.marketplaceVendorId ?? null,
    } as Partial<IOrgVendorRoster>);
  }

  /** Adds a public marketplace listing to the agency's roster. */
  static async fromMarketplace(m: OrgMembership, weddingVendorId: string) {
    if (!mongoose.isValidObjectId(weddingVendorId)) throw notFound('Vendor');
    const listing = await WeddingVendor.findOne({ _id: weddingVendorId, status: 'active', isDeleted: { $ne: true } }).lean();
    if (!listing) throw notFound('Vendor');
    const mapping = await VendorCategoryMapping.findOne({ vendorId: listing._id, isPrimary: true, isActive: true }).lean();
    const marketplaceCategory = mapping ? await MarketplaceCategory.findById(mapping.categoryId).lean() : null;
    return this.create(m, {
      name: listing.displayName || listing.businessName,
      category: mapMarketplaceCategoryToVendorCategory(marketplaceCategory?.name),
      contactPerson: listing.contactPerson,
      phone: listing.phone || '',
      email: listing.email,
      website: listing.website,
      city: listing.location?.city,
      priceRange: listing.pricing?.startingPrice ? { min: listing.pricing.startingPrice } : undefined,
      linkedWeddingVendorId: listing._id,
    } as Partial<IOrgVendorRoster>);
  }

  /**
   * CSV import into the roster. `dryRun` validates and reports without
   * saving, so the screen can show what will happen first. Phones already in
   * the roster (or repeated in the file) are skipped.
   */
  static async importRows(m: OrgMembership, rows: VendorImportRow[], dryRun: boolean) {
    if (!m.org.limitsSnapshot.csvImport) throw forbidden('CSV import isn\'t on your plan', { code: 'ORG_PLAN_FEATURE', feature: 'csvImport' });
    if (rows.length > MAX_IMPORT_ROWS) throw badRequest(`Import up to ${MAX_IMPORT_ROWS} rows at a time`);

    const existing = await OrgVendorRoster.find({ organizationId: m.org._id }).select('phone').lean();
    const phones = new Set(existing.map((r) => digits(r.phone)));
    const results: ImportRowResult[] = [];
    const toCreate: Record<string, unknown>[] = [];

    rows.forEach((raw, i) => {
      const { row, error } = cleanVendorRow(raw);
      if (!row) {
        results.push({ row: i + 1, name: String(raw.name ?? ''), ok: false, error });
        return;
      }
      const key = digits(row.phone);
      if (phones.has(key)) {
        results.push({ row: i + 1, name: row.name, ok: false, skipped: true, error: 'Already in your roster' });
        return;
      }
      phones.add(key);
      results.push({ row: i + 1, name: row.name, ok: true });
      toCreate.push({
        organizationId: m.org._id,
        createdBy: m.member.userId,
        name: row.name,
        category: row.category,
        phone: row.phone,
        contactPerson: row.contactPerson,
        email: row.email,
        city: row.city,
        website: row.website,
        notes: row.notes,
        priceRange: row.price ? { min: row.price } : undefined,
      });
    });

    if (!dryRun && toCreate.length) await OrgVendorRoster.insertMany(toCreate);
    return { dryRun, created: dryRun ? 0 : toCreate.length, valid: toCreate.length, results };
  }
}
