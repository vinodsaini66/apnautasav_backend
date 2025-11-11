import { Router } from 'express';
import { BudgetController } from '../controllers/budget.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, checkPermission } from '../middleware/authorization.middleware';
import { validate } from '../middleware/validation.middleware';
import { createBudgetSchema, updateBudgetSchema } from '../validators/budget.validator';
import { CollaboratorRole } from '../types';

const router :Router= Router();

router.use(authMiddleware);

router.post('/:weddingId/budget', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), validate(createBudgetSchema), BudgetController.createBudget);
router.get('/:weddingId/budget', checkWeddingAccess, BudgetController.getBudgets);
router.put('/:weddingId/budget/:budgetId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), validate(updateBudgetSchema), BudgetController.updateBudget);
router.delete('/:weddingId/budget/:budgetId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), BudgetController.deleteBudget);
router.get('/:weddingId/budget/analytics', checkWeddingAccess, BudgetController.getBudgetAnalytics);

export default router;