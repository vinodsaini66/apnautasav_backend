import { Request, Response } from 'express';
import { VendorCategoryMappingService } from '../services/vendor-category-mapping.service';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';

export class VendorCategoryMappingController {

    static async createMapping(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const { vendorId } = req.params;
            const { categoryId, isPrimary } = req.body;

            const mapping = await VendorCategoryMappingService.createMapping(
                vendorId,
                {
                    categoryId,
                    isPrimary,
                }
            );

            ApiResponse.success(
                res,
                201,
                {
                    message: 'Vendor category mapped successfully',
                    data: mapping
                }
            );

        } catch (error: any) {
            logger.error(
                'Create vendor category mapping error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to map vendor category'
            );
        }
    }


    /**
     * Get Vendor Categories
     */
    static async getVendorCategories(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const { vendorId } = req.params;

            const {
                page = 1,
                limit = 20,
            } = req.query;

            const result =
                await VendorCategoryMappingService
                    .getVendorCategories(
                        vendorId,
                        Number(page),
                        Number(limit)
                    );

            ApiResponse.paginated(
                res,
                result.categories,
                result.page,
                result.limit,
                result.total
            );

        } catch (error: any) {
            logger.error(
                'Get vendor categories error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to fetch vendor categories'
            );
        }
    }


    /**
     * Update Vendor Category Mapping
     */
    static async updateMapping(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const {
                vendorId,
                mappingId,
            } = req.params;

            const mapping =
                await VendorCategoryMappingService
                    .updateMapping(
                        vendorId,
                        mappingId,
                        req.body
                    );

            if (!mapping) {
                ApiResponse.error(
                    res,
                    404,
                    'Vendor category mapping not found'
                );

                return;
            }

            ApiResponse.success(
                res,
                200,
                {
                    message: 'Vendor category mapping updated successfully',
                    data: mapping
                }
            );

        } catch (error: any) {
            logger.error(
                'Update vendor category mapping error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to update vendor category mapping'
            );
        }
    }


    /**
     * Delete Vendor Category Mapping
     */
    static async deleteMapping(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const {
                vendorId,
                mappingId,
            } = req.params;

            const mapping =
                await VendorCategoryMappingService
                    .deleteMapping(
                        vendorId,
                        mappingId
                    );

            if (!mapping) {
                ApiResponse.error(
                    res,
                    404,
                    'Vendor category mapping not found'
                );

                return;
            }

            ApiResponse.success(
                res,
                200,
                {
                    message: 'Vendor category mapping deleted successfully',
                    data: mapping
                }
            );

        } catch (error: any) {
            logger.error(
                'Delete vendor category mapping error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to remove vendor category'
            );
        }
    }
}