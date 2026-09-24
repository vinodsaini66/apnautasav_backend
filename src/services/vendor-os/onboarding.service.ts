import mongoose from 'mongoose';
import { WeddingVendor, IVendor } from '../../models/wedding-vendor.model';
import { VendorUser, IVendorUser } from '../../models/vendor-os/vendor-user.model';
import { VendorResource } from '../../models/vendor-os/vendor-resource.model';
import { CategoryConfigService } from './category-config.service';
import { VendorProfileService } from './profile.service';
import { PRICING_BASIS_TO_PRICE_UNIT } from '../../constants/vendorOs';
import { VendorOsError, badRequest, forbidden, normalizePhone, notFound } from '../../utils/vendorOs';

// First-run gating for the Vendor OS panel.
//
// A vendor can sign up with just a business name + email (or only a phone
// via OTP / only an email via magic link), but the panel is useless until
// we know WHAT they do, WHERE, and HOW a family reaches them. Until those
// "basic profile" fields exist:
//   - every session / GET /auth/me response carries
//     onboarding.nextStep = 'basic_profile'  → frontend redirects to the
//     profile page on every load;
//   - every panel API except the profile page's own endpoints answers
//     403 { code: 'BASIC_PROFILE_REQUIRED' } (middleware/vendor-auth.middleware.ts).
// Everything else (logo, photos, packages, description, policies…) is
// optional for panel access — it feeds the go-live completeness score.

export const BASIC_PROFILE_FIELDS = [
  { key: 'businessName', label: 'Business name' },
  { key: 'osCategory', label: 'Category' },
  { key: 'city', label: 'Base city' },
  { key: 'phone', label: 'Contact mobile number' },
  { key: 'contactPerson', label: 'Contact person name' },
] as const;

export type BasicProfileField = (typeof BASIC_PROFILE_FIELDS)[number]['key'];

type VendorLike = Pick<IVendor, 'businessName' | 'osCategory' | 'phone' | 'whatsappNumber' | 'contactPerson'> & {
  location?: { city?: string };
};

export const basicProfileStatus = (vendor?: VendorLike | null) => {
  const has: Record<BasicProfileField, boolean> = {
    businessName: Boolean(vendor?.businessName?.trim()),
    osCategory: Boolean(vendor?.osCategory),
    city: Boolean(vendor?.location?.city?.trim()),
    phone: Boolean(vendor?.phone || vendor?.whatsappNumber),
    contactPerson: Boolean(vendor?.contactPerson?.trim()),
  };
  const missingFields = BASIC_PROFILE_FIELDS.filter((f) => !has[f.key]).map((f) => f.key);
  return { complete: missingFields.length === 0, missingFields };
};

export const BASIC_PROFILE_SELECT =
  'businessName osCategory phone whatsappNumber contactPerson location.city status profileCompleteness firstPublishedAt reviewNote';

type UserLike = Pick<IVendorUser, 'emailVerified' | 'phoneVerified' | 'email' | 'phone'>;
type VendorStateLike = VendorLike & { status?: string; profileCompleteness?: number; firstPublishedAt?: Date | null; reviewNote?: string };

/**
 * The login is verified when its email is verified. A phone-only account
 * (Mobile OTP sign-up, or a team member invited by phone) has no email, so
 * its OTP-verified phone counts instead.
 */
export const isLoginVerified = (user: UserLike) => (user.email ? !!user.emailVerified : !!user.phoneVerified);

/**
 * Approved = ApnaUtsav admin approved the listing at least once. It stays
 * true if the vendor later hides the listing (inactive) or it's suspended —
 * a suspended vendor keeps read-only access (see requireVendor).
 */
export const isBusinessApproved = (vendor?: Pick<VendorStateLike, 'firstPublishedAt'> | null) => !!vendor?.firstPublishedAt;

export const SUBMITTED_STATUSES = ['pending_review', 'active', 'inactive', 'suspended'];

export class VendorOnboardingService {
  /**
   * The key the frontend routes on after every login / page load:
   *   basic_profile — onboarding steps 1–2 not saved yet → /onboarding
   *   verification  — basic profile done, but the login isn't verified or
   *                   ApnaUtsav hasn't approved the listing → /verification
   *   dashboard     — the real panel
   * The backend enforces the same stages (requireBasicProfile /
   * requireVerifiedAccount in vendor-auth.middleware.ts).
   */
  static state(user: UserLike & Pick<IVendorUser, 'role'>, vendor?: VendorStateLike | null) {
    const basic = basicProfileStatus(vendor);
    const checks = {
      basicProfile: basic.complete,
      emailVerified: isLoginVerified(user),
      profileSubmitted: !!vendor && (SUBMITTED_STATUSES.includes(vendor.status || '') || isBusinessApproved(vendor)),
      approved: isBusinessApproved(vendor),
    };
    const nextStep = !basic.complete
      ? ('basic_profile' as const)
      : checks.emailVerified && checks.approved
        ? ('dashboard' as const)
        : ('verification' as const);
    return {
      nextStep,
      basicProfileComplete: basic.complete,
      missingFields: basic.missingFields,
      requiredFields: BASIC_PROFILE_FIELDS,
      checks,
      verificationMethod: user.email ? ('email' as const) : ('phone' as const),
      // Staff/crew can't fill the profile themselves — tell the UI to show
      // "ask the owner" instead of the form.
      canEditProfile: user.role === 'owner' || user.role === 'manager',
      listingStatus: vendor?.status || null,
      reviewNote: vendor?.status === 'rejected' ? vendor.reviewNote : undefined,
      profileCompleteness: vendor?.profileCompleteness ?? 0,
      emailVerified: Boolean(user.email && user.emailVerified),
      phoneVerified: Boolean(user.phone && user.phoneVerified),
    };
  }

