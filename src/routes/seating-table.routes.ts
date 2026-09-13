import { Router } from 'express';
import { SeatingTableController } from '../controllers/seating-table.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, checkPermission } from '../middleware/authorization.middleware';
import { validate } from '../middleware/validation.middleware';
import {
  createSeatingTableSchema,
  updateSeatingTableSchema,
  assignGuestSchema
} from '../validators/seating-table.validator';
import { CollaboratorRole } from '../types';

const router: Router = Router();

router.use(authMiddleware);

// Optional feature — a wedding that never calls any of these routes simply
// never has seating data, no toggle/flag needed on the Wedding doc itself.
router.post(
  '/:weddingId/seating-tables',
  checkWeddingAccess,
  checkPermission(CollaboratorRole.EDITOR),
  validate(createSeatingTableSchema),
  SeatingTableController.createTable
);

router.get('/:weddingId/seating-tables', checkWeddingAccess, SeatingTableController.getTables);

// Registered before /:tableId routes below — a literal path must win over
// the wildcard segment.
router.get('/:weddingId/seating-tables/unseated', checkWeddingAccess, SeatingTableController.getUnseatedGuests);

router.put(
  '/:weddingId/seating-tables/:tableId',
  checkWeddingAccess,
  checkPermission(CollaboratorRole.EDITOR),
  validate(updateSeatingTableSchema),
  SeatingTableController.updateTable
);

router.delete(
  '/:weddingId/seating-tables/:tableId',
  checkWeddingAccess,
  checkPermission(CollaboratorRole.EDITOR),
  SeatingTableController.deleteTable
);

router.post(
  '/:weddingId/seating-tables/:tableId/guests',
  checkWeddingAccess,
  checkPermission(CollaboratorRole.EDITOR),
  validate(assignGuestSchema),
  SeatingTableController.assignGuest
);

router.delete(
  '/:weddingId/seating-tables/:tableId/guests/:guestId',
  checkWeddingAccess,
  checkPermission(CollaboratorRole.EDITOR),
  SeatingTableController.unassignGuest
);

export default router;
