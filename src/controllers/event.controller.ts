import { Request, Response } from 'express';
import { ApiResponse } from '../utils/apiResponse';
import { ActivityService } from '../services/activity.service';
import { getSocketServer } from '../config/socket';
import logger from '../utils/logger';
import mongoose from 'mongoose';
import { WeddingEvent } from '../models/event.model';
import { Guest } from '../models/guest.model';
import { Vendor } from '../models/vendor.model';
import { Task } from '../models/task.model';
import { Budget } from '../models/budget.model';
import { buildEventAttributes, generateICS } from '../services/calendar.service';

export class EventController {
    static async createEvent(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId } = req.params;
            const userId = req.user?.userId;
            const eventData = req.body;

            // Only meaningful to check once both ends of the range are
            // actually given — a function's date is often still undecided.
            if (
                eventData.startDateTime &&
                eventData.endDateTime &&
                new Date(eventData.endDateTime) <= new Date(eventData.startDateTime)
            ) {
                ApiResponse.error(res, 400, 'End date must be after start date');
                return;
            }

            const event = await WeddingEvent.create({
                ...eventData,
                weddingId,
                createdBy: userId,
                startDateTime: eventData.startDateTime ? new Date(eventData.startDateTime) : undefined,
                endDateTime: eventData.endDateTime ? new Date(eventData.endDateTime) : undefined
            });

            // Log activity
            await ActivityService.logActivity({
                weddingId,
                userId: userId!,
                actionType: 'created',
                entityType: 'event',
                entityId: String(event._id),
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
                .populate('guests', 'name email phoneNumber rsvpStatus category isVIP plusOne')
                .populate('vendors', 'vendorName category phoneNumber email bookingStatus')
                .populate('tasks', 'title status priority dueDate')
                .populate('budgetItems', 'category description estimatedCost actualCost status')
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
                entityId: String(event._id),
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

            // Deleting a function only ever *untags* the shared entities
            // pointing at it — guests, vendors, tasks, and budget items
            // themselves are never touched. This is the one place the
            // "optional link, not a duplicate list" architecture needs to
            // actually clean up after itself.
            await Promise.all([
                Guest.updateMany({ weddingId, eventIds: event._id }, { $pull: { eventIds: event._id } }),
                Vendor.updateMany({ weddingId, eventIds: event._id }, { $pull: { eventIds: event._id } }),
                Task.updateMany({ weddingId, eventId: event._id }, { $unset: { eventId: 1 } }),
                Budget.updateMany({ weddingId, eventId: event._id }, { $unset: { eventId: 1 } })
            ]);

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

            const event = await WeddingEvent.findOne({ _id: eventId, weddingId });
            if (!event) {
                ApiResponse.error(res, 404, 'Event not found');
                return;
            }

            // Verify all guests belong to this wedding
            const guests = await Guest.find({
                _id: { $in: guestIds },
                weddingId
            });

            if (guests.length !== guestIds.length) {
                ApiResponse.error(res, 400, 'Some guests not found or do not belong to this wedding');
                return;
            }

            // The relationship lives on Guest.eventIds, not on the event —
            // tag every guest with this event's id instead of trying to
            // store a guest list on the event itself.
            await Guest.updateMany(
                { _id: { $in: guestIds }, weddingId },
                { $addToSet: { eventIds: event._id } }
            );

            // Log activity
            await ActivityService.logActivity({
                weddingId,
                userId: userId!,
                actionType: 'updated',
                entityType: 'event',
                entityId: String(event._id),
                entityName: event.title,
                description: `Added ${guestIds.length} guest(s) to event: ${event.title}`
            });

            const updatedEvent = await WeddingEvent.findById(event._id)
                .populate('guests', 'name email phoneNumber rsvpStatus category')
                .lean();

            ApiResponse.success(res, 200, {
                message: 'Guests added to event successfully',
                data: updatedEvent
            });
        } catch (error: any) {
            logger.error('Add guests to event error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to add guests to event');
        }
    }

    static async removeGuestFromEvent(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId, eventId, guestId } = req.params;

            const event = await WeddingEvent.findOne({ _id: eventId, weddingId });
            if (!event) {
                ApiResponse.error(res, 404, 'Event not found');
                return;
            }

            // Untags the guest from this function — the guest record itself
            // (and any other function they're invited to) is untouched.
            const guest = await Guest.findOneAndUpdate(
                { _id: guestId, weddingId },
                { $pull: { eventIds: event._id } },
                { new: true }
            );

            if (!guest) {
                ApiResponse.error(res, 404, 'Guest not found');
                return;
            }

