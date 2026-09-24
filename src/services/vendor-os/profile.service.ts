import mongoose from 'mongoose';
import { WeddingVendor, IVendor } from '../../models/wedding-vendor.model';
import { VendorUser } from '../../models/vendor-os/vendor-user.model';
import { VendorPackage } from '../../models/vendor-os/vendor-package.model';
import { VendorMedia } from '../../models/vendor-media.model';
import { VendorAlbum } from '../../models/vendor-album.model';
import { VendorCategory } from '../../models/vendor-category.model';
import { VendorCategoryMapping } from '../../models/vendor-category-mapping.model';
import { ICategoryConfig } from '../../models/vendor-os/category-config.model';
import { CategoryConfigService } from './category-config.service';
import { PublicVendorOsService } from './public.service';
import { MAX_COVER_IMAGES } from '../../constants/vendorOs';
import { generateSlugSuffix, slugify } from '../../utils/generateCode';
import { badRequest, notFound, normalizePhone, todayIST, addDays, formatDateKey } from '../../utils/vendorOs';
import logger from '../../utils/logger';

// Fields a vendor may edit on their own listing. Everything else
// (status, isVerified/isFeatured/isPremium, verification badges, rating,
// counters, osPlan) is admin- or system-owned.
const EDITABLE_FIELDS = [
  'businessName',
  'displayName',
  'tagline',
  'description',
  'shortDescription',
  'logo',
  'coverImages',
  'contactPerson',
  'email',
  'phone',
  'alternatePhone',
  'whatsappNumber',
  'website',
  'location',
  'locations',
  'serviceCities',
  'languages',
  'subTags',
  'travelPolicy',
  'yearEstablished',
  'experienceYears',
  'teamSize',
  'gstNumber',
  'upiId',
  'brochureUrl',
  'socialLinks',
  'policies',
  'profileDetails',
  'awards',
] as const;

const PHOTOS_FOR_FEATURED = 10;

export interface CompletenessResult {
  score: number;
  checks: { key: string; label: string; done: boolean; weight: number }[];
  nudges: string[];
}

