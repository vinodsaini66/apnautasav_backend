import { Router } from 'express';
import { GiftController } from '../controllers/gift.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, checkPermission } from '../middleware/authorization.middleware';
import { checkBudgetEnabled } from '../middleware/planLimit.middleware';
import { validate } from '../middleware/validation.middleware';
import { createGiftSchema, updateGiftSchema } from '../validators/gift.validator';
import { CollaboratorRole } from '../types';

const router: Router = Router();

router.use(authMiddleware);

router.post('/:weddingId/gifts', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), checkBudgetEnabled, validate(createGiftSchema), GiftController.createGift);
router.get('/:weddingId/gifts', checkWeddingAccess, GiftController.getGifts);
router.put('/:weddingId/gifts/:giftId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), validate(updateGiftSchema), GiftController.updateGift);
router.delete('/:weddingId/gifts/:giftId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), GiftController.deleteGift);

export default router;
