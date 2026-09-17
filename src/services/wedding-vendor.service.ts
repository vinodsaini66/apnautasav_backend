import mongoose from 'mongoose';
import { WeddingVendor, type IVendorBranchLocation } from '../models/wedding-vendor.model';
import { VendorCategoryMapping } from '../models/vendor-category-mapping.model';
import { Vendor } from '../models/vendor.model';
import { VendorReview } from '../models/vendor-review.model';
import { VendorInquiry } from '../models/vendor-enquery.model';
import { Wedding } from '../models/wedding.model';
import { Collaborator } from '../models/collaborator.model';
import logger from '../utils/logger';

export class WeddingVendorService {

  /**
   * Create Wedding Vendor
   */
  static async createVendor(data: {
    entityId?: string;

    businessName: string;
    displayName?: string;
    oldName?: string;
    slug: string;

    description?: string;
    shortDescription?: string;

    logo?: string;
    coverImage?: string;

    contactPerson?: string;
    email?: string;
    phone?: string;
    alternatePhone?: string;
    whatsappNumber?: string;
    website?: string;

    location?: {
      address?: string;
      area?: string;
      city?: string;
      state?: string;
      country?: string;
      pincode?: string;
      latitude?: number;
      longitude?: number;
      googlePlaceId?: string;
    };
    // Additional branch/service locations beyond the primary `location`.
    locations?: IVendorBranchLocation[];
    categorySlug?: string;

    profileDetails?: {
      services?: string[];
      workingStyle?: string;
      paymentTerms?: string;
      travelCost?: string;
      deliveryTime?: string;
    };

    yearEstablished?: number;
    experienceYears?: number;
    teamSize?: number;

    serviceCities?: string[];
    languages?: string[];

    status?: string;
    isVerified?: boolean;
    isFeatured?: boolean;
    isPremium?: boolean;

    awards?: string[];

    pricing?: {
      startingPrice?: number;
      priceUnit?: string;
      destinationPrice?: string;
      destinationPriceUnit?: string;
      packages?: { label: string; startingPrice: number }[];
    };

    // Venue-specific — harmless/empty for any other vendor category.
    venueDetails?: {
      guestCapacityMin?: number;
      guestCapacityMax?: number;
      venueTypes?: string[];
      vegPricePerPlate?: number;
      nonVegPricePerPlate?: number;
      rentalPrice?: number;
    };
  }) {
    try {
      const vendor =
        await WeddingVendor.create({
          ...data,

          entityId: data.entityId
            ? new mongoose.Types.ObjectId(
                data.entityId
              )
            : undefined,
        });

      logger.info(
        `Wedding vendor created: ${vendor._id}`
      );

      return vendor;

    } catch (error) {
      logger.error(
        'Error creating wedding vendor:',
        error
      );

      throw error;
    }
  }


