import mongoose from 'mongoose';
import { VendorCategory } from '../models/vendor-category.model';
import logger from '../utils/logger';

export class VendorCategoryService {

  /**
   * Create Vendor Category
   */
  static async createCategory(data: {
    name: string;
    slug: string;
    parentId?: string;
    level?: number;
    icon?: string;
    description?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    try {
      const category = await VendorCategory.create({
        ...data,

        parentId: data.parentId
          ? new mongoose.Types.ObjectId(
              data.parentId
            )
          : null,
      });

      logger.info(
        `Vendor category created: ${category._id}`
      );

      return category;

    } catch (error) {
      logger.error(
        'Error creating vendor category:',
        error
      );

      throw error;
    }
  }


  /**
   * Get Vendor Categories
   */
  static async getCategories(
    page: number = 1,
    limit: number = 50,
    filters?: {
      search?: string;
      parentId?: string;
      topLevelOnly?: boolean;
      isActive?: boolean;
    }
  ) {
    try {
      const skip = (page - 1) * limit;

      const query: any = {
        isDeleted: false,
      };


      // Search
      if (filters?.search) {
        query.$or = [
          {
            name: {
              $regex: filters.search,
              $options: 'i',
            },
          },
          {
            slug: {
              $regex: filters.search,
              $options: 'i',
            },
          },
        ];
      }


      // Parent Category Filter
      if (filters?.parentId) {
        query.parentId =
          new mongoose.Types.ObjectId(
            filters.parentId
          );
      } else if (filters?.topLevelOnly) {
        // Only categories with no parent (parentId: null) — e.g. the
        // vendor enquiry form's category dropdown, which should offer
        // "Venue"/"Photographers"/etc., not their sub-categories.
        query.parentId = null;
      }


      // Active Filter
      if (filters?.isActive !== undefined) {
        query.isActive =
          filters.isActive;
      }


      const [
        categories,
        total,
      ] = await Promise.all([
        VendorCategory.find(query)
          .populate(
            'parentId',
            'name slug'
          )
          .sort({
            sortOrder: 1,
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean(),

        VendorCategory.countDocuments(query),
      ]);


      return {
        categories,
        page,
        limit,
        total,
        totalPages: Math.ceil(
          total / limit
        ),
      };

    } catch (error) {
      logger.error(
        'Error fetching vendor categories:',
        error
      );

      throw error;
    }
  }


  /**
   * Get Vendor Category By ID
   */
  static async getCategoryById(
    id: string
  ) {
    try {
      const category =
        await VendorCategory.findOne({
          _id: id,
          isDeleted: false,
        })
          .populate(
            'parentId',
            'name slug'
          )
          .lean();

      return category;

    } catch (error) {
      logger.error(
        'Error fetching vendor category:',
        error
      );

      throw error;
    }
  }


  /**
   * Update Vendor Category
   */
  static async updateCategory(
    id: string,
    data: {
      name?: string;
      slug?: string;
      parentId?: string | null;
      level?: number;
      icon?: string;
      description?: string;
      sortOrder?: number;
      isActive?: boolean;
    }
  ) {
    try {
      const updateData: any = {
        ...data,
      };


      if (
        data.parentId !== undefined
      ) {
        updateData.parentId =
          data.parentId
            ? new mongoose.Types.ObjectId(
                data.parentId
              )
            : null;
      }


      const category =
        await VendorCategory.findOneAndUpdate(
          {
            _id: id,
            isDeleted: false,
          },
          updateData,
          {
            new: true,
            runValidators: true,
          }
        )
          .populate(
            'parentId',
            'name slug'
          )
          .lean();

      return category;

    } catch (error) {
      logger.error(
        'Error updating vendor category:',
        error
      );

      throw error;
    }
  }


  /**
   * Soft Delete Vendor Category
   */
  static async deleteCategory(
    id: string
  ) {
    try {
      const category =
        await VendorCategory.findOneAndUpdate(
          {
            _id: id,
            isDeleted: false,
          },
          {
            isDeleted: true,
            isActive: false,
          },
          {
            new: true,
          }
        );

      return category;

    } catch (error) {
      logger.error(
        'Error deleting vendor category:',
        error
      );

      throw error;
    }
  }
}