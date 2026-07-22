import mongoose from 'mongoose';

import { VendorMedia } from '../models/vendor-media.model';
import { VendorAlbum } from '../models/vendor-album.model';
import { WeddingVendor } from '../models/wedding-vendor.model';

import logger from '../utils/logger';

export class VendorMediaService {

  /**
   * Create Vendor Media
   */
  static async createMedia(
    vendorId: string,
    data: {
      albumId?: string;

      type: 'image' | 'video';

      url: string;
      thumbnailUrl?: string;

      title?: string;
      description?: string;

      width?: number;
      height?: number;
      duration?: number;

      isFeatured?: boolean;
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
       * Check Album
       * If Album ID Is Provided
       */
      if (data.albumId) {
        const album =
          await VendorAlbum.findOne({
            _id: data.albumId,

            vendorId:
              new mongoose.Types.ObjectId(
                vendorId
              ),

            isDeleted: false,
          });

        if (!album) {
          throw new Error(
            'Vendor album not found'
          );
        }
      }


      /**
       * Create Media
       */
      const media =
        await VendorMedia.create({

          vendorId:
            new mongoose.Types.ObjectId(
              vendorId
            ),

          albumId:
            data.albumId
              ? new mongoose.Types.ObjectId(
                  data.albumId
                )
              : undefined,

          type: data.type,

          url: data.url,

          thumbnailUrl:
            data.thumbnailUrl,

          title:
            data.title,

          description:
            data.description,

          width:
            data.width,

          height:
            data.height,

          duration:
            data.duration,

          isFeatured:
            data.isFeatured || false,

          sortOrder:
            data.sortOrder || 0,

          isDeleted: false,
        });


      /**
       * Update Album Media Count
       */
      if (data.albumId) {
        await VendorAlbum.findByIdAndUpdate(
          data.albumId,
          {
            $inc: {
              mediaCount: 1,
            },
          }
        );
      }


      logger.info(
        `Vendor media created: ${media._id}`
      );


      return media;

    } catch (error) {
      logger.error(
        'Error creating vendor media:',
        error
      );

      throw error;
    }
  }


  /**
   * Get Vendor Media
   */
  static async getMedia(
    vendorId: string,
    page: number = 1,
    limit: number = 20,
    filters?: {
      albumId?: string;
      type?: string;
      isFeatured?: boolean;
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
       * Album Filter
       */
      if (filters?.albumId) {
        query.albumId =
          new mongoose.Types.ObjectId(
            filters.albumId
          );
      }


      /**
       * Media Type Filter
       */
      if (filters?.type) {
        query.type =
          filters.type;
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


      const [
        media,
        total,
      ] = await Promise.all([

        VendorMedia.find(query)

          .populate(
            'albumId',
            'name coverImage'
          )

          .sort({
            isFeatured: -1,
            sortOrder: 1,
            createdAt: -1,
          })

          .skip(skip)

          .limit(limit)

          .lean(),

        VendorMedia.countDocuments(
          query
        ),
      ]);


      return {
        media,
        page,
        limit,
        total,
        totalPages: Math.ceil(
          total / limit
        ),
      };

    } catch (error) {
      logger.error(
        'Error fetching vendor media:',
        error
      );

      throw error;
    }
  }


  /**
   * Get Media By ID
   */
  static async getMediaById(
    vendorId: string,
    mediaId: string
  ) {
    try {

      const media =
        await VendorMedia.findOne({

          _id: mediaId,

          vendorId:
            new mongoose.Types.ObjectId(
              vendorId
            ),

          isDeleted: false,

        })

          .populate(
            'albumId',
            'name coverImage'
          )

          .lean();


      return media;

    } catch (error) {
      logger.error(
        'Error fetching vendor media:',
        error
      );

      throw error;
    }
  }


  /**
   * Update Media
   */
  static async updateMedia(
    vendorId: string,
    mediaId: string,
    data: {
      albumId?: string;

      type?: 'image' | 'video';

      url?: string;
      thumbnailUrl?: string;

      title?: string;
      description?: string;

      width?: number;
      height?: number;
      duration?: number;

      isFeatured?: boolean;
      sortOrder?: number;
    }
  ) {
    try {

      /**
       * Get Existing Media
       */
      const existingMedia =
        await VendorMedia.findOne({

          _id: mediaId,

          vendorId:
            new mongoose.Types.ObjectId(
              vendorId
            ),

          isDeleted: false,

        });


      if (!existingMedia) {
        return null;
      }


      /**
       * Handle Album Change
       */
      if (
        data.albumId !== undefined &&
        data.albumId !==
          existingMedia.albumId?.toString()
      ) {

        /**
         * Validate New Album
         */
        if (data.albumId) {

          const newAlbum =
            await VendorAlbum.findOne({

              _id: data.albumId,

              vendorId:
                new mongoose.Types.ObjectId(
                  vendorId
                ),

              isDeleted: false,

            });

          if (!newAlbum) {
            throw new Error(
              'New vendor album not found'
            );
          }
        }


        /**
         * Decrease Old Album Count
         */
        if (existingMedia.albumId) {

          await VendorAlbum.findByIdAndUpdate(
            existingMedia.albumId,
            {
              $inc: {
                mediaCount: -1,
              },
            }
          );
        }


        /**
         * Increase New Album Count
         */
        if (data.albumId) {

          await VendorAlbum.findByIdAndUpdate(
            data.albumId,
            {
              $inc: {
                mediaCount: 1,
              },
            }
          );
        }
      }


      const updateData: any = {
        ...data,
      };


      /**
       * Convert Album ID
       */
      if (
        data.albumId !== undefined
      ) {
        updateData.albumId =
          data.albumId
            ? new mongoose.Types.ObjectId(
                data.albumId
              )
            : null;
      }


      const media =
        await VendorMedia.findOneAndUpdate(

          {
            _id: mediaId,

            vendorId:
              new mongoose.Types.ObjectId(
                vendorId
              ),

            isDeleted: false,
          },

          {
            $set: updateData,
          },

          {
            new: true,
            runValidators: true,
          }

        )

          .populate(
            'albumId',
            'name coverImage'
          )

          .lean();


      return media;

    } catch (error) {
      logger.error(
        'Error updating vendor media:',
        error
      );

      throw error;
    }
  }


  /**
   * Delete Media
   */
  static async deleteMedia(
    vendorId: string,
    mediaId: string
  ) {
    try {

      const media =
        await VendorMedia.findOne({

          _id: mediaId,

          vendorId:
            new mongoose.Types.ObjectId(
              vendorId
            ),

          isDeleted: false,

        });


      if (!media) {
        return null;
      }


      /**
       * Soft Delete Media
       */
      media.isDeleted = true;

      await media.save();


      /**
       * Update Album Media Count
       */
      if (media.albumId) {

        await VendorAlbum.findByIdAndUpdate(
          media.albumId,
          {
            $inc: {
              mediaCount: -1,
            },
          }
        );
      }


      return media;

    } catch (error) {
      logger.error(
        'Error deleting vendor media:',
        error
      );

      throw error;
    }
  }
}