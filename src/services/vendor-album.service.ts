import mongoose from 'mongoose';
import { VendorAlbum } from '../models/vendor-album.model';
import { WeddingVendor } from '../models/wedding-vendor.model';
import logger from '../utils/logger';

export class VendorAlbumService {

    /**
     * Create Vendor Album
     */
    static async createAlbum(
        vendorId: string,
        data: {
            name: string;
            description?: string;
            coverImage?: string;
            sortOrder?: number;
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
             * Create Album
             */
            const album =
                await VendorAlbum.create({
                    vendorId:
                        new mongoose.Types.ObjectId(
                            vendorId
                        ),

                    name: data.name,

                    description:
                        data.description,

                    coverImage:
                        data.coverImage,

                    sortOrder:
                        data.sortOrder || 0,

                    mediaCount: 0,

                    isDeleted: false,
                });


            logger.info(
                `Vendor album created: ${album._id} for vendor ${vendorId}`
            );


            return album;

        } catch (error) {
            logger.error(
                'Error creating vendor album:',
                error
            );

            throw error;
        }
    }


    /**
     * Get Vendor Albums
     */
    static async getAlbums(
        vendorId: string,
        page: number = 1,
        limit: number = 20,
        filters?: {
            search?: string;
        }
    ) {
        try {
            const skip =
                (page - 1) * limit;


            const query: any = {
                vendorId:
                    new mongoose.Types.ObjectId(
                        vendorId
                    ),

                isDeleted: false,
            };


            /**
             * Search Album
             */
            if (filters?.search) {
                query.$or = [
                    {
                        name: {
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


            const [
                albums,
                total,
            ] = await Promise.all([
                VendorAlbum.find(query)
                    .sort({
                        sortOrder: 1,
                        createdAt: -1,
                    })
                    .skip(skip)
                    .limit(limit)
                    .lean(),

                VendorAlbum.countDocuments(
                    query
                ),
            ]);


            return {
                albums,
                page,
                limit,
                total,
                totalPages: Math.ceil(
                    total / limit
                ),
            };

        } catch (error) {
            logger.error(
                'Error fetching vendor albums:',
                error
            );

            throw error;
        }
    }


    /**
     * Get Album By ID
     */
    static async getAlbumById(
        vendorId: string,
        albumId: string
    ) {
        try {
            const album =
                await VendorAlbum.findOne({
                    _id: albumId,

                    vendorId:
                        new mongoose.Types.ObjectId(
                            vendorId
                        ),

                    isDeleted: false,
                }).lean();

            return album;

        } catch (error) {
            logger.error(
                'Error fetching vendor album:',
                error
            );

            throw error;
        }
    }


    /**
     * Update Vendor Album
     */
    static async updateAlbum(
        vendorId: string,
        albumId: string,
        data: {
            name?: string;
            description?: string;
            coverImage?: string;
            sortOrder?: number;
        }
    ) {
        try {
            const album =
                await VendorAlbum.findOneAndUpdate(
                    {
                        _id: albumId,

                        vendorId:
                            new mongoose.Types.ObjectId(
                                vendorId
                            ),

                        isDeleted: false,
                    },
                    {
                        $set: data,
                    },
                    {
                        new: true,
                        runValidators: true,
                    }
                ).lean();

            return album;

        } catch (error) {
            logger.error(
                'Error updating vendor album:',
                error
            );

            throw error;
        }
    }


    /**
     * Soft Delete Vendor Album
     */
    static async deleteAlbum(
        vendorId: string,
        albumId: string
    ) {
        try {
            const album =
                await VendorAlbum.findOneAndUpdate(
                    {
                        _id: albumId,

                        vendorId:
                            new mongoose.Types.ObjectId(
                                vendorId
                            ),

                        isDeleted: false,
                    },
                    {
                        $set: {
                            isDeleted: true,
                        },
                    },
                    {
                        new: true,
                    }
                );

            return album;

        } catch (error) {
            logger.error(
                'Error deleting vendor album:',
                error
            );

            throw error;
        }
    }
}