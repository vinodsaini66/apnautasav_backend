import { Router } from 'express';
import { PlanController } from '../controllers/plan.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/authorization.middleware';
import { validate } from '../middleware/validation.middleware';
import { createPlanSchema, updatePlanSchema } from '../validators/plan.validator';

const router: Router = Router();

/**
 * GET /plans
 * The Pricing page's catalog — every currently active plan. Deliberately
 * public (no authMiddleware) — logged-out visitors reach the Pricing page
 * straight from the landing nav and need to see prices before signing up.
 */
router.get('/', PlanController.getActivePlans);

// Everything below requires login, and further admin rights for managing
// the pricing catalog itself.
router.use(authMiddleware);
router.use(requireAdmin);

router.get('/all', PlanController.getAllPlans);
router.get('/:planId', PlanController.getPlanById);
router.post('/', validate(createPlanSchema), PlanController.createPlan);
router.put('/:planId', validate(updatePlanSchema), PlanController.updatePlan);
router.delete('/:planId', PlanController.deactivatePlan);

export default router;
