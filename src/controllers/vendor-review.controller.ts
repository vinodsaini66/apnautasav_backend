import { Request, Response } from 'express';
import { Vendor } from '../models/vendor.model';
import { VendorReview } from '../models/vendor-review.model';
import { Wedding } from '../models/wedding.model';
import { Collaborator } from '../models/collaborator.model';
import { ApiResponse } from '../utils/apiResponse';
import { ActivityService } from '../services/activity.service';
import { recalculateVendorRating } from '../services/vendor-review.service';
import { CollaboratorRole } from '../types';
import logger from '../utils/logger';

const ROLE_HIERARCHY: Record<CollaboratorRole, number> = {
  [CollaboratorRole.VIEWER]: 1,
  [CollaboratorRole.EDITOR]: 2,
  [CollaboratorRole.ADMIN]: 3
};

/**
 * Whether `userId` has EDITOR-or-above rights on `weddingId` — the wedding
 * creator, or an accepted collaborator with role >= EDITOR. Mirrors
 * checkPermission's logic; used here because deleteReview needs to allow
 * either the review's own author OR an editor/admin override, so it can't
 * be gated purely by the router-level checkPermission middleware.
 */
const hasEditorAccess = async (weddingId: string, userId: string): Promise<boolean> => {
  const wedding = await Wedding.findById(weddingId);
  if (!wedding) return false;

  if (wedding.createdBy.toString() === userId) return true;

  const collaborator = await Collaborator.findOne({
    weddingId,
    userId,
    invitationStatus: 'accepted'
  });

  if (!collaborator) return false;

  return ROLE_HIERARCHY[collaborator.role as CollaboratorRole] >= ROLE_HIERARCHY[CollaboratorRole.EDITOR];
};

export class VendorReviewController {
  static async submitReview(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, vendorId } = req.params;
      const userId = req.user?.userId;
      const { rating, comment } = req.body;

      const vendor = await Vendor.findOne({ _id: vendorId, weddingId });
      if (!vendor) {
        ApiResponse.error(res, 404, 'Vendor not found');
        return;
      }

      const review = await VendorReview.findOneAndUpdate(
        { vendorId, reviewerId: userId },
        {
          $set: {
            rating,
            comment,
            vendorId,
            weddingId,
            reviewerId: userId
          }
        },
        { upsert: true, new: true, runValidators: true }
      );

      await recalculateVendorRating(vendorId);

      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'reviewed',
        entityType: 'vendor',
        entityId: String(vendor._id),
        entityName: vendor.vendorName,
        description: `Reviewed vendor: ${vendor.vendorName} (${rating}/5)`
      });

      ApiResponse.success(res, 200, {
        message: 'Review submitted successfully',
        data: review
      });
    } catch (error: any) {
      logger.error('Submit vendor review error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to submit review');
    }
  }

  static async getReviews(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, vendorId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const filter = { vendorId, weddingId };

      const reviews = await VendorReview.find(filter)
        .populate('reviewerId', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

      const total = await VendorReview.countDocuments(filter);

      ApiResponse.paginated(res, reviews, Number(page), Number(limit), total);
    } catch (error: any) {
      logger.error('Get vendor reviews error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch reviews');
    }
  }

  static async deleteReview(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, vendorId, reviewId } = req.params;
      const userId = req.user?.userId;

      const review = await VendorReview.findOne({ _id: reviewId, vendorId, weddingId });
      if (!review) {
        ApiResponse.error(res, 404, 'Review not found');
        return;
      }

      const isOwnReview = review.reviewerId.toString() === userId;
      if (!isOwnReview) {
        const canOverride = await hasEditorAccess(weddingId, userId!);
        if (!canOverride) {
          ApiResponse.error(res, 403, 'You do not have permission to delete this review');
          return;
        }
      }

      await VendorReview.deleteOne({ _id: review._id });
      await recalculateVendorRating(vendorId);

      const vendor = await Vendor.findById(vendorId);

      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'deleted',
        entityType: 'vendor',
        entityId: vendorId,
        entityName: vendor?.vendorName,
        description: `Deleted a review for vendor: ${vendor?.vendorName || vendorId}`
      });

      ApiResponse.success(res, 200, {
        message: 'Review deleted successfully'
      });
    } catch (error: any) {
      logger.error('Delete vendor review error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to delete review');
    }
  }
}
