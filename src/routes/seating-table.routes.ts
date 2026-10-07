import { Router } from 'express';
import { SeatingTableController } from '../controllers/seating-table.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, requirePermission } from '../middleware/authorization.middleware';
import { validate } from '../middleware/validation.middleware';
import {
  createSeatingTableSchema,
  updateSeatingTableSchema,
  assignGuestSchema
} from '../validators/seating-table.validator';

const router: Router = Router();

router.use(authMiddleware);

// Optional feature — a wedding that never calls any of these routes simply
// never has seating data, no toggle/flag needed on the Wedding doc itself.
router.post(
  '/:weddingId/seating-tables',
  checkWeddingAccess,
  requirePermission('guests.manage'),
  validate(createSeatingTableSchema),
  SeatingTableController.createTable
);

router.get('/:weddingId/seating-tables', checkWeddingAccess, requirePermission('guests.view'), SeatingTableController.getTables);

// Registered before /:tableId routes below — a literal path must win over
// the wildcard segment.
router.get('/:weddingId/seating-tables/unseated', checkWeddingAccess, requirePermission('guests.view'), SeatingTableController.getUnseatedGuests);

router.put(
  '/:weddingId/seating-tables/:tableId',
  checkWeddingAccess,
  requirePermission('guests.manage'),
  validate(updateSeatingTableSchema),
  SeatingTableController.updateTable
);

router.delete(
  '/:weddingId/seating-tables/:tableId',
  checkWeddingAccess,
  requirePermission('guests.manage'),
  SeatingTableController.deleteTable
);

router.post(
  '/:weddingId/seating-tables/:tableId/guests',
  checkWeddingAccess,
  requirePermission('guests.manage'),
  validate(assignGuestSchema),
  SeatingTableController.assignGuest
);

router.delete(
  '/:weddingId/seating-tables/:tableId/guests/:guestId',
  checkWeddingAccess,
  requirePermission('guests.manage'),
  SeatingTableController.unassignGuest
);

export default router;