  /** Email sign-up already knows the business name, so the draft listing exists from minute one. */
  static async createDraftListing(user: IVendorUser, businessName: string) {
    const vendor = await VendorProfileService.createListingWithUniqueSlug({
      businessName,
      email: user.email,
      source: 'vendor_os',
      osEnabled: true,
      osPlan: 'free',
      status: 'draft',
      verification: { phone: false, gst: false, identity: false, visited: false },
    });
    user.vendorId = vendor._id as mongoose.Types.ObjectId;
    user.role = 'owner';
    await user.save();
    return vendor;
  }

  /**
   * Save the basic profile (the form the user is redirected to until it's
   * complete). Creates the listing for OTP / email-link sign-ups; updates it
   * for email sign-ups. Contact phone and person default to the verified
   * login phone and the user's name, so an OTP sign-up only has to pick
   * business name, category and city.
   */
  static async saveBasicProfile(
    vendorUserId: string,
    data: {
      businessName?: string;
      osCategory?: string;
      city?: string;
      state?: string;
      contactPerson?: string;
      phone?: string;
      whatsappNumber?: string;
      email?: string;
      subTags?: string[];
    }
  ) {
    const user = await VendorUser.findById(vendorUserId);
    if (!user) throw notFound('User');
    if (user.vendorId && !['owner', 'manager'].includes(user.role)) {
      throw forbidden('Only the owner or a manager can edit the business profile');
    }

    let vendor: IVendor | null = user.vendorId ? await WeddingVendor.findOne({ _id: user.vendorId, isDeleted: false }) : null;
    if (user.vendorId && !vendor) throw notFound('Vendor business');

    const businessName = data.businessName?.trim() || vendor?.businessName;
    if (!businessName) throw badRequest('Business name is required');

    const phone = data.phone ? normalizePhone(data.phone) : vendor?.phone || (user.phoneVerified ? user.phone : undefined);
    if (phone && !/^[6-9]\d{9}$/.test(phone)) throw badRequest('Enter a valid 10-digit mobile number');

    const config = data.osCategory ? await CategoryConfigService.getByKey(data.osCategory) : null;
    if (config && vendor?.osCategory && vendor.osCategory !== config.key) {
      // Resources, packages and quote templates are all shaped by the
      // category — switching it silently would leave them inconsistent.
      throw new VendorOsError(409, 'Category is already set. Contact ApnaUtsav support to change it.', { code: 'CATEGORY_LOCKED' });
    }

    if (!vendor) {
      vendor = await VendorProfileService.createListingWithUniqueSlug({
        businessName,
        email: data.email || user.email,
        location: data.city ? { city: data.city, state: data.state, country: 'India' } : undefined,
        source: 'vendor_os',
        osEnabled: true,
        osPlan: 'free',
        status: 'draft',
        verification: { phone: false, gst: false, identity: false, visited: false },
      });
      user.vendorId = vendor._id as mongoose.Types.ObjectId;
      user.role = 'owner';
    }
    return this.applyBasicProfile(user, vendor, data, { businessName, phone, config });
  }

  private static async applyBasicProfile(
    user: IVendorUser,
    vendor: IVendor,
    data: { city?: string; state?: string; contactPerson?: string; whatsappNumber?: string; email?: string; subTags?: string[] },
    resolved: { businessName: string; phone?: string; config: Awaited<ReturnType<typeof CategoryConfigService.getByKey>> | null }
  ) {
    const { businessName, phone, config } = resolved;
    vendor.businessName = businessName;
    if (data.city) {
      const location = (vendor.toObject().location || {}) as Record<string, any>;
      vendor.location = { ...location, city: data.city, state: data.state ?? location.state, country: location.country || 'India' };
      if (!vendor.serviceCities?.length) vendor.serviceCities = [data.city];
    }
    vendor.contactPerson = data.contactPerson?.trim() || vendor.contactPerson || user.name;
    if (phone) vendor.phone = phone;
    const whatsapp = data.whatsappNumber ? normalizePhone(data.whatsappNumber) : undefined;
    if (whatsapp || (!vendor.whatsappNumber && phone)) vendor.whatsappNumber = whatsapp || phone;
    if (data.email) vendor.email = data.email;
    if (data.subTags) vendor.subTags = data.subTags.slice(0, 20);
    // "Phone verified" badge: listing phone is a login phone that passed OTP.
    vendor.verification = {
      ...((vendor.toObject().verification || {}) as Record<string, boolean>),
      phone: Boolean(vendor.phone && user.phoneVerified && user.phone === vendor.phone),
    };

    const newlyCategorised = Boolean(config && !vendor.osCategory);
    if (config && newlyCategorised) {
      vendor.osCategory = config.key;
      vendor.categorySlug = config.marketplaceCategorySlug;
      vendor.pricing = { ...((vendor.toObject().pricing || {}) as any), priceUnit: PRICING_BASIS_TO_PRICE_UNIT[config.pricingBasis] as any };
    }
    await vendor.save();
    if (!user.name && data.contactPerson) user.name = data.contactPerson;
    await user.save();

    const vendorId = vendor._id as mongoose.Types.ObjectId;
    if (config && newlyCategorised) {
      if (!(await VendorResource.exists({ vendorId }))) {
        await VendorResource.create({ vendorId, type: config.resourceType, name: config.defaultResourceName, capacity: config.defaultResourceCapacity });
      }
      await VendorProfileService.linkMarketplaceCategory(vendorId, config);
    }
    await VendorProfileService.refreshCompleteness(vendorId);
    return user;
  }
}
