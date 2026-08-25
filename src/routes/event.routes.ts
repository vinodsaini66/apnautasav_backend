import { Router } from 'express';
import { EventController } from '../controllers/event.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, checkPermission } from '../middleware/authorization.middleware';
import { validate } from '../middleware/validation.middleware';
import { createEventSchema, updateEventSchema, addGuestsToEventSchema } from '../validators/event.validator';
import { CollaboratorRole } from '../types';

const router: Router = Router();

router.use(authMiddleware);

// Create event
router.post(
    '/:weddingId/events',
    checkWeddingAccess,
    checkPermission(CollaboratorRole.EDITOR),
    validate(createEventSchema),
    EventController.createEvent
);

// Get all events
router.get(
    '/:weddingId/events',
    checkWeddingAccess,
    EventController.getEvents
);

// Get upcoming events
router.get(
    '/:weddingId/events/upcoming',
    checkWeddingAccess,
    EventController.getUpcomingEvents
);

// Get event timeline
router.get(
    '/:weddingId/events/timeline',
    checkWeddingAccess,
    EventController.getEventTimeline
);

// Get event statistics
router.get(
    '/:weddingId/events/stats',
    checkWeddingAccess,
    EventController.getEventStats
);

// Get single event
router.get(
    '/:weddingId/events/:eventId',
    checkWeddingAccess,
    EventController.getEventById
);

// Get a single event's own stats (guests/vendors/tasks/budget rollup)
router.get(
    '/:weddingId/events/:eventId/stats',
    checkWeddingAccess,
    EventController.getEventStatsById
);

// Update event
router.put(
    '/:weddingId/events/:eventId',
    checkWeddingAccess,
    checkPermission(CollaboratorRole.EDITOR),
    validate(updateEventSchema),
    EventController.updateEvent
);

// Delete event
router.delete(
    '/:weddingId/events/:eventId',
    checkWeddingAccess,
    checkPermission(CollaboratorRole.EDITOR),
    EventController.deleteEvent
);

// Add guests to event
router.post(
    '/:weddingId/events/:eventId/guests',
    checkWeddingAccess,
    checkPermission(CollaboratorRole.EDITOR),
    validate(addGuestsToEventSchema),
    EventController.addGuestsToEvent
);

// Remove guest from event
router.delete(
    '/:weddingId/events/:eventId/guests/:guestId',
    checkWeddingAccess,
    checkPermission(CollaboratorRole.EDITOR),
    EventController.removeGuestFromEvent
);

export default router;