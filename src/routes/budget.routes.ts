import { Router } from 'express';
import { BudgetController } from '../controllers/budget.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, requirePermission } from '../middleware/authorization.middleware';
import { checkBudgetEnabled } from '../middleware/planLimit.middleware';
import { validate } from '../middleware/validation.middleware';
import { documentUpload } from '../middleware/upload.middleware';
import { createBudgetSchema, updateBudgetSchema } from '../validators/budget.validator';
import { createBudgetInstallmentSchema, updateBudgetInstallmentSchema } from '../validators/budget-installment.validator';

const router :Router= Router();

router.use(authMiddleware);

router.post('/:weddingId/budget', checkWeddingAccess, requirePermission('budget.manage'), checkBudgetEnabled, validate(createBudgetSchema), BudgetController.createBudget);
router.get('/:weddingId/budget', checkWeddingAccess, requirePermission('budget.view'), BudgetController.getBudgets);
router.put('/:weddingId/budget/:budgetId', checkWeddingAccess, requirePermission('budget.manage'), validate(updateBudgetSchema), BudgetController.updateBudget);
router.delete('/:weddingId/budget/:budgetId', checkWeddingAccess, requirePermission('budget.manage'), BudgetController.deleteBudget);
router.get('/:weddingId/budget/analytics', checkWeddingAccess, requirePermission('budget.view'), BudgetController.getBudgetAnalytics);
router.get('/:weddingId/budget/export', checkWeddingAccess, requirePermission('budget.view'), BudgetController.exportBudget);

// Installments
router.post('/:weddingId/budget/:budgetId/installments', checkWeddingAccess, requirePermission('budget.manage'), validate(createBudgetInstallmentSchema), BudgetController.addInstallment);
router.put('/:weddingId/budget/:budgetId/installments/:installmentId', checkWeddingAccess, requirePermission('budget.manage'), validate(updateBudgetInstallmentSchema), BudgetController.updateInstallment);
router.delete('/:weddingId/budget/:budgetId/installments/:installmentId', checkWeddingAccess, requirePermission('budget.manage'), BudgetController.deleteInstallment);

// Receipts
router.post('/:weddingId/budget/:budgetId/receipts', checkWeddingAccess, requirePermission('budget.manage'), documentUpload.array('files', 5), BudgetController.uploadReceipts);
router.delete('/:weddingId/budget/:budgetId/receipts/:documentId', checkWeddingAccess, requirePermission('budget.manage'), BudgetController.deleteReceipt);

export default router;