import { Request, Response } from 'express';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';
import { VendorCategoryService } from '../services/vendor-category.service';

export class VendorCategoryController {

    static async createCategory(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const category = await VendorCategoryService.createCategory(req.body);

            ApiResponse.success(
                res,
                201,
                {
                    message: 'Vendor category created successfully',
                    data: category
                }
            );

        } catch (error: any) {
            logger.error(
                'Create vendor category error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to create vendor category'
            );
        }
    }


    /**
     * Get Vendor Categories
     */
    static async getCategories(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const {
                page = 1,
                limit = 50,
                search,
                parentId,
                isActive,
            } = req.query;

            const result =
                await VendorCategoryService.getCategories(
                    Number(page),
                    Number(limit),
                    {
                        search: search as string,
                        parentId: parentId as string,
                        isActive:
                            isActive !== undefined
                                ? isActive === 'true'
                                : undefined,
                    }
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
     * Get Vendor Category By ID
     */
    static async getCategoryById(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const { id } = req.params;

            const category =
                await VendorCategoryService.getCategoryById(id);

            if (!category) {
                ApiResponse.error(
                    res,
                    404,
                    'Vendor category not found'
                );

                return;
            }

            ApiResponse.success(
                res,
                200,
                {
                    message: 'Vendor category fetched successfully',
                    data: category
                },

            );

        } catch (error: any) {
            logger.error(
                'Get vendor category error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to fetch vendor category'
            );
        }
    }


    /**
     * Update Vendor Category
     */
    static async updateCategory(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const { id } = req.params;

            const category = await VendorCategoryService.updateCategory(
                id,
                req.body
            );

            if (!category) {
                ApiResponse.error(
                    res,
                    404,
                    'Vendor category not found'
                );

                return;
            }

            ApiResponse.success(
                res,
                200,
                {
                    message: 'Vendor category updated successfully',
                    data: category
                }
            );


        } catch (error: any) {
            logger.error(
                'Update vendor category error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to update vendor category'
            );
        }
    }


    /**
     * Delete Vendor Category
     */
    static async deleteCategory(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const { id } = req.params;

            const category =
                await VendorCategoryService.deleteCategory(id);

            if (!category) {
                ApiResponse.error(
                    res,
                    404,
                    'Vendor category not found'
                );

                return;
            }

            ApiResponse.success(
                res,
                200,
                {
                    message: 'Vendor category deleted successfully',
                    data: category
                }
            );


        } catch (error: any) {
            logger.error(
                'Delete vendor category error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to delete vendor category'
            );
        }
    }
}