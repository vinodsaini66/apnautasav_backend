import { Request, Response } from 'express';
import { Guest } from '../models/guest.model';
import { ApiResponse } from '../utils/apiResponse';
import { ActivityService } from '../services/activity.service';
import { NotificationService } from '../services/notification.service';
import logger from '../utils/logger';
import { getSocketServer } from '../config/socket';

export class GuestController {
  static async createGuest(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const userId = req.user?.userId;
      const guestData = req.body;

      const guest = await Guest.create({
        ...guestData,
        weddingId,
        addedBy: userId
      });

      // Log activity
      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'created',
        entityType: 'guest',
        entityId: String(guest._id),
        entityName: `${guest.name}`,
        description: `Added guest: ${guest.name}`
      });

      const socketServer = getSocketServer();
      socketServer.emitToWedding(weddingId, 'guest:added', {
        guest: {
          id: guest._id,
          name: guest.name,
          category: guest.category,
          rsvpStatus: guest.rsvpStatus
        },
        addedBy: userId,
        timestamp: new Date()
      });

      ApiResponse.success(res, 201, {
        message: 'Guest added successfully',
        data: guest
      });
    } catch (error: any) {
      logger.error('Create guest error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to add guest');
    }
  }

  static async getGuests(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const { page = 1, limit = 50, category, rsvpStatus, search, eventId } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const filter: any = { weddingId };

      if (category) filter.category = category;
      if (rsvpStatus) filter.rsvpStatus = rsvpStatus;
      if (eventId) filter.eventIds = eventId;
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      const guests = await Guest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

      const total = await Guest.countDocuments(filter);

      ApiResponse.paginated(res, guests, Number(page), Number(limit), total);
    } catch (error: any) {
      logger.error('Get guests error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch guests');
    }
  }

  static async updateGuest(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, guestId } = req.params;
      const userId = req.user?.userId;
      const updateData = req.body;

      const previousGuest = updateData.rsvpStatus
        ? await Guest.findOne({ _id: guestId, weddingId }).select('rsvpStatus').lean()
        : null;

      const guest = await Guest.findOneAndUpdate(
        { _id: guestId, weddingId },
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!guest) {
        ApiResponse.error(res, 404, 'Guest not found');
        return;
      }

      // Log activity
      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'updated',
        entityType: 'guest',
        entityId: String(guest._id),
        entityName: `${guest.name}`,
        description: `Updated guest: ${guest.name}`
      });

      // Notify the rest of the wedding team when an RSVP actually changed —
      // guarded separately so a notification failure never blocks the
      // update itself from succeeding.
      if (previousGuest && previousGuest.rsvpStatus !== guest.rsvpStatus) {
        try {
          const recipientIds = await NotificationService.getWeddingRecipientIds(weddingId, userId);
          if (recipientIds.length > 0) {
            await NotificationService.notifyGuestRSVP(weddingId, recipientIds, guest.name, guest.rsvpStatus);
          }
        } catch (notifyError) {
          logger.warn('Failed to send guest RSVP notification:', notifyError);
        }
      }

      ApiResponse.success(res, 200, {
        message: 'Guest updated successfully',
        data: guest
      });
    } catch (error: any) {
      logger.error('Update guest error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to update guest');
    }
  }

  static async deleteGuest(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, guestId } = req.params;
      const userId = req.user?.userId;

      const guest = await Guest.findOneAndDelete({ _id: guestId, weddingId });

      if (!guest) {
        ApiResponse.error(res, 404, 'Guest not found');
        return;
      }

      // Log activity
      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'deleted',
        entityType: 'guest',
        entityName: `${guest.name}`,
        description: `Deleted guest: ${guest.name}`
      });

      ApiResponse.success(res, 200, {
        message: 'Guest deleted successfully'
      });
    } catch (error: any) {
      logger.error('Delete guest error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to delete guest');
    }
  }

  static async getGuestStats(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;

      const stats = await Guest.aggregate([
        { $match: { weddingId: weddingId as any } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            totalWithPlusOne: { $sum: { $add: [1, '$plusOne'] } },
            confirmed: {
              $sum: { $cond: [{ $eq: ['$rsvpStatus', 'confirmed'] }, 1, 0] }
            },
            declined: {
              $sum: { $cond: [{ $eq: ['$rsvpStatus', 'declined'] }, 1, 0] }
            },
            pending: {
              $sum: { $cond: [{ $eq: ['$rsvpStatus', 'pending'] }, 1, 0] }
            }
          }
        }
      ]);

      const categoryStats = await Guest.aggregate([
        { $match: { weddingId: weddingId as any } },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 }
          }
        }
      ]);

      ApiResponse.success(res, 200, {
        data: {
          overview: stats[0] || {
            total: 0,
            totalWithPlusOne: 0,
            confirmed: 0,
            declined: 0,
            pending: 0
          },
          byCategory: categoryStats
        }
      });
    } catch (error: any) {
      logger.error('Get guest stats error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch guest statistics');
    }
  }
}