  /**
   * Get Wedding Vendors
   */
  static async getVendors(
    page: number = 1,
    limit: number = 20,
    filters?: {
      search?: string;
      city?: string;
      state?: string;
      area?: string;
      status?: string;
      isVerified?: boolean;
      isFeatured?: boolean;
      isPremium?: boolean;
      categoryId?: string;
      minPrice?: number;
      maxPrice?: number;
      minRating?: number;
      minReviews?: number;
      hasAwards?: boolean;
      sortBy?: 'recommended' | 'rating' | 'reviews' | 'price_low' | 'price_high' | 'newest';
    }
  ) {
    try {
      const skip =
        (page - 1) * limit;

      const query: any = {
        isDeleted: false,
      };


      /**
       * Category Filter (via VendorCategoryMapping - vendors don't store
       * their category directly, it's a many-to-many mapping).
       *
       * The public directory only ever offers *top-level* category ids as
       * filter chips (see VendorCategoryService.getPublicCategories /
       * topLevelOnly), but most real mapping rows were imported tagged to a
       * *sub-category* id (e.g. "Decorators" under "Planning & Decor") -
       * see import-wedmegood-vendors.ts's CATEGORY_SLUG_MAP. Matching only
       * `categoryId` therefore misses every vendor tagged at the child
       * level whenever a parent category is selected, even though
       * `parentCategoryId` was already being stored on every mapping row
       * for exactly this case - it just was never read here. Matching
       * either field against the requested id covers both a parent-level
       * selection (matches via parentCategoryId) and a selection that
       * happens to already be the exact leaf category (matches via
       * categoryId).
       */
      if (filters?.categoryId) {
        const vendorIds = await VendorCategoryMapping.find({
          $or: [
            { categoryId: filters.categoryId },
            { parentCategoryId: filters.categoryId },
          ],
          isActive: true,
        }).distinct('vendorId');

        query._id = { $in: vendorIds };
      }


      /**
       * Budget Filter
       */
      if (filters?.minPrice !== undefined || filters?.maxPrice !== undefined) {
        query['pricing.startingPrice'] = {};
        if (filters.minPrice !== undefined) query['pricing.startingPrice'].$gte = filters.minPrice;
        if (filters.maxPrice !== undefined) query['pricing.startingPrice'].$lte = filters.maxPrice;
      }


      /**
       * Rating Filter
       */
      if (filters?.minRating !== undefined) {
        query.rating = { $gte: filters.minRating };
      }


      /**
       * Search
       */
      if (filters?.search) {
        query.$or = [
          {
            businessName: {
              $regex: filters.search,
              $options: 'i',
            },
          },
          {
            displayName: {
              $regex: filters.search,
              $options: 'i',
            },
          },
          {
            description: {
              $regex: filters.search,
              $options: 'i',
            },
          },
        ];
      }


      /**
       * City Filter
       */
      if (filters?.city) {
        query['location.city'] = {
          $regex: filters.city,
          $options: 'i',
        };
      }


      /**
       * State Filter
       */
      if (filters?.state) {
        query['location.state'] = {
          $regex: filters.state,
          $options: 'i',
        };
      }


      /**
       * Locality/Area Filter
       */
      if (filters?.area) {
        query['location.area'] = {
          $regex: filters.area,
          $options: 'i',
        };
      }


      /**
       * Minimum Review Count Filter
       */
      if (filters?.minReviews !== undefined) {
        query.reviewCount = { $gte: filters.minReviews };
      }


      /**
       * Award Winners Filter
       */
      if (filters?.hasAwards) {
        query['awards.0'] = { $exists: true };
      }


      /**
       * Status Filter
       */
      if (filters?.status) {
        query.status =
          filters.status;
      }


      /**
       * Verified Filter
       */
      if (
        filters?.isVerified !== undefined
      ) {
        query.isVerified =
          filters.isVerified;
      }


      /**
       * Featured Filter
       */
      if (
        filters?.isFeatured !== undefined
      ) {
        query.isFeatured =
          filters.isFeatured;
      }


      /**
       * Premium Filter
       */
      if (
        filters?.isPremium !== undefined
      ) {
        query.isPremium =
          filters.isPremium;
      }


      // "Recommended" (the default, unchanged) keeps featured/premium
      // listings pinned to the top ahead of rating — every other sort is an
      // explicit visitor choice, so it sorts purely on that one signal
      // instead of still deferring to featured/premium placement.
      const SORT_STAGES: Record<string, Record<string, 1 | -1>> = {
        recommended: { isFeatured: -1, isPremium: -1, rating: -1, createdAt: -1 },
        rating: { rating: -1, reviewCount: -1 },
        reviews: { reviewCount: -1, rating: -1 },
        price_low: { 'pricing.startingPrice': 1 },
        price_high: { 'pricing.startingPrice': -1 },
        newest: { createdAt: -1 },
      };
      const sortStage = SORT_STAGES[filters?.sortBy ?? 'recommended'] ?? SORT_STAGES.recommended;

      const [
        vendors,
        total,
      ] = await Promise.all([
        WeddingVendor.find(query)
          .sort(sortStage)
          .skip(skip)
          .limit(limit)
          .lean(),

        WeddingVendor.countDocuments(
          query
        ),
      ]);


      return {
        vendors,
        page,
        limit,
        total,
        totalPages: Math.ceil(
          total / limit
        ),
      };

    } catch (error) {
      logger.error(
        'Error fetching wedding vendors:',
        error
      );

      throw error;
    }
  }


  /**
   * Get Wedding Vendor By ID or slug — the public profile page's URL uses
   * the human-readable `slug` (e.g. "priya-decor-jaipur-4f2a"), not the raw
   * Mongo _id, so this accepts either: a valid ObjectId looks up by `_id`
   * (kept for any existing internal/bridge callers using the real id),
   * anything else is treated as a slug.
   */
  static async getVendorById(
    vendorId: string
  ) {
    try {
      const lookup = mongoose.Types.ObjectId.isValid(vendorId)
        ? { _id: vendorId }
        : { slug: vendorId };

      const vendor =
        await WeddingVendor.findOne({
          ...lookup,
          isDeleted: false,
        }).lean();

      return vendor;

    } catch (error) {
      logger.error(
        'Error fetching wedding vendor:',
        error
      );

      throw error;
    }
  }


  /**
   * Update Wedding Vendor
   */
  static async updateVendor(
    vendorId: string,
    data: any
  ) {
    try {
      const updateData: any = {
        ...data,
      };


      /**
       * Convert Entity ID
       */
      if (
        data.entityId !== undefined
      ) {
        updateData.entityId =
          data.entityId
            ? new mongoose.Types.ObjectId(
                data.entityId
              )
            : undefined;
      }


      const vendor =
        await WeddingVendor.findOneAndUpdate(
          {
            _id: vendorId,
            isDeleted: false,
          },
          updateData,
          {
            new: true,
            runValidators: true,
          }
        ).lean();

      return vendor;

    } catch (error) {
      logger.error(
        'Error updating wedding vendor:',
        error
      );

      throw error;
    }
  }


