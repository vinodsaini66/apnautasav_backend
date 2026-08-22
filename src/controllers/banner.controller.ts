import { Request, Response } from 'express';
import { BannerService } from '../services/banner.service';
import { uploadBufferToS3 } from '../config/s3';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';

export class BannerController {
  /**
   * Upload a banner image to S3 and return its URL. Called first, then the
   * returned `url` is passed as `imageUrl` to POST /banners.
   */
  static async uploadImage(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        ApiResponse.error(res, 400, 'No image file provided (field name: "image")');
        return;
      }

      const url = await uploadBufferToS3(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        'banners'
      );

      ApiResponse.success(res, 201, {
        message: 'Banner image uploaded successfully',
        data: { url },
      });
    } catch (error: any) {
      logger.error('Upload banner image error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to upload banner image');
    }
  }

  static async createBanner(req: Request, res: Response): Promise<void> {
    try {
      const banner = await BannerService.createBanner(req.body, req.user!.userId);
      ApiResponse.success(res, 201, { message: 'Banner created successfully', data: banner });
    } catch (error: any) {
      logger.error('Create banner error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to create banner');
    }
  }

  /** Admin listing — every banner, active or not. */
  static async getAllBanners(req: Request, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 20 } = req.query;
      const result = await BannerService.getAllBanners(Number(page), Number(limit));
      ApiResponse.paginated(res, result.banners, result.page, result.limit, result.total);
    } catch (error: any) {
      logger.error('Get banners error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch banners');
    }
  }

  /** What the dashboard carousel actually renders. */
  static async getActiveBanners(_req: Request, res: Response): Promise<void> {
    try {
      const banners = await BannerService.getActiveBanners();
      ApiResponse.success(res, 200, { message: 'Active banners fetched successfully', data: banners });
    } catch (error: any) {
      logger.error('Get active banners error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch active banners');
    }
  }

  static async getBannerById(req: Request, res: Response): Promise<void> {
    try {
      const banner = await BannerService.getBannerById(req.params.bannerId);
      if (!banner) {
        ApiResponse.error(res, 404, 'Banner not found');
        return;
      }
      ApiResponse.success(res, 200, { message: 'Banner fetched successfully', data: banner });
    } catch (error: any) {
      logger.error('Get banner error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch banner');
    }
  }

  static async updateBanner(req: Request, res: Response): Promise<void> {
    try {
      const banner = await BannerService.updateBanner(req.params.bannerId, req.body);
      if (!banner) {
        ApiResponse.error(res, 404, 'Banner not found');
        return;
      }
      ApiResponse.success(res, 200, { message: 'Banner updated successfully', data: banner });
    } catch (error: any) {
      logger.error('Update banner error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to update banner');
    }
  }

  static async deleteBanner(req: Request, res: Response): Promise<void> {
    try {
      const banner = await BannerService.deleteBanner(req.params.bannerId);
      if (!banner) {
        ApiResponse.error(res, 404, 'Banner not found');
        return;
      }
      ApiResponse.success(res, 200, { message: 'Banner deleted successfully', data: banner });
    } catch (error: any) {
      logger.error('Delete banner error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to delete banner');
    }
  }

  /**
   * Called by the frontend right before it navigates to `redirectUrl` — a
   * sponsor pays partly for this number, so it needs to be reliable even
   * though the user is about to leave the page (frontend should fire this
   * with `keepalive: true` / `navigator.sendBeacon`).
   */
  static async trackClick(req: Request, res: Response): Promise<void> {
    try {
      const banner = await BannerService.recordClick(req.params.bannerId);
      if (!banner) {
        ApiResponse.error(res, 404, 'Banner not found');
        return;
      }
      ApiResponse.success(res, 200, { message: 'Click recorded', data: { clicks: banner.clicks } });
    } catch (error: any) {
      logger.error('Track banner click error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to record click');
    }
  }
}
