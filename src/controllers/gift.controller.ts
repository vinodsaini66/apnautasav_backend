import { Request, Response } from 'express';
import { Gift } from '../models/gift.model';
import { ApiResponse } from '../utils/apiResponse';
import { ActivityService } from '../services/activity.service';
import logger from '../utils/logger';

// No gift-specific NotificationService type exists yet (Notification.type is
// a closed enum: task_assigned/comment_added/member_invited/budget_updated/
// activity_alert — see models/notification.model.ts) and adding one isn't
// part of this phase's scope, so gift create/update/delete only logs to the
// activity feed (ActivityService), same as e.g. GuestController does for
// actions that don't have a dedicated notification type.
export class GiftController {
    static async createGift(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId } = req.params;
            const userId = req.user?.userId;
            const giftData = req.body;

            const gift = await Gift.create({
                ...giftData,
                weddingId,
                addedBy: userId
            });

            await ActivityService.logActivity({
                weddingId,
                userId: userId!,
                actionType: 'created',
                entityType: 'gift',
                entityId: String(gift._id),
                entityName: gift.giverName,
                description: `Added gift from: ${gift.giverName}`
            });

            ApiResponse.success(res, 201, {
                message: 'Gift added successfully',
                data: gift
            });
        } catch (error: any) {
            logger.error('Create gift error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to add gift');
        }
    }

    static async getGifts(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId } = req.params;
            const { page = 1, limit = 50, eventId } = req.query;

            const skip = (Number(page) - 1) * Number(limit);
            const filter: any = { weddingId };

            if (eventId) filter.eventId = eventId;

            const gifts = await Gift.find(filter)
                .populate('guestId', 'name')
                .populate('addedBy', 'fullName')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .lean();

            const total = await Gift.countDocuments(filter);

            ApiResponse.paginated(res, gifts, Number(page), Number(limit), total);
        } catch (error: any) {
            logger.error('Get gifts error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to fetch gifts');
        }
    }

    static async updateGift(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId, giftId } = req.params;
            const userId = req.user?.userId;
            const updateData = req.body;

            const gift = await Gift.findOneAndUpdate(
                { _id: giftId, weddingId },
                { $set: updateData },
                { new: true, runValidators: true }
            );

            if (!gift) {
                ApiResponse.error(res, 404, 'Gift not found');
                return;
            }

            await ActivityService.logActivity({
                weddingId,
                userId: userId!,
                actionType: 'updated',
                entityType: 'gift',
                entityId: String(gift._id),
                entityName: gift.giverName,
                description: `Updated gift from: ${gift.giverName}`
            });

            ApiResponse.success(res, 200, {
                message: 'Gift updated successfully',
                data: gift
            });
        } catch (error: any) {
            logger.error('Update gift error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to update gift');
        }
    }

    static async deleteGift(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId, giftId } = req.params;
            const userId = req.user?.userId;

            const gift = await Gift.findOneAndDelete({ _id: giftId, weddingId });

            if (!gift) {
                ApiResponse.error(res, 404, 'Gift not found');
                return;
            }

            await ActivityService.logActivity({
                weddingId,
                userId: userId!,
                actionType: 'deleted',
                entityType: 'gift',
                entityName: gift.giverName,
                description: `Deleted gift from: ${gift.giverName}`
            });

            ApiResponse.success(res, 200, {
                message: 'Gift deleted successfully'
            });
        } catch (error: any) {
            logger.error('Delete gift error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to delete gift');
        }
    }
}