            ApiResponse.success(res, 200, {
                message: 'Guest removed from event successfully',
                data: guest
            });
        } catch (error: any) {
            logger.error('Remove guest from event error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to remove guest from event');
        }
    }

    // Wedding-wide overview across all functions — event-level metadata
    // only (status/type breakdown, planning target totals, upcoming
    // count). Per-function guest/vendor/task/budget rollups belong to
    // getEventStatsById below, since summing those across functions would
    // double-count a guest invited to more than one.
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
                        totalEstimatedBudget: { $sum: { $ifNull: ['$estimatedBudget', 0] } }
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

            // Get upcoming events count (undated "TBD" events never match
            // this $gte comparison, so they're correctly excluded)
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
                        totalEstimatedBudget: 0
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

    // Per-function drill-down: guests invited/confirmed, budget target vs.
    // live spend, vendor count, task progress — everything the Event
    // Detail page's stat row needs, always computed fresh from the shared
    // collections rather than read off stored counters.
    static async getEventStatsById(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId, eventId } = req.params;

            const event = await WeddingEvent.findOne({ _id: eventId, weddingId }).lean();
            if (!event) {
                ApiResponse.error(res, 404, 'Event not found');
                return;
            }

            const eventObjectId = new mongoose.Types.ObjectId(eventId);
            const weddingObjectId = new mongoose.Types.ObjectId(weddingId);

            const [guestStats, vendorCount, taskStats, budgetTotals] = await Promise.all([
                Guest.aggregate([
                    { $match: { weddingId: weddingObjectId, eventIds: eventObjectId } },
                    {
                        $group: {
                            _id: null,
                            invited: { $sum: 1 },
                            invitedWithPlusOne: { $sum: { $add: [1, { $ifNull: ['$plusOne', 0] }] } },
                            confirmed: { $sum: { $cond: [{ $eq: ['$rsvpStatus', 'confirmed'] }, 1, 0] } },
                            declined: { $sum: { $cond: [{ $eq: ['$rsvpStatus', 'declined'] }, 1, 0] } },
                            pending: { $sum: { $cond: [{ $eq: ['$rsvpStatus', 'pending'] }, 1, 0] } }
                        }
                    }
                ]),
                Vendor.countDocuments({ weddingId, eventIds: eventId }),
                Task.aggregate([
                    { $match: { weddingId: weddingObjectId, eventId: eventObjectId } },
                    {
                        $group: {
                            _id: null,
                            total: { $sum: 1 },
                            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }
                        }
                    }
                ]),
                Budget.aggregate([
                    { $match: { weddingId: weddingObjectId, eventId: eventObjectId } },
                    {
                        $group: {
                            _id: null,
                            totalEstimated: { $sum: '$estimatedCost' },
                            totalActual: { $sum: { $ifNull: ['$actualCost', 0] } }
                        }
                    }
                ])
            ]);

            ApiResponse.success(res, 200, {
                data: {
                    guests: guestStats[0] || { invited: 0, invitedWithPlusOne: 0, confirmed: 0, declined: 0, pending: 0 },
                    vendors: { count: vendorCount },
                    tasks: taskStats[0] ? { total: taskStats[0].total, completed: taskStats[0].completed } : { total: 0, completed: 0 },
                    budget: {
                        target: event.estimatedBudget || 0,
                        estimated: budgetTotals[0]?.totalEstimated || 0,
                        spent: budgetTotals[0]?.totalActual || 0
                    }
                }
            });
        } catch (error: any) {
            logger.error('Get event stats by id error:', error);
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
                .select('title eventType startDateTime endDateTime location dressCode status estimatedBudget')
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
                .select('title eventType startDateTime endDateTime location dressCode status')
                .lean();

            // Group by date — events with no date yet ("Date TBD") can't be
            // placed on a calendar, so they get their own bucket instead of
            // crashing the group-by on a null date.
            const timeline: Record<string, any[]> = {};
            const unscheduled: any[] = [];

            for (const event of events) {
                if (!event.startDateTime) {
                    unscheduled.push(event);
                    continue;
                }
                const date = new Date(event.startDateTime).toISOString().split('T')[0];
                if (!timeline[date]) timeline[date] = [];
                timeline[date].push(event);
            }

            ApiResponse.success(res, 200, { data: { timeline, unscheduled } });
        } catch (error: any) {
            logger.error('Get event timeline error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to fetch event timeline');
        }
    }

    /**
     * GET /:weddingId/events/:eventId/calendar.ics — a single event's own
     * VEVENT, for "add just this function" (reuses the same builder as the
     * whole-wedding calendar). 400s for a dateless "TBD" event — nothing
     * to put on a calendar yet.
     */
    static async getEventCalendar(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId, eventId } = req.params;

            const event = await WeddingEvent.findOne({ _id: eventId, weddingId }).lean();
            if (!event) {
                ApiResponse.error(res, 404, 'Event not found');
                return;
            }

            const attrs = buildEventAttributes(event);
            if (!attrs) {
                ApiResponse.error(res, 400, "This event doesn't have a date set yet, so it can't be added to a calendar");
                return;
            }

            const ics = generateICS([attrs]);
            const safeTitle = event.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

            res.setHeader('Content-Type', 'text/calendar');
            res.setHeader('Content-Disposition', `attachment; filename="${safeTitle || 'event'}.ics"`);
            res.send(ics);
        } catch (error: any) {
            logger.error('Get event calendar error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to generate calendar');
        }
    }
}
