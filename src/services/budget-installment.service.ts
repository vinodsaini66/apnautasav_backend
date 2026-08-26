import { Budget } from '../models/budget.model';
import logger from '../utils/logger';

/**
 * Recomputes a Budget's denormalized actualCost/amountPaid from its
 * installments array. If installments is empty, actualCost/amountPaid are
 * left untouched — a budget with no installments still tracks actualCost
 * as a plain manually-entered field (the "installments lock the field"
 * behavior is a frontend-only UI affordance; the backend just guarantees
 * actualCost/amountPaid stay in sync with installments whenever any exist).
 */
export const recalculateBudgetActual = async (budgetId: string | any): Promise<void> => {
  try {
    const budget = await Budget.findById(budgetId);
    if (!budget) return;

    if (!budget.installments || budget.installments.length === 0) {
      return;
    }

    const actualCost = budget.installments.reduce((sum, installment) => sum + (installment.amount || 0), 0);
    const amountPaid = budget.installments
      .filter((installment) => installment.status === 'paid')
      .reduce((sum, installment) => sum + (installment.amount || 0), 0);

    budget.actualCost = actualCost;
    budget.amountPaid = amountPaid;

    await budget.save();
  } catch (error) {
    logger.error('Error recalculating budget actual cost from installments:', error);
    throw error;
  }
};
