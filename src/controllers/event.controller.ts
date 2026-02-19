import { Request, Response } from 'express';
import { ApiResponse } from '../utils/apiResponse';
import { ActivityService } from '../services/activity.service';
// import { NotificationService } from '../services/notification.service';
import { getSocketServer } from '../config/socket';
import logger from '../utils/logger';
import mongoose from 'mongoose';
import { WeddingEvent } from '../models/event.model';
import { Guest } from '../models/guest.model';

export class EventController {
    static async createEvent(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId } = req.params;
            const userId = req.user?.userId;
            const eventData = req.body;

            // Validate date range
            if (new Date(eventData.endDateTime) <= new Date(eventData.startDateTime)) {
                ApiResponse.error(res, 400, 'End date must be after start date');
                return;
            }

            const event = await WeddingEvent.create({
                ...eventData,
                weddingId,
                createdBy: userId,
                startDateTime: new Date(eventData.startDateTime),
                endDateTime: new Date(eventData.endDateTime)
            });

            // Log activity
            await ActivityService.logActivity({
                weddingId,
                userId: userId!,
                actionType: 'created',
                entityType: 'event',
                //@ts-ignore
                entityId: event._id.toString(),
                entityName: event.title,
                description: `Created event: ${event.title}`
            });

            // Emit socket event
            try {
                const socketServer = getSocketServer();
                socketServer.emitToWedding(weddingId, 'event:created', {
                    event: {
                        id: event._id,
                        title: event.title,
                        eventType: event.eventType,
                        startDateTime: event.startDateTime,
                    },
                    createdBy: userId,
                    timestamp: new Date()
                });
            } catch (socketError) {
                logger.warn('Socket notification failed:', socketError);
            }

