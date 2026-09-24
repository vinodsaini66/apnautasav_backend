import mongoose from 'mongoose';
import { WeddingVendor } from '../../models/wedding-vendor.model';
import { VendorResource } from '../../models/vendor-os/vendor-resource.model';
import { VendorQuote } from '../../models/vendor-os/vendor-quote.model';
import { VendorMedia } from '../../models/vendor-media.model';
import { VendorUser } from '../../models/vendor-os/vendor-user.model';
import { VENDOR_OS_PLAN_LIMITS, VendorOsPlan } from '../../constants/vendorOs';
import { VendorOsError } from '../../utils/vendorOs';

type LimitKey = keyof (typeof VENDOR_OS_PLAN_LIMITS)['free'];

const LABELS: Record<LimitKey, string> = {
  resources: 'calendar resources',
  quotesPerMonth: 'quotes this month',
  photos: 'portfolio photos',
  users: 'team members',
};

const currentUsage = async (vendorId: mongoose.Types.ObjectId, key: LimitKey): Promise<number> => {
  switch (key) {
    case 'resources':
      return VendorResource.countDocuments({ vendorId, isActive: true });
    case 'quotesPerMonth': {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return VendorQuote.countDocuments({ vendorId, createdAt: { $gte: monthStart } });
    }
    case 'photos':
      return VendorMedia.countDocuments({ vendorId, type: 'image', isDeleted: false });
    case 'users':
      return VendorUser.countDocuments({ vendorId, status: { $ne: 'disabled' } });
  }
};

export const getVendorPlan = async (vendorId: mongoose.Types.ObjectId): Promise<VendorOsPlan> => {
  const vendor = await WeddingVendor.findById(vendorId).select('osPlan').lean();
  return (vendor?.osPlan as VendorOsPlan) || 'free';
};

/** Throws 402 when adding `adding` more of `key` would exceed the vendor's plan. */
export const assertWithinPlan = async (vendorId: mongoose.Types.ObjectId, key: LimitKey, adding = 1): Promise<void> => {
  const plan = await getVendorPlan(vendorId);
  const limit = VENDOR_OS_PLAN_LIMITS[plan][key];
  if (limit === Infinity) return;
  const used = await currentUsage(vendorId, key);
  if (used + adding > limit) {
    throw new VendorOsError(402, `Your ${plan} plan allows ${limit} ${LABELS[key]}. Upgrade to Pro for more.`, {
      code: 'PLAN_LIMIT',
      limit,
      used,
      plan,
    });
  }
};

export const getPlanUsage = async (vendorId: mongoose.Types.ObjectId) => {
  const plan = await getVendorPlan(vendorId);
  const limits = VENDOR_OS_PLAN_LIMITS[plan];
  const keys = Object.keys(limits) as LimitKey[];
  const usage = await Promise.all(keys.map((k) => currentUsage(vendorId, k)));
  return {
    plan,
    limits: Object.fromEntries(keys.map((k) => [k, limits[k] === Infinity ? null : limits[k]])),
    usage: Object.fromEntries(keys.map((k, i) => [k, usage[i]])),
  };
};
