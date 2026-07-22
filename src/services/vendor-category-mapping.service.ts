import mongoose from 'mongoose';
import { VendorCategory } from '../models/vendor-category.model';
import { VendorCategoryMapping } from '../models/vendor-category-mapping.model';
import logger from '../utils/logger';
import { WeddingVendor } from '../models/wedding-vendor.model';

export class VendorCategoryMappingService {

    /**
     * Add Category To Vendor
     */
    static async createMapping(
        vendorId: string,
        data: {
            categoryId: string;
            isPrimary?: boolean;
        }
    ) {
        try {

            /**
             * Check Vendor Exists
             */
            const vendor =
                await WeddingVendor.findOne({
                    _id: vendorId,
                    isDeleted: false,
                });

            if (!vendor) {
                throw new Error(
                    'Wedding vendor not found'
                );
            }


            /**
             * Check Category Exists
             */
            const category =
                await VendorCategory.findOne({
                    _id: data.categoryId,
                    isDeleted: false,
                    isActive: true,
                });

            if (!category) {
                throw new Error(
                    'Vendor category not found'
                );
            }


            /**
             * Check Duplicate Mapping
             */
            const existingMapping =
                await VendorCategoryMapping.findOne({
                    vendorId,
                    categoryId: data.categoryId,
                    isActive: true,
                });

            if (existingMapping) {
                throw new Error(
                    'Category is already mapped to this vendor'
                );
            }


            /**
             * If Primary Category
             * Remove Existing Primary Category
             */
            if (data.isPrimary === true) {
                await VendorCategoryMapping.updateMany(
                    {
                        vendorId,
                        isActive: true,
                    },
                    {
                        isPrimary: false,
                    }
                );
            }


            const mapping =
                await VendorCategoryMapping.create({
                    vendorId:
                        new mongoose.Types.ObjectId(
                            vendorId
                        ),

                    categoryId:
                        new mongoose.Types.ObjectId(
                            data.categoryId
                        ),

                    parentCategoryId:
                        category.parentId || undefined,

                    isPrimary:
                        data.isPrimary || false,

                    isActive: true,
                });


            logger.info(
                `Category ${data.categoryId} mapped to vendor ${vendorId}`
            );


            return await VendorCategoryMapping
                .findById(mapping._id)
                .populate(
                    'categoryId',
                    'name slug icon parentId level'
                )
                .lean();

        } catch (error) {
            logger.error(
                'Error creating vendor category mapping:',
                error
            );

            throw error;
        }
    }


    /**
     * Get Vendor Categories
     */
    static async getVendorCategories(
        vendorId: string,
        page: number = 1,
        limit: number = 20
    ) {
        try {
            const skip =
                (page - 1) * limit;


            const query = {
                vendorId:
                    new mongoose.Types.ObjectId(
                        vendorId
                    ),

                isActive: true,
            };


            const [
                categories,
                total,
            ] = await Promise.all([
                VendorCategoryMapping.find(query)
                    .populate(
                        'categoryId',
                        'name slug icon parentId level description'
                    )
                    .sort({
                        isPrimary: -1,
                        createdAt: -1,
                    })
                    .skip(skip)
                    .limit(limit)
                    .lean(),

                VendorCategoryMapping.countDocuments(
                    query
                ),
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
     * Update Vendor Category Mapping
     */
    static async updateMapping(
        vendorId: string,
        mappingId: string,
        data: {
            isPrimary?: boolean;
            isActive?: boolean;
        }
    ) {
        try {

            /**
             * If Setting Primary
             */
            if (data.isPrimary === true) {
                await VendorCategoryMapping.updateMany(
                    {
                        vendorId,
                        isActive: true,
                        _id: {
                            $ne: mappingId,
                        },
                    },
                    {
                        isPrimary: false,
                    }
                );
            }


            const mapping =
                await VendorCategoryMapping.findOneAndUpdate(
                    {
                        _id: mappingId,
                        vendorId,
                        isActive: true,
                    },
                    {
                        $set: data,
                    },
                    {
                        new: true,
                        runValidators: true,
                    }
                )
                    .populate(
                        'categoryId',
                        'name slug icon parentId level'
                    )
                    .lean();


            return mapping;

        } catch (error) {
            logger.error(
                'Error updating vendor category mapping:',
                error
            );

            throw error;
        }
    }


    /**
     * Remove Category From Vendor
     */
    static async deleteMapping(
        vendorId: string,
        mappingId: string
    ) {
        try {

            const mapping =
                await VendorCategoryMapping.findOneAndUpdate(
                    {
                        _id: mappingId,
                        vendorId,
                        isActive: true,
                    },
                    {
                        isActive: false,
                    },
                    {
                        new: true,
                    }
                );


            return mapping;

        } catch (error) {
            logger.error(
                'Error deleting vendor category mapping:',
                error
            );

            throw error;
        }
    }
}