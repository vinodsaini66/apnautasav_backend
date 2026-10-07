import { Router } from 'express';
import { GiftController } from '../controllers/gift.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, requirePermission } from '../middleware/authorization.middleware';
import { checkBudgetEnabled } from '../middleware/planLimit.middleware';
import { validate } from '../middleware/validation.middleware';
import { createGiftSchema, updateGiftSchema } from '../validators/gift.validator';

const router: Router = Router();

router.use(authMiddleware);

router.post('/:weddingId/gifts', checkWeddingAccess, requirePermission('budget.manage'), checkBudgetEnabled, validate(createGiftSchema), GiftController.createGift);
router.get('/:weddingId/gifts', checkWeddingAccess, requirePermission('budget.view'), GiftController.getGifts);
router.put('/:weddingId/gifts/:giftId', checkWeddingAccess, requirePermission('budget.manage'), validate(updateGiftSchema), GiftController.updateGift);
router.delete('/:weddingId/gifts/:giftId', checkWeddingAccess, requirePermission('budget.manage'), GiftController.deleteGift);

export default router;
