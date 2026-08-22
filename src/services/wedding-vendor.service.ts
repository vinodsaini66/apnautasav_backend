import mongoose from 'mongoose';
import { WeddingVendor } from '../models/wedding-vendor.model';
import { VendorCategoryMapping } from '../models/vendor-category-mapping.model';
import logger from '../utils/logger';

export class WeddingVendorService {

  /**
   * Create Wedding Vendor
   */
  static async createVendor(data: {
    entityId?: string;

    businessName: string;
    displayName?: string;
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

    yearEstablished?: number;
    experienceYears?: number;
    teamSize?: number;

    serviceCities?: string[];
    languages?: string[];

    status?: string;
    isVerified?: boolean;
    isFeatured?: boolean;
    isPremium?: boolean;
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
      status?: string;
      isVerified?: boolean;
      isFeatured?: boolean;
      isPremium?: boolean;
      categoryId?: string;
      minPrice?: number;
      maxPrice?: number;
      minRating?: number;
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
       * their category directly, it's a many-to-many mapping)
       */
      if (filters?.categoryId) {
        const vendorIds = await VendorCategoryMapping.find({
          categoryId: filters.categoryId,
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


      const [
        vendors,
        total,
      ] = await Promise.all([
        WeddingVendor.find(query)
          .sort({
            isFeatured: -1,
            isPremium: -1,
            rating: -1,
            createdAt: -1,
          })
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
   * Get Wedding Vendor By ID
   */
  static async getVendorById(
    vendorId: string
  ) {
    try {
      const vendor =
        await WeddingVendor.findOne({
          _id: vendorId,
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
}