            ApiResponse.success(res, 201, {
                message: 'Event created successfully',
                data: event
            });
        } catch (error: any) {
            logger.error('Create event error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to create event');
        }
    }

    static async getEvents(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId } = req.params;
            const {
                page = 1,
                limit = 50,
                eventType,
                status,
                startDate,
                endDate,
                upcoming,
                search
            } = req.query;

            const skip = (Number(page) - 1) * Number(limit);
            const filter: any = { weddingId };

            if (eventType) filter.eventType = eventType;
            if (status) filter.status = status;

            if (startDate || endDate) {
                filter.startDateTime = {};
                if (startDate) filter.startDateTime.$gte = new Date(startDate as string);
                if (endDate) filter.startDateTime.$lte = new Date(endDate as string);
            }

            if (upcoming === 'true') {
                filter.startDateTime = { $gte: new Date() };
            }

            if (search) {
                filter.$or = [
                    { title: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } },
                    { 'location.venueName': { $regex: search, $options: 'i' } }
                ];
            }

            const events = await WeddingEvent.find(filter)
                .populate('createdBy', 'fullName email')
                // .populate('guests', 'firstName lastName rsvpStatus')
                // .populate('vendors', 'vendorName category')
                // .populate('tasks', 'title status')
                .sort({ startDateTime: 1 })
                .skip(skip)
                .limit(Number(limit))
                .lean();

            const total = await WeddingEvent.countDocuments(filter);

            ApiResponse.paginated(res, events, Number(page), Number(limit), total);
        } catch (error: any) {
            logger.error('Get events error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to fetch events');
        }
    }

    static async getEventById(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId, eventId } = req.params;

            const event = await WeddingEvent.findOne({ _id: eventId, weddingId })
                .populate('createdBy', 'fullName email phoneNumber')
                .populate('updatedBy', 'fullName email')
                .populate('guests', 'firstName lastName email phoneNumber rsvpStatus category')
                .populate('vendors', 'vendorName category phoneNumber email')
                .populate('tasks', 'title status priority dueDate')
                .lean();

            if (!event) {
                ApiResponse.error(res, 404, 'Event not found');
                return;
            }

            ApiResponse.success(res, 200, { data: event });
        } catch (error: any) {
            logger.error('Get event error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to fetch event');
        }
    }

    static async updateEvent(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId, eventId } = req.params;
            const userId = req.user?.userId;
            const updateData = req.body;

            // Validate date range if both dates provided
            if (updateData.startDateTime && updateData.endDateTime) {
                if (new Date(updateData.endDateTime) <= new Date(updateData.startDateTime)) {
                    ApiResponse.error(res, 400, 'End date must be after start date');
                    return;
                }
            }

            // Convert date strings to Date objects
            if (updateData.startDateTime) {
                updateData.startDateTime = new Date(updateData.startDateTime);
            }
            if (updateData.endDateTime) {
                updateData.endDateTime = new Date(updateData.endDateTime);
            }

            updateData.updatedBy = userId;

            const event = await WeddingEvent.findOneAndUpdate(
                { _id: eventId, weddingId },
                { $set: updateData },
                { new: true, runValidators: true }
            );

            if (!event) {
                ApiResponse.error(res, 404, 'Event not found');
                return;
            }

            // Log activity
            await ActivityService.logActivity({
                weddingId,
                userId: userId!,
                actionType: 'updated',
                entityType: 'event',
                //@ts-ignore
                entityId: event._id.toString(),
                entityName: event.title,
                description: `Updated event: ${event.title}`
            });

            // Emit socket event
            try {
                const socketServer = getSocketServer();
                socketServer.emitToWedding(weddingId, 'event:updated', {
                    eventId: event._id,
                    updates: updateData,
                    updatedBy: userId,
                    timestamp: new Date()
                });
            } catch (socketError) {
                logger.warn('Socket notification failed:', socketError);
            }

            ApiResponse.success(res, 200, {
                message: 'Event updated successfully',
                data: event
            });
        } catch (error: any) {
            logger.error('Update event error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to update event');
        }
    }

    static async deleteEvent(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId, eventId } = req.params;
            const userId = req.user?.userId;

            const event = await WeddingEvent.findOneAndDelete({ _id: eventId, weddingId });

            if (!event) {
                ApiResponse.error(res, 404, 'Event not found');
                return;
            }

            // Log activity
            await ActivityService.logActivity({
                weddingId,
                userId: userId!,
                actionType: 'deleted',
                entityType: 'event',
                entityName: event.title,
                description: `Deleted event: ${event.title}`
            });

            // Emit socket event
            try {
                const socketServer = getSocketServer();
                socketServer.emitToWedding(weddingId, 'event:deleted', {
                    eventId: event._id,
                    deletedBy: userId,
                    timestamp: new Date()
                });
            } catch (socketError) {
                logger.warn('Socket notification failed:', socketError);
            }

            ApiResponse.success(res, 200, {
                message: 'Event deleted successfully'
            });
        } catch (error: any) {
            logger.error('Delete event error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to delete event');
        }
    }

    static async addGuestsToEvent(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId, eventId } = req.params;
            const userId = req.user?.userId;
            const { guestIds } = req.body;

            // Verify all guests belong to this wedding
            const guests = await Guest.find({
                _id: { $in: guestIds },
                weddingId
            });

            if (guests.length !== guestIds.length) {
                ApiResponse.error(res, 400, 'Some guests not found or do not belong to this wedding');
                return;
            }

            const event = await WeddingEvent.findOneAndUpdate(
                { _id: eventId, weddingId },
                {
                    $addToSet: { guests: { $each: guestIds } },
                    updatedBy: userId
                },
                { new: true }
            ).populate('guests', 'firstName lastName email rsvpStatus');

            if (!event) {
                ApiResponse.error(res, 404, 'Event not found');
                return;
            }

            // Send notifications to added guests
            // TODO: Implement notification to guests

            // Log activity
            await ActivityService.logActivity({
                weddingId,
                userId: userId!,
                actionType: 'updated',
                entityType: 'event',
                //@ts-ignore
                entityId: event._id.toString(),
                entityName: event.title,
                description: `Added ${guestIds.length} guest(s) to event: ${event.title}`
            });

            ApiResponse.success(res, 200, {
                message: 'Guests added to event successfully',
                data: event
            });
        } catch (error: any) {
            logger.error('Add guests to event error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to add guests to event');
        }
    }

    static async removeGuestFromEvent(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId, eventId, guestId } = req.params;
            const userId = req.user?.userId;

            const event = await WeddingEvent.findOneAndUpdate(
                { _id: eventId, weddingId },
                {
                    $pull: { guests: guestId },
                    updatedBy: userId
                },
                { new: true }
            );

            if (!event) {
                ApiResponse.error(res, 404, 'Event not found');
                return;
            }

            ApiResponse.success(res, 200, {
                message: 'Guest removed from event successfully',
                data: event
            });
        } catch (error: any) {
            logger.error('Remove guest from event error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to remove guest from event');
        }
    }

    static async getEventStats(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId } = req.params;

            const stats = await WeddingEvent.aggregate([
                { $match: { weddingId: new mongoose.Types.ObjectId(weddingId) } },
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        planning: {
                            $sum: { $cond: [{ $eq: ['$status', 'planning'] }, 1, 0] }
                        },
                        confirmed: {
                            $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] }
                        },
                        completed: {
                            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                        },
                        cancelled: {
                            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
                        },
                        totalInvited: { $sum: '$invitedCount' },
                        totalConfirmed: { $sum: '$confirmedCount' },
                        totalBudget: { $sum: '$budget.estimated' },
                        totalActual: { $sum: '$budget.actual' }
                    }
                }
            ]);

            const eventTypeStats = await WeddingEvent.aggregate([
                { $match: { weddingId: new mongoose.Types.ObjectId(weddingId) } },
                {
                    $group: {
                        _id: '$eventType',
                        count: { $sum: 1 }
                    }
                }
            ]);

            // Get upcoming events count
            const upcomingCount = await WeddingEvent.countDocuments({
                weddingId,
                startDateTime: { $gte: new Date() },
                status: { $ne: 'cancelled' }
            });

            ApiResponse.success(res, 200, {
                data: {
                    overview: stats[0] || {
                        total: 0,
                        planning: 0,
                        confirmed: 0,
                        completed: 0,
                        cancelled: 0,
                        totalInvited: 0,
                        totalConfirmed: 0,
                        totalBudget: 0,
                        totalActual: 0
                    },
                    byType: eventTypeStats,
                    upcoming: upcomingCount
                }
            });
        } catch (error: any) {
            logger.error('Get event stats error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to fetch event statistics');
        }
    }

    static async getUpcomingEvents(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId } = req.params;
            const { limit = 10 } = req.query;

            const events = await WeddingEvent.find({
                weddingId,
                startDateTime: { $gte: new Date() },
                status: { $ne: 'cancelled' }
            })
                .sort({ startDateTime: 1 })
                .limit(Number(limit))
                .populate('createdBy', 'fullName')
                .select('title eventType startDateTime endDateTime location.venueName status invitedCount confirmedCount')
                .lean();

            ApiResponse.success(res, 200, { data: events });
        } catch (error: any) {
            logger.error('Get upcoming events error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to fetch upcoming events');
        }
    }

    static async getEventTimeline(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId } = req.params;

            const events = await WeddingEvent.find({
                weddingId,
                status: { $ne: 'cancelled' }
            })
                .sort({ startDateTime: 1 })
                .select('title eventType startDateTime endDateTime location.venueName status')
                .lean();

            // Group by date
            const timeline = events.reduce((acc: any, event: any) => {
                const date = event.startDateTime.toISOString().split('T')[0];
                if (!acc[date]) {
                    acc[date] = [];
                }
                acc[date].push(event);
                return acc;
            }, {});

            ApiResponse.success(res, 200, { data: timeline });
        } catch (error: any) {
            logger.error('Get event timeline error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to fetch event timeline');
        }
    }
}