export class VendorProfileService {
  static async createListingWithUniqueSlug(doc: Record<string, any>): Promise<IVendor> {
    const base = slugify(`${doc.businessName}-${doc.location?.city || ''}`) || 'vendor';
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${generateSlugSuffix(4)}`;
      try {
        return await WeddingVendor.create({ ...doc, slug });
      } catch (err: any) {
        if (err?.code === 11000 && err?.keyPattern?.slug && attempt < 4) continue;
        throw err;
      }
    }
    throw new Error('Could not generate a unique profile URL');
  }

  // Makes the listing show up under the right category in the family-side
  // marketplace browse (which filters through VendorCategoryMapping).
  static async linkMarketplaceCategory(vendorId: mongoose.Types.ObjectId, config: ICategoryConfig) {
    if (!config.marketplaceCategorySlug) return;
    try {
      const category = await VendorCategory.findOne({ slug: config.marketplaceCategorySlug, isDeleted: false }).lean();
      if (!category) return;
      await VendorCategoryMapping.updateOne(
        { vendorId, categoryId: category._id },
        {
          $setOnInsert: {
            vendorId,
            categoryId: category._id,
            parentCategoryId: category.parentId || undefined,
            isPrimary: true,
            isActive: true,
          },
        },
        { upsert: true }
      );
    } catch (error) {
      logger.warn(`Vendor OS: could not link marketplace category for ${vendorId}: ${(error as Error).message}`);
    }
  }

  // -------------------------------------------------------------------
  // Profile
  // -------------------------------------------------------------------

  static async getProfile(vendorId: mongoose.Types.ObjectId) {
    const vendor = await WeddingVendor.findById(vendorId).lean();
    if (!vendor) throw notFound('Vendor');
    const config = vendor.osCategory ? await CategoryConfigService.getByKey(vendor.osCategory).catch(() => null) : null;
    const completeness = await this.computeCompleteness(vendorId);
    return { vendor, categoryConfig: config, completeness };
  }

  static async updateProfile(vendorId: mongoose.Types.ObjectId, input: Record<string, any>) {
    const vendor = await WeddingVendor.findById(vendorId);
    if (!vendor) throw notFound('Vendor');

    const update: Record<string, any> = {};
    for (const field of EDITABLE_FIELDS) {
      if (input[field] !== undefined) update[field] = input[field];
    }

    if (update.coverImages) {
      if (update.coverImages.length > MAX_COVER_IMAGES) throw badRequest(`Up to ${MAX_COVER_IMAGES} cover images are allowed`);
      update.coverImage = update.coverImages[0];
    }
    if (update.phone) update.phone = normalizePhone(update.phone);
    if (update.whatsappNumber) update.whatsappNumber = normalizePhone(update.whatsappNumber);
    if (update.location) update.location = { ...(vendor.toObject().location || {}), ...update.location };
    if (update.policies) update.policies = { ...(vendor.toObject().policies || {}), ...update.policies };

    // Badges are earned, not typed: changing the GST number drops the GST
    // badge until an admin re-verifies; the phone badge holds only while
    // the listing phone belongs to a logged-in team member.
    if (update.gstNumber !== undefined && update.gstNumber !== vendor.gstNumber) {
      update['verification.gst'] = false;
    }
    if (update.phone && update.phone !== vendor.phone) {
      update['verification.phone'] = Boolean(
        await VendorUser.exists({ vendorId, phone: update.phone, phoneVerified: true, status: { $ne: 'disabled' } })
      );
    }

    if (input.categoryProfile && vendor.osCategory) {
      const config = await CategoryConfigService.getByKey(vendor.osCategory);
      const clean = CategoryConfigService.sanitizeCategoryProfile(config, input.categoryProfile);
      const merged = { ...(vendor.categoryProfile || {}), ...clean };
      update.categoryProfile = merged;
      if (config.key === 'venue') Object.assign(update, this.venueDetailsFromProfile(merged));
    }

    if (update.subTags) update.subTags = update.subTags.slice(0, 20);

    await WeddingVendor.updateOne({ _id: vendorId }, { $set: update }, { runValidators: true });
    await this.refreshCompleteness(vendorId);
    return this.getProfile(vendorId);
  }

  // Keeps the marketplace's existing venue filters (capacity/per-plate)
  // working for Vendor OS venues, whose source of truth is categoryProfile.
  private static venueDetailsFromProfile(profile: Record<string, any>) {
    const capacities = ['indoorCapacitySeated', 'indoorCapacityFloating', 'outdoorCapacitySeated', 'outdoorCapacityFloating']
      .map((k) => Number(profile[k]) || 0)
      .filter((n) => n > 0);
    const out: Record<string, any> = {};
    if (capacities.length) {
      out['venueDetails.guestCapacityMin'] = Math.min(...capacities);
      out['venueDetails.guestCapacityMax'] = Math.max(...capacities);
    }
    if (profile.venueType) out['venueDetails.venueTypes'] = [profile.venueType];
    if (profile.vegPlateRate) out['venueDetails.vegPricePerPlate'] = Number(profile.vegPlateRate);
    if (profile.nonVegPlateRate) out['venueDetails.nonVegPricePerPlate'] = Number(profile.nonVegPlateRate);
    return out;
  }

  static async computeCompleteness(vendorId: mongoose.Types.ObjectId): Promise<CompletenessResult> {
    const vendor = await WeddingVendor.findById(vendorId).lean();
    if (!vendor) throw notFound('Vendor');

    const [photoCount, packageCount, config] = await Promise.all([
      VendorMedia.countDocuments({ vendorId, type: 'image', isDeleted: false }),
      VendorPackage.countDocuments({ vendorId, kind: 'package', isActive: true }),
      vendor.osCategory ? CategoryConfigService.getByKey(vendor.osCategory).catch(() => null) : Promise.resolve(null),
    ]);

    const requiredFields = config?.profileSchema.filter((f) => f.required) || [];
    const profile = vendor.categoryProfile || {};
    const filledRequired = requiredFields.filter((f) => {
      const v = profile[f.key];
      return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
    }).length;
    const categoryRatio = requiredFields.length ? filledRequired / requiredFields.length : 1;
    const photoRatio = Math.min(photoCount / PHOTOS_FOR_FEATURED, 1);
    const coverCount = vendor.coverImages?.length || (vendor.coverImage ? 1 : 0);

    const items: { key: string; label: string; weight: number; ratio: number; nudge?: string }[] = [
      { key: 'logo', label: 'Logo', weight: 5, ratio: vendor.logo ? 1 : 0, nudge: 'Add your logo' },
      { key: 'coverImages', label: 'Cover images (3+)', weight: 10, ratio: Math.min(coverCount / 3, 1), nudge: 'Add at least 3 cover images — they are the first thing families see' },
      { key: 'description', label: 'About your business', weight: 10, ratio: (vendor.description?.length || 0) >= 150 ? 1 : 0, nudge: 'Write a 150+ character description of your business' },
      { key: 'tagline', label: 'Tagline', weight: 4, ratio: vendor.tagline ? 1 : 0, nudge: 'Add a one-line tagline' },
      { key: 'location', label: 'Base city & address', weight: 5, ratio: vendor.location?.city && vendor.location?.address ? 1 : 0, nudge: 'Add your full address' },
      { key: 'serviceCities', label: 'Cities served', weight: 4, ratio: vendor.serviceCities?.length ? 1 : 0, nudge: 'List the cities you serve' },
      { key: 'languages', label: 'Languages spoken', weight: 3, ratio: vendor.languages?.length ? 1 : 0, nudge: 'Add the languages you speak' },
      { key: 'experience', label: 'Years in business', weight: 4, ratio: vendor.experienceYears || vendor.yearEstablished ? 1 : 0, nudge: 'Add how many years you have been in business' },
      { key: 'categoryProfile', label: 'Category details', weight: 15, ratio: categoryRatio, nudge: `Fill the ${requiredFields.length - filledRequired} remaining required ${config?.name || 'category'} details` },
      { key: 'photos', label: `Portfolio photos (${PHOTOS_FOR_FEATURED}+)`, weight: 15, ratio: photoRatio, nudge: `Add ${Math.max(PHOTOS_FOR_FEATURED - photoCount, 0)} more photos to appear in Featured` },
      { key: 'packages', label: 'At least one package', weight: 12, ratio: packageCount ? 1 : 0, nudge: 'Add a package with pricing' },
      { key: 'policies', label: 'Advance & cancellation policy', weight: 8, ratio: (vendor.policies?.advance || vendor.policies?.schedule?.length ? 0.5 : 0) + (vendor.policies?.cancellation ? 0.5 : 0), nudge: 'Set your advance and cancellation policy' },
      { key: 'contact', label: 'WhatsApp number', weight: 5, ratio: vendor.whatsappNumber || vendor.phone ? 1 : 0, nudge: 'Add a WhatsApp number' },
    ];

    const score = Math.round(items.reduce((sum, i) => sum + i.weight * i.ratio, 0));
    return {
      score,
      checks: items.map((i) => ({ key: i.key, label: i.label, done: i.ratio >= 1, weight: i.weight })),
      nudges: items.filter((i) => i.ratio < 1 && i.nudge).map((i) => i.nudge as string),
    };
  }

  static async refreshCompleteness(vendorId: mongoose.Types.ObjectId): Promise<number> {
    const { score } = await this.computeCompleteness(vendorId);
    await WeddingVendor.updateOne({ _id: vendorId }, { $set: { profileCompleteness: score } });
    return score;
  }

  /**
   * First publish goes to ApnaUtsav review (pending_review); once a listing
   * has been approved before, the vendor can go live again directly.
   */
  static async submitForReview(vendorId: mongoose.Types.ObjectId) {
    const vendor = await WeddingVendor.findById(vendorId);
    if (!vendor) throw notFound('Vendor');
    if (vendor.status === 'suspended') throw badRequest('This listing is suspended');
    if (vendor.status === 'active') return { status: vendor.status, message: 'Your profile is already live' };
    if (vendor.status === 'pending_review') return { status: vendor.status, message: 'Your profile is already under review' };

    const { score, nudges } = await this.computeCompleteness(vendorId);
    const hasPackage = await VendorPackage.exists({ vendorId, kind: 'package', isActive: true });
    if (score < 50 || !hasPackage) {
      throw badRequest('Complete more of your profile before going live (at least 50% and one package)', { score, nudges });
    }

    vendor.status = vendor.firstPublishedAt ? 'active' : 'pending_review';
    vendor.reviewNote = undefined;
    await vendor.save();
    return {
      status: vendor.status,
      message: vendor.status === 'active' ? 'Your profile is live again' : 'Submitted for ApnaUtsav review',
    };
  }

  static async unpublish(vendorId: mongoose.Types.ObjectId) {
    const vendor = await WeddingVendor.findById(vendorId);
    if (!vendor) throw notFound('Vendor');
    if (vendor.status === 'suspended') throw badRequest('This listing is suspended');
    vendor.status = vendor.firstPublishedAt ? 'inactive' : 'draft';
    await vendor.save();
    return { status: vendor.status };
  }

  /** The public profile exactly as families see it (spec M1). */
  static async preview(vendorId: mongoose.Types.ObjectId) {
    const vendor = await WeddingVendor.findById(vendorId).lean();
    if (!vendor) throw notFound('Vendor');
    const today = todayIST();
    const [packages, albums, media, availability] = await Promise.all([
      VendorPackage.find({ vendorId, isActive: true }).sort({ kind: 1, sortOrder: 1, price: 1 }).lean(),
      VendorAlbum.find({ vendorId, isDeleted: false }).sort({ sortOrder: 1, createdAt: -1 }).lean(),
      VendorMedia.find({ vendorId, isDeleted: false }).sort({ isFeatured: -1, sortOrder: 1, createdAt: -1 }).limit(60).lean(),
      PublicVendorOsService.availability(String(vendorId), formatDateKey(today), formatDateKey(addDays(today, 89))),
    ]);
    const { reviewNote: _r, osPlan: _p, gstNumber: _g, upiId: _u, ...publicVendor } = vendor as any;
    return { vendor: publicVendor, packages, albums, media, availability };
  }
}
