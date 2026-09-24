import mongoose from 'mongoose';
import { VendorPackage } from '../../models/vendor-os/vendor-package.model';
import { WeddingVendor } from '../../models/wedding-vendor.model';
import { CategoryConfigService } from './category-config.service';
import { VendorProfileService } from './profile.service';
import { MAX_PACKAGES, PRICING_BASIS_TO_PRICE_UNIT, PricingBasis } from '../../constants/vendorOs';
import { badRequest, notFound, toObjectId } from '../../utils/vendorOs';

export class VendorPackageService {
  static async list(vendorId: mongoose.Types.ObjectId, includeInactive = true) {
    const filter: any = { vendorId };
    if (!includeInactive) filter.isActive = true;
    return VendorPackage.find(filter).sort({ kind: 1, isPopular: -1, sortOrder: 1, price: 1 }).lean();
  }

  private static async assertAddons(vendorId: mongoose.Types.ObjectId, addonIds?: string[]) {
    if (!addonIds?.length) return;
    const count = await VendorPackage.countDocuments({ _id: { $in: addonIds }, vendorId, kind: 'addon' });
    if (count !== new Set(addonIds).size) throw badRequest('addonIds must be your own add-ons');
  }

  static async create(vendorId: mongoose.Types.ObjectId, data: any) {
    const kind = data.kind || 'package';
    await this.assertAddons(vendorId, data.addonIds);
    if (kind === 'package') {
      const count = await VendorPackage.countDocuments({ vendorId, kind: 'package', isActive: true });
      if (count >= MAX_PACKAGES) throw badRequest(`Up to ${MAX_PACKAGES} active packages are allowed`);
    }
    const pricingBasis = data.pricingBasis || (await this.defaultBasis(vendorId));
    const pkg = await VendorPackage.create({ ...data, kind, pricingBasis, vendorId });
    await this.syncListingPricing(vendorId);
    return pkg;
  }

  static async update(vendorId: mongoose.Types.ObjectId, packageId: string, data: any) {
    const { vendorId: _v, ...rest } = data;
    await this.assertAddons(vendorId, rest.addonIds);
    if (rest.isActive === true) {
      const existing = await VendorPackage.findOne({ _id: toObjectId(packageId, 'Package'), vendorId }).lean();
      if (existing && !existing.isActive && existing.kind === 'package') {
        const count = await VendorPackage.countDocuments({ vendorId, kind: 'package', isActive: true });
        if (count >= MAX_PACKAGES) throw badRequest(`Up to ${MAX_PACKAGES} active packages are allowed`);
      }
    }
    const pkg = await VendorPackage.findOneAndUpdate(
      { _id: toObjectId(packageId, 'Package'), vendorId },
      { $set: rest },
      { new: true, runValidators: true }
    );
    if (!pkg) throw notFound('Package');
    await this.syncListingPricing(vendorId);
    return pkg;
  }

  static async remove(vendorId: mongoose.Types.ObjectId, packageId: string) {
    const pkg = await VendorPackage.findOneAndDelete({ _id: toObjectId(packageId, 'Package'), vendorId });
    if (!pkg) throw notFound('Package');
    if (pkg.kind === 'addon') await VendorPackage.updateMany({ vendorId }, { $pull: { addonIds: pkg._id } });
    await this.syncListingPricing(vendorId);
  }

  private static async defaultBasis(vendorId: mongoose.Types.ObjectId): Promise<PricingBasis> {
    const vendor = await WeddingVendor.findById(vendorId).select('osCategory').lean();
    if (!vendor?.osCategory) return 'per_event';
    const config = await CategoryConfigService.getByKey(vendor.osCategory).catch(() => null);
    return config?.pricingBasis || 'per_event';
  }

  /**
   * "A vendor never has to update the listing": the public listing's
   * starting price, price unit and package chips are derived from the
   * active packages every time one changes.
   */
  static async syncListingPricing(vendorId: mongoose.Types.ObjectId): Promise<void> {
    const packages = await VendorPackage.find({ vendorId, kind: 'package', isActive: true }).sort({ price: 1 }).lean();
    const cheapest = packages[0];
    const basis = cheapest?.pricingBasis || (await this.defaultBasis(vendorId));
    await WeddingVendor.updateOne(
      { _id: vendorId },
      {
        $set: {
          'pricing.startingPrice': cheapest?.price || 0,
          'pricing.priceUnit': PRICING_BASIS_TO_PRICE_UNIT[basis],
          'pricing.packages': packages.map((p) => ({ label: p.name, startingPrice: p.price })),
        },
      }
    );
    await VendorProfileService.refreshCompleteness(vendorId);
  }
}
