import { Request, Response } from 'express';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';
import { VendorAlbumService } from '../services/vendor-album.service';

export class VendorAlbumController {

    static async createAlbum(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const { vendorId } = req.params;

            const album =
                await VendorAlbumService.createAlbum(
                    vendorId,
                    req.body
                );

            ApiResponse.success(
                res,
                201,
                {
                    message: 'Vendor album created successfully',
                    data: album
                }
            );

        } catch (error: any) {
            logger.error(
                'Create vendor album error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to create vendor album'
            );
        }
    }

    static async getAlbums(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const { vendorId } = req.params;

            const {
                page = 1,
                limit = 20,
                search,
            } = req.query;

            const result =
                await VendorAlbumService.getAlbums(
                    vendorId,
                    Number(page),
                    Number(limit),
                    {
                        search: search as string,
                    }
                );

            ApiResponse.paginated(
                res,
                result.albums,
                result.page,
                result.limit,
                result.total
            );

        } catch (error: any) {
            logger.error(
                'Get vendor albums error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to fetch vendor albums'
            );
        }
    }

    static async getAlbumById(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const {
                vendorId,
                albumId,
            } = req.params;

            const album =
                await VendorAlbumService.getAlbumById(
                    vendorId,
                    albumId
                );

            if (!album) {
                ApiResponse.error(
                    res,
                    404,
                    'Vendor album not found'
                );

                return;
            }

            ApiResponse.success(
                res,
                200,
                {
                    message: 'Vendor album fetched successfully',
                    data: album
                }
            );

        } catch (error: any) {
            logger.error(
                'Get vendor album error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to fetch vendor album'
            );
        }
    }


    static async updateAlbum(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const {
                vendorId,
                albumId,
            } = req.params;

            const album =
                await VendorAlbumService.updateAlbum(
                    vendorId,
                    albumId,
                    req.body
                );

            if (!album) {
                ApiResponse.error(
                    res,
                    404,
                    'Vendor album not found'
                );

                return;
            }

            ApiResponse.success(
                res,
                200,
                {
                    message: 'Vendor album updated successfully',
                    data: album
                }
            );

        } catch (error: any) {
            logger.error(
                'Update vendor album error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to update vendor album'
            );
        }
    }

    static async deleteAlbum(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const {
                vendorId,
                albumId,
            } = req.params;

            const album =
                await VendorAlbumService.deleteAlbum(
                    vendorId,
                    albumId
                );

            if (!album) {
                ApiResponse.error(
                    res,
                    404,
                    'Vendor album not found'
                );

                return;
            }

            ApiResponse.success(
                res,
                200,
                {
                    message: 'Vendor album deleted successfully',
                    data: album
                }
            );

        } catch (error: any) {
            logger.error(
                'Delete vendor album error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to delete vendor album'
            );
        }
    }
}