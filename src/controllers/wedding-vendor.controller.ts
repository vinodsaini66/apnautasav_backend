import { Request, Response } from 'express';
import { WeddingVendorService } from '../services/wedding-vendor.service';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';

export class WeddingVendorController {

    /**
     * Create Wedding Vendor
     */
    static async createVendor(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const vendor =
                await WeddingVendorService.createVendor(
                    req.body
                );

            ApiResponse.success(
                res,
                201,
                {
                    message: 'Wedding vendor created successfully',
                    data: vendor
                }
            );

        } catch (error: any) {
            logger.error(
                'Create wedding vendor error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to create wedding vendor'
            );
        }
    }


    /**
     * Get Wedding Vendors
     */
    static async getVendors(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const {
                page = 1,
                limit = 20,
                search,
                city,
                state,
                status,
                isVerified,
                isFeatured,
                isPremium,
                categoryId,
                minPrice,
                maxPrice,
                minRating,
            } = req.query;

            const result =
                await WeddingVendorService.getVendors(
                    Number(page),
                    Number(limit),
                    {
                        search: search as string,
                        city: city as string,
                        state: state as string,
                        status: status as string,
                        isVerified: isVerified !== undefined ? isVerified === 'true' : undefined,
                        isFeatured: isFeatured !== undefined ? isFeatured === 'true' : undefined,
                        isPremium: isPremium !== undefined ? isPremium === 'true' : undefined,
                        categoryId: categoryId as string,
                        minPrice: minPrice !== undefined ? Number(minPrice) : undefined,
                        maxPrice: maxPrice !== undefined ? Number(maxPrice) : undefined,
                        minRating: minRating !== undefined ? Number(minRating) : undefined,
                    }
                );

            ApiResponse.paginated(
                res,
                result.vendors,
                result.page,
                result.limit,
                result.total
            );

        } catch (error: any) {
            logger.error(
                'Get wedding vendors error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to fetch wedding vendors'
            );
        }
    }


    /**
     * Get Wedding Vendor By ID
     */
    static async getVendorById(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const { vendorId } =
                req.params;

            const vendor =
                await WeddingVendorService
                    .getVendorById(vendorId);

            if (!vendor) {
                ApiResponse.error(
                    res,
                    404,
                    'Wedding vendor not found'
                );

                return;
            }

            ApiResponse.success(
                res,
                200,
                {
                    data: vendor,
                    message: 'Wedding vendor fetched successfully'
                }
            );


        } catch (error: any) {
            logger.error(
                'Get wedding vendor error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to fetch wedding vendor'
            );
        }
    }


    /**
     * Update Wedding Vendor
     */
    static async updateVendor(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const { vendorId } =
                req.params;

            const vendor =
                await WeddingVendorService
                    .updateVendor(
                        vendorId,
                        req.body
                    );

            if (!vendor) {
                ApiResponse.error(
                    res,
                    404,
                    'Wedding vendor not found'
                );

                return;
            }

            ApiResponse.success(
                res,
                200,
                {
                    message: 'Wedding vendor updated successfully',
                    data: vendor
                }
            );

        } catch (error: any) {
            logger.error(
                'Update wedding vendor error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to update wedding vendor'
            );
        }
    }


    /**
     * Delete Wedding Vendor
     */
    static async deleteVendor(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const { vendorId } =
                req.params;

            const vendor =
                await WeddingVendorService
                    .deleteVendor(vendorId);

            if (!vendor) {
                ApiResponse.error(
                    res,
                    404,
                    'Wedding vendor not found'
                );

                return;
            }

            ApiResponse.success(
                res,
                200,
                {
                    message: 'Wedding vendor deleted successfully',
                    data: vendor
                }
            );

        } catch (error: any) {
            logger.error(
                'Delete wedding vendor error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to delete wedding vendor'
            );
        }
    }
}