  /**
   * Soft Delete Wedding Vendor
   */
  static async deleteVendor(
    vendorId: string
  ) {
    try {
      const vendor =
        await WeddingVendor.findOneAndUpdate(
          {
            _id: vendorId,
            isDeleted: false,
          },
          {
            isDeleted: true,
            status: 'inactive',
          },
          {
            new: true,
          }
        );

      return vendor;

    } catch (error) {
      logger.error(
        'Error deleting wedding vendor:',
        error
      );

      throw error;
    }
  }


  /**
   * Create Vendor Inquiry
   * The public profile page's "Send Message" CTA — deliberately requires a
   * logged-in caller (see route), consistent with contact info itself being
   * login-gated. Independent of "Add to My Wedding" (weddingId stays
   * unset here) — this is a lightweight first-contact message, not a
   * tracker entry.
   */
  static async createInquiry(
    vendorId: string,
    userId: string | undefined,
    data: {
      fullName: string;
      phone: string;
      email?: string;
      whatsappNumber?: string;
      functionDate?: string;
      guestCount?: number;
      functionType?: string;
      message?: string;
    }
  ) {
    try {
      const vendor = await WeddingVendor.findOne({ _id: vendorId, isDeleted: false });
      if (!vendor) {
        throw new Error('Wedding vendor not found');
      }

      const inquiry = await VendorInquiry.create({
        weddingVendorId: vendor._id,
        userId: userId ? new mongoose.Types.ObjectId(userId) : undefined,
        fullName: data.fullName,
        phone: data.phone,
        email: data.email,
        whatsappNumber: data.whatsappNumber,
        functionDate: data.functionDate ? new Date(data.functionDate) : undefined,
        guestCount: data.guestCount,
        functionType: data.functionType,
        message: data.message,
        source: 'website',
        status: 'new',
      });

      await WeddingVendor.updateOne({ _id: vendor._id }, { $inc: { inquiryCount: 1 } });

      return inquiry;
    } catch (error) {
      logger.error('Error creating wedding vendor inquiry:', error);
      throw error;
    }
  }


  /**
   * Get Vendor Reviews (public profile page)
   * `VendorReview.vendorId` refs the private, wedding-scoped `Vendor`
   * tracker, not `WeddingVendor` directly (see CLAUDE.md's architecture
   * note) — reviews roll up to the listing through every tracker copy
   * that links back here via `marketplaceVendorId`. Also returns a
   * 1-5 star rating distribution for the profile page's bar chart.
   */
  static async getVendorReviews(vendorId: string, page: number = 1, limit: number = 10) {
    try {
      const skip = (page - 1) * limit;

      const trackerIds = await Vendor.find({ marketplaceVendorId: vendorId }, { _id: 1 }).distinct('_id');

      const filter = { vendorId: { $in: trackerIds } };

      const [reviews, total, distribution] = await Promise.all([
        VendorReview.find(filter)
          .populate('reviewerId', 'fullName')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        VendorReview.countDocuments(filter),
        VendorReview.aggregate([
          { $match: { vendorId: { $in: trackerIds } } },
          { $group: { _id: '$rating', count: { $sum: 1 } } },
        ]),
      ]);

      const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const row of distribution as { _id: number; count: number }[]) {
        ratingDistribution[row._id] = row.count;
      }

      return {
        reviews,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        ratingDistribution,
      };
    } catch (error) {
      logger.error('Error fetching wedding vendor reviews:', error);
      throw error;
    }
  }


  /**
   * Get "my tracker link" for this listing — whether the current user has
   * already added this vendor to one of their own weddings (as a private
   * `Vendor` tracker entry). Backs the "Write a Review" button: reviews are
   * only submittable against a tracker entry (see vendor-review routes
   * under /weddings/:weddingId/vendors/:vendorId/reviews), so the profile
   * page needs to know whether one already exists, and where, before it can
   * link there — or prompt "Add to My Wedding first" when none does.
   */
  static async getMyTrackerLink(vendorId: string, userId: string) {
    try {
      const [ownedWeddings, collaborations] = await Promise.all([
        Wedding.find({ createdBy: userId }, { _id: 1 }).lean(),
        Collaborator.find({ userId, invitationStatus: 'accepted' }, { weddingId: 1 }).lean(),
      ]);

      const weddingIds = [
        ...ownedWeddings.map((w) => w._id),
        ...collaborations.map((c) => c.weddingId),
      ];

      if (weddingIds.length === 0) return null;

      const tracker = await Vendor.findOne(
        { marketplaceVendorId: vendorId, weddingId: { $in: weddingIds } },
        { _id: 1, weddingId: 1 }
      ).lean();

      if (!tracker) return null;

      return {
        weddingId: String(tracker.weddingId),
        trackerVendorId: String(tracker._id),
      };
    } catch (error) {
      logger.error('Error resolving wedding vendor tracker link:', error);
      throw error;
    }
  }
}