import mongoose from 'mongoose';
import { Vendor } from '../models/vendor.model';
import { VendorReview } from '../models/vendor-review.model';
import { WeddingVendor } from '../models/wedding-vendor.model';
import logger from '../utils/logger';

interface RatingAggregate {
  avgRating: number;
  count: number;
}

const aggregateRatings = async (vendorIds: mongoose.Types.ObjectId[]): Promise<RatingAggregate> => {
  if (vendorIds.length === 0) {
    return { avgRating: 0, count: 0 };
  }

  const [result] = await VendorReview.aggregate([
    { $match: { vendorId: { $in: vendorIds } } },
    {
      $group: {
        _id: null,
        avgRating: { $avg: '$rating' },
        count: { $sum: 1 }
      }
    }
  ]);

  return {
    avgRating: result?.avgRating ?? 0,
    count: result?.count ?? 0
  };
};

/**
 * Recomputes a Vendor's denormalized rating/reviewCount from its
 * VendorReview docs. If the vendor was added from the public marketplace
 * (marketplaceVendorId set), also rolls up reviews across every
 * wedding-scoped Vendor sharing that same marketplace listing into the
 * WeddingVendor's own rating/reviewCount ("verified booked reviews").
 */
export const recalculateVendorRating = async (vendorId: string | mongoose.Types.ObjectId): Promise<void> => {
  try {
    const vendorObjectId = new mongoose.Types.ObjectId(vendorId);

    const { avgRating, count } = await aggregateRatings([vendorObjectId]);

    const vendor = await Vendor.findByIdAndUpdate(
      vendorObjectId,
      count > 0
        ? { $set: { rating: avgRating, reviewCount: count } }
        : { $set: { reviewCount: 0 }, $unset: { rating: 1 } },
      { new: true }
    );

    if (!vendor || !vendor.marketplaceVendorId) {
      return;
    }

    const linkedVendors = await Vendor.find({ marketplaceVendorId: vendor.marketplaceVendorId }, { _id: 1 }).lean();
    const linkedVendorIds = linkedVendors.map((v) => v._id as mongoose.Types.ObjectId);

    const marketplaceAggregate = await aggregateRatings(linkedVendorIds);

    await WeddingVendor.findByIdAndUpdate(vendor.marketplaceVendorId, {
      $set: {
        rating: marketplaceAggregate.avgRating,
        reviewCount: marketplaceAggregate.count
      }
    });
  } catch (error) {
    logger.error('Error recalculating vendor rating:', error);
    throw error;
  }
};
