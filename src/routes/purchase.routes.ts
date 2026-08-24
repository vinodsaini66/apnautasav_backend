import { Router } from 'express';
import { PurchaseController } from '../controllers/purchase.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { createPurchaseSchema } from '../validators/purchase.validator';

const router: Router = Router();

router.use(authMiddleware);

/**
 * POST /purchases
 * Buy a plan: { planKey, weddingId? }. Payment is mocked as instantly
 * successful — see PurchaseService.processPayment for the one spot that
 * changes when a real gateway is wired in.
 */
router.post('/', validate(createPurchaseSchema), PurchaseController.createPurchase);
router.get('/me', PurchaseController.getMyPurchases);

export default router;
