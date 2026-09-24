import mongoose from 'mongoose';
import { WeddingVendor } from '../../models/wedding-vendor.model';
import { VendorUser } from '../../models/vendor-os/vendor-user.model';
import { VendorResource } from '../../models/vendor-os/vendor-resource.model';
import { VendorLead } from '../../models/vendor-os/vendor-lead.model';
import { VendorBooking } from '../../models/vendor-os/vendor-booking.model';
import { VendorQuote } from '../../models/vendor-os/vendor-quote.model';
import { CategoryConfigService } from './category-config.service';
import { VendorAuthService } from './vendor-auth.service';
import { VendorNotifyService } from './vendor-notify.service';
import { VendorProfileService } from './profile.service';
import { VendorOsPlan } from '../../constants/vendorOs';
import { badRequest, escapeRegex, notFound, toObjectId } from '../../utils/vendorOs';

type Id = mongoose.Types.ObjectId;

// ApnaUtsav admin console for Vendor OS (spec section 7): verify vendors,
// approve first publish, set badges/plan, claim imported listings. Gated by
// the family app's existing admin role (authMiddleware + requireAdmin).
export class VendorOsAdminService {
  static async listVendors(q: { status?: string; osCategory?: string; search?: string; osEnabled?: string; skip: number; limit: number }) {
    const filter: any = { isDeleted: false };
    if (q.osEnabled !== 'all') filter.osEnabled = true;
    if (q.status) filter.status = { $in: q.status.split(',') };
    if (q.osCategory) filter.osCategory = q.osCategory;
    if (q.search) {
      const rx = new RegExp(escapeRegex(q.search), 'i');
      filter.$or = [{ businessName: rx }, { phone: rx }, { slug: rx }, { 'location.city': rx }];
    }
    const [items, total, statusCounts] = await Promise.all([
      WeddingVendor.find(filter)
        .select('businessName slug status osCategory osPlan profileCompleteness verification isVerified location.city phone createdAt firstPublishedAt reviewNote')
        .sort({ updatedAt: -1 })
        .skip(q.skip)
        .limit(q.limit)
        .lean(),
      WeddingVendor.countDocuments(filter),
      WeddingVendor.aggregate([{ $match: { isDeleted: false, osEnabled: true } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);
    return { items, total, statusCounts: Object.fromEntries(statusCounts.map((s: any) => [s._id, s.count])) };
  }

  static async getVendor(vendorId: string) {
    const id = toObjectId(vendorId, 'Vendor');
    const vendor = await WeddingVendor.findOne({ _id: id, isDeleted: false }).lean();
    if (!vendor) throw notFound('Vendor');
    const [team, completeness, leads, bookings, quotes] = await Promise.all([
      VendorUser.find({ vendorId: id }).select('name phone role status lastLoginAt').lean(),
      VendorProfileService.computeCompleteness(id),
      VendorLead.countDocuments({ vendorId: id }),
      VendorBooking.countDocuments({ vendorId: id }),
      VendorQuote.countDocuments({ vendorId: id }),
    ]);
    return { vendor, team, completeness, stats: { leads, bookings, quotes } };
  }

  private static async load(vendorId: string) {
    const vendor = await WeddingVendor.findOne({ _id: toObjectId(vendorId, 'Vendor'), isDeleted: false });
    if (!vendor) throw notFound('Vendor');
    return vendor;
  }

  static async approve(vendorId: string) {
    const vendor = await this.load(vendorId);
    vendor.status = 'active';
    vendor.reviewNote = undefined;
    if (!vendor.firstPublishedAt) vendor.firstPublishedAt = new Date();
    await vendor.save();
    await VendorNotifyService.notify({
      vendorId: vendor._id as Id,
      type: 'profile_approved',
      title: 'Your profile is live on ApnaUtsav 🎉',
      body: 'Families can now find you, check your availability and send enquiries.',
      entityType: 'profile',
    });
    return vendor;
  }

  static async reject(vendorId: string, reason: string) {
    const vendor = await this.load(vendorId);
    vendor.status = 'rejected';
    vendor.reviewNote = reason;
    await vendor.save();
    await VendorNotifyService.notify({
      vendorId: vendor._id as Id,
      type: 'profile_rejected',
      title: 'Your profile needs changes before going live',
      body: reason,
      entityType: 'profile',
    });
    return vendor;
  }

  static async setSuspended(vendorId: string, suspended: boolean, reason?: string) {
    const vendor = await this.load(vendorId);
    vendor.status = suspended ? 'suspended' : vendor.firstPublishedAt ? 'active' : 'draft';
    vendor.reviewNote = suspended ? reason : undefined;
    await vendor.save();
    return vendor;
  }

  static async setVerification(vendorId: string, badges: { phone?: boolean; gst?: boolean; identity?: boolean; visited?: boolean }) {
    const vendor = await this.load(vendorId);
    const current = (vendor.toObject().verification || {}) as Record<string, boolean>;
    const next = { ...current, ...badges };
    vendor.verification = next;
    // The marketplace's single "verified" flag = phone + at least one real check.
    vendor.isVerified = Boolean(next.phone && (next.gst || next.identity || next.visited));
    await vendor.save();
    return vendor;
  }

  static async setPlan(vendorId: string, plan: VendorOsPlan) {
    const vendor = await this.load(vendorId);
    vendor.osPlan = plan;
    vendor.isPremium = plan !== 'free'; // "Pro" badge & listing priority (spec section 10)
    await vendor.save();
    return vendor;
  }

  /**
   * Hands an existing (imported/admin-created) listing to a vendor so they
   * can run it from Vendor OS — concierge onboarding (spec GTM #1).
   */
  static async assignOwner(vendorId: string, data: { phone: string; name?: string; osCategory: string }) {
    const vendor = await this.load(vendorId);
    const config = await CategoryConfigService.getByKey(data.osCategory);
    const phone = VendorAuthService.assertPhone(data.phone);

    const currentOwner = await VendorUser.findOne({ vendorId: vendor._id, role: 'owner' });
    if (currentOwner && currentOwner.phone !== phone) throw badRequest(`This listing is already owned by ${currentOwner.phone}`);

    let user = await VendorUser.findOne({ phone });
    if (user?.vendorId && String(user.vendorId) !== String(vendor._id)) {
      throw badRequest('This phone already runs another business on Vendor OS');
    }
    if (!user) user = new VendorUser({ phone, status: 'invited' });
    user.vendorId = vendor._id as Id;
    user.role = 'owner';
    if (data.name) user.name = data.name;
    await user.save();

    vendor.osEnabled = true;
    vendor.osCategory = config.key;
    if (!vendor.phone) vendor.phone = phone;
    await vendor.save();

    if (!(await VendorResource.exists({ vendorId: vendor._id }))) {
      await VendorResource.create({ vendorId: vendor._id, type: config.resourceType, name: config.defaultResourceName, capacity: config.defaultResourceCapacity });
    }
    await VendorProfileService.refreshCompleteness(vendor._id as Id);
    return { vendor, owner: VendorAuthService.toPublicUser(user) };
  }
}
