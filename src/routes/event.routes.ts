import { Router } from 'express';
import { EventController } from '../controllers/event.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, requirePermission } from '../middleware/authorization.middleware';
import { validate } from '../middleware/validation.middleware';
import { createEventSchema, updateEventSchema, addGuestsToEventSchema } from '../validators/event.validator';

const router: Router = Router();

router.use(authMiddleware);

// Create event
router.post(
    '/:weddingId/events',
    checkWeddingAccess,
    requirePermission('events.manage'),
    validate(createEventSchema),
    EventController.createEvent
);

// Get all events
router.get(
    '/:weddingId/events',
    checkWeddingAccess,
    requirePermission('events.view'),
    EventController.getEvents
);

// Get upcoming events
router.get(
    '/:weddingId/events/upcoming',
    checkWeddingAccess,
    requirePermission('events.view'),
    EventController.getUpcomingEvents
);

// Get event timeline
router.get(
    '/:weddingId/events/timeline',
    checkWeddingAccess,
    requirePermission('events.view'),
    EventController.getEventTimeline
);

// Get event statistics
router.get(
    '/:weddingId/events/stats',
    checkWeddingAccess,
    requirePermission('events.view'),
    EventController.getEventStats
);

// Get single event
router.get(
    '/:weddingId/events/:eventId',
    checkWeddingAccess,
    requirePermission('events.view'),
    EventController.getEventById
);

// Get a single event's own stats (guests/vendors/tasks/budget rollup)
router.get(
    '/:weddingId/events/:eventId/stats',
    checkWeddingAccess,
    requirePermission('events.view'),
    EventController.getEventStatsById
);

// Download this single event as a .ics file
router.get(
    '/:weddingId/events/:eventId/calendar.ics',
    checkWeddingAccess,
    requirePermission('events.view'),
    EventController.getEventCalendar
);

// Update event
router.put(
    '/:weddingId/events/:eventId',
    checkWeddingAccess,
    requirePermission('events.manage'),
    validate(updateEventSchema),
    EventController.updateEvent
);

// Delete event
router.delete(
    '/:weddingId/events/:eventId',
    checkWeddingAccess,
    requirePermission('events.manage'),
    EventController.deleteEvent
);

// Add guests to event
router.post(
    '/:weddingId/events/:eventId/guests',
    checkWeddingAccess,
    requirePermission('events.manage'),
    validate(addGuestsToEventSchema),
    EventController.addGuestsToEvent
);

// Remove guest from event
router.delete(
    '/:weddingId/events/:eventId/guests/:guestId',
    checkWeddingAccess,
    requirePermission('events.manage'),
    EventController.removeGuestFromEvent
);

export default router;