import { Banner, IBanner } from '../models/banner.model';
import { deleteObjectFromS3ByUrl } from '../config/s3';
import logger from '../utils/logger';

interface BannerInput {
  title?: string;
  imageUrl?: string;
  redirectUrl?: string;
  altText?: string;
  isActive?: boolean;
  sortOrder?: number;
  startDate?: string | null;
  endDate?: string | null;
}

export class BannerService {
  /**
   * Create a new promotional banner.
   */
  static async createBanner(data: BannerInput, createdBy: string): Promise<IBanner> {
    try {
      const banner = await Banner.create({
        title: data.title,
        imageUrl: data.imageUrl,
        redirectUrl: data.redirectUrl,
        altText: data.altText,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
        startDate: data.startDate ?? undefined,
        endDate: data.endDate ?? undefined,
        createdBy,
      });

      logger.info(`Banner created: ${banner._id}`);
      return banner;
    } catch (error) {
      logger.error('Error creating banner:', error);
      throw error;
    }
  }

  /**
   * All banners, for the admin listing — active or not, past or future.
   */
  static async getAllBanners(page: number = 1, limit: number = 20) {
    try {
      const skip = (page - 1) * limit;

      const [banners, total] = await Promise.all([
        Banner.find()
          .sort({ sortOrder: 1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Banner.countDocuments(),
      ]);

      return { banners, page, limit, total, totalPages: Math.ceil(total / limit) };
    } catch (error) {
      logger.error('Error fetching banners:', error);
      throw error;
    }
  }

  /**
   * Only the banners that should actually show right now — active, and
   * inside their optional scheduling window — for the dashboard carousel.
   */
  static async getActiveBanners(): Promise<IBanner[]> {
    try {
      const now = new Date();

      const banners = await Banner.find({
        isActive: true,
        $and: [
          { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: now } }] },
          { $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: now } }] },
        ],
      })
        .sort({ sortOrder: 1, createdAt: -1 })
        .select('title imageUrl redirectUrl altText sortOrder')
        .lean();

      // Fire-and-forget impression count — a sponsor's banner being served
      // to the dashboard counts as an impression. Never block the response
      // on this.
      if (banners.length > 0) {
        Banner.updateMany(
          { _id: { $in: banners.map((b) => b._id) } },
          { $inc: { impressions: 1 } }
        ).catch((err) => logger.warn('Could not record banner impressions:', err));
      }

      return banners as unknown as IBanner[];
    } catch (error) {
      logger.error('Error fetching active banners:', error);
      throw error;
    }
  }

  static async getBannerById(bannerId: string): Promise<IBanner | null> {
    try {
      return await Banner.findById(bannerId).lean() as IBanner | null;
    } catch (error) {
      logger.error('Error fetching banner:', error);
      throw error;
    }
  }

  static async updateBanner(bannerId: string, data: BannerInput): Promise<IBanner | null> {
    try {
      const updateData: Record<string, unknown> = { ...data };

      // Explicit null clears a scheduling date instead of leaving it untouched.
      if (data.startDate === null) updateData.startDate = null;
      if (data.endDate === null) updateData.endDate = null;

      const banner = await Banner.findByIdAndUpdate(
        bannerId,
        { $set: updateData },
        { new: true, runValidators: true }
      ).lean();

      return banner as IBanner | null;
    } catch (error) {
      logger.error('Error updating banner:', error);
      throw error;
    }
  }

  static async deleteBanner(bannerId: string): Promise<IBanner | null> {
    try {
      const banner = await Banner.findByIdAndDelete(bannerId).lean();
      if (!banner) return null;

      // Best-effort — a failed S3 cleanup should never block the delete
      // from succeeding for the admin.
      deleteObjectFromS3ByUrl((banner as unknown as IBanner).imageUrl).catch((err) =>
        logger.warn('Could not delete banner image from S3:', err)
      );

      return banner as unknown as IBanner;
    } catch (error) {
      logger.error('Error deleting banner:', error);
      throw error;
    }
  }

  static async recordClick(bannerId: string): Promise<IBanner | null> {
    try {
      return await Banner.findByIdAndUpdate(
        bannerId,
        { $inc: { clicks: 1 } },
        { new: true }
      ).lean() as IBanner | null;
    } catch (error) {
      logger.error('Error recording banner click:', error);
      throw error;
    }
  }
}
