import { Request, Response } from 'express';
import { VendorMediaService } from '../services/vendor-media.service';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';

export class VendorMediaController {

    /**
     * Create Vendor Media
     */
    static async createMedia(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const { vendorId } = req.params;

            const media =
                await VendorMediaService.createMedia(
                    vendorId,
                    req.body
                );

            ApiResponse.success(
                res,
                201,
                {
                    message: 'Vendor media created successfully',
                    data: media
                }
            );

        } catch (error: any) {
            logger.error(
                'Create vendor media error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to create vendor media'
            );
        }
    }


    /**
     * Get Vendor Media
     */
    static async getMedia(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const { vendorId } = req.params;

            const {
                page = 1,
                limit = 20,
                albumId,
                type,
                isFeatured,
            } = req.query;

            const result =
                await VendorMediaService.getMedia(
                    vendorId,
                    Number(page),
                    Number(limit),
                    {
                        albumId: albumId as string,
                        type: type as string,

                        isFeatured:
                            isFeatured !== undefined
                                ? isFeatured === 'true'
                                : undefined,
                    }
                );

            ApiResponse.paginated(
                res,
                result.media,
                result.page,
                result.limit,
                result.total
            );

        } catch (error: any) {
            logger.error(
                'Get vendor media error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to fetch vendor media'
            );
        }
    }


    /**
     * Get Media By ID
     */
    static async getMediaById(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const {
                vendorId,
                mediaId,
            } = req.params;

            const media =
                await VendorMediaService.getMediaById(
                    vendorId,
                    mediaId
                );

            if (!media) {
                ApiResponse.error(
                    res,
                    404,
                    'Vendor media not found'
                );

                return;
            }

            ApiResponse.success(
                res,
                200,
                {
                    message: 'Vendor media fetched successfully',
                    data: media
                }
            );

        } catch (error: any) {
            logger.error(
                'Get vendor media error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to fetch vendor media'
            );
        }
    }


    /**
     * Update Media
     */
    static async updateMedia(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const {
                vendorId,
                mediaId,
            } = req.params;

            const media =
                await VendorMediaService.updateMedia(
                    vendorId,
                    mediaId,
                    req.body
                );

            if (!media) {
                ApiResponse.error(
                    res,
                    404,
                    'Vendor media not found'
                );

                return;
            }

            ApiResponse.success(
                res,
                200,
                {
                    message: 'Vendor media updated successfully',
                    data: media
                }
            );

        } catch (error: any) {
            logger.error(
                'Update vendor media error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to update vendor media'
            );
        }
    }


    /**
     * Delete Media
     */
    static async deleteMedia(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const {
                vendorId,
                mediaId,
            } = req.params;

            const media =
                await VendorMediaService.deleteMedia(
                    vendorId,
                    mediaId
                );

            if (!media) {
                ApiResponse.error(
                    res,
                    404,
                    'Vendor media not found'
                );

                return;
            }

            ApiResponse.success(
                res,
                200,
                {
                    message: 'Vendor media deleted successfully',
                    data: media
                }
            );

        } catch (error: any) {
            logger.error(
                'Delete vendor media error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to delete vendor media'
            );
        }
    }
}