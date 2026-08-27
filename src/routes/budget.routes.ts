import { Router } from 'express';
import { BudgetController } from '../controllers/budget.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkWeddingAccess, checkPermission } from '../middleware/authorization.middleware';
import { checkBudgetEnabled } from '../middleware/planLimit.middleware';
import { validate } from '../middleware/validation.middleware';
import { documentUpload } from '../middleware/upload.middleware';
import { createBudgetSchema, updateBudgetSchema } from '../validators/budget.validator';
import { createBudgetInstallmentSchema, updateBudgetInstallmentSchema } from '../validators/budget-installment.validator';
import { CollaboratorRole } from '../types';

const router :Router= Router();

router.use(authMiddleware);

router.post('/:weddingId/budget', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), checkBudgetEnabled, validate(createBudgetSchema), BudgetController.createBudget);
router.get('/:weddingId/budget', checkWeddingAccess, BudgetController.getBudgets);
router.put('/:weddingId/budget/:budgetId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), validate(updateBudgetSchema), BudgetController.updateBudget);
router.delete('/:weddingId/budget/:budgetId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), BudgetController.deleteBudget);
router.get('/:weddingId/budget/analytics', checkWeddingAccess, BudgetController.getBudgetAnalytics);
router.get('/:weddingId/budget/export', checkWeddingAccess, BudgetController.exportBudget);

// Installments
router.post('/:weddingId/budget/:budgetId/installments', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), validate(createBudgetInstallmentSchema), BudgetController.addInstallment);
router.put('/:weddingId/budget/:budgetId/installments/:installmentId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), validate(updateBudgetInstallmentSchema), BudgetController.updateInstallment);
router.delete('/:weddingId/budget/:budgetId/installments/:installmentId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), BudgetController.deleteInstallment);

// Receipts
router.post('/:weddingId/budget/:budgetId/receipts', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), documentUpload.array('files', 5), BudgetController.uploadReceipts);
router.delete('/:weddingId/budget/:budgetId/receipts/:documentId', checkWeddingAccess, checkPermission(CollaboratorRole.EDITOR), BudgetController.deleteReceipt);

export default router;