import { Request, Response } from 'express';
import { Budget } from '../models/budget.model';
import { ApiResponse } from '../utils/apiResponse';
import { ActivityService } from '../services/activity.service';
import { NotificationService } from '../services/notification.service';
import logger from '../utils/logger';

async function notifyBudgetChange(
    weddingId: string,
    userId: string,
    budgetCategory: string,
    action: 'added' | 'updated' | 'deleted'
): Promise<void> {
    try {
        const recipientIds = await NotificationService.getWeddingRecipientIds(weddingId, userId);
        if (recipientIds.length > 0) {
            await NotificationService.notifyBudgetUpdate(weddingId, recipientIds, userId, budgetCategory, action);
        }
    } catch (notifyError) {
        logger.warn('Failed to send budget update notification:', notifyError);
    }
}

export class BudgetController {
    static async createBudget(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId } = req.params;
            const userId = req.user?.userId;
            const budgetData = req.body;

            const budget = await Budget.create({
                ...budgetData,
                weddingId,
                addedBy: userId
            });

            // Log activity
            await ActivityService.logActivity({
                weddingId,
                userId: userId!,
                actionType: 'created',
                entityType: 'budget',
                entityId: String(budget._id),
                entityName: budget.description,
                description: `Added budget item: ${budget.description}`
            });

            await notifyBudgetChange(weddingId, userId!, budget.category, 'added');

            ApiResponse.success(res, 201, {
                message: 'Budget item added successfully',
                data: budget
            });
        } catch (error: any) {
            logger.error('Create budget error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to add budget item');
        }
    }

    static async getBudgets(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId } = req.params;
            const { page = 1, limit = 50, category, status, eventId } = req.query;

            const skip = (Number(page) - 1) * Number(limit);
            const filter: any = { weddingId };

            if (category) filter.category = category;
            if (status) filter.status = status;
            if (eventId) filter.eventId = eventId;

            const budgets = await Budget.find(filter)
                .populate('vendor', 'vendorName')
                .populate('addedBy', 'fullName')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .lean();

            const total = await Budget.countDocuments(filter);

            ApiResponse.paginated(res, budgets, Number(page), Number(limit), total);
        } catch (error: any) {
            logger.error('Get budgets error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to fetch budget items');
        }
    }

    static async updateBudget(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId, budgetId } = req.params;
            const userId = req.user?.userId;
            const updateData = req.body;

            const budget = await Budget.findOneAndUpdate(
                { _id: budgetId, weddingId },
                { $set: updateData },
                { new: true, runValidators: true }
            );

            if (!budget) {
                ApiResponse.error(res, 404, 'Budget item not found');
                return;
            }

            // Log activity
            await ActivityService.logActivity({
                weddingId,
                userId: userId!,
                actionType: 'updated',
                entityType: 'budget',
                entityId: String(budget._id),
                entityName: budget.description,
                description: `Updated budget item: ${budget.description}`
            });

            await notifyBudgetChange(weddingId, userId!, budget.category, 'updated');

            ApiResponse.success(res, 200, {
                message: 'Budget item updated successfully',
                data: budget
            });
        } catch (error: any) {
            logger.error('Update budget error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to update budget item');
        }
    }

    static async deleteBudget(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId, budgetId } = req.params;
            const userId = req.user?.userId;

            const budget = await Budget.findOneAndDelete({ _id: budgetId, weddingId });

            if (!budget) {
                ApiResponse.error(res, 404, 'Budget item not found');
                return;
            }

            // Log activity
            await ActivityService.logActivity({
                weddingId,
                userId: userId!,
                actionType: 'deleted',
                entityType: 'budget',
                entityName: budget.description,
                description: `Deleted budget item: ${budget.description}`
            });

            await notifyBudgetChange(weddingId, userId!, budget.category, 'deleted');

            ApiResponse.success(res, 200, {
                message: 'Budget item deleted successfully'
            });
        } catch (error: any) {
            logger.error('Delete budget error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to delete budget item');
        }
    }

    static async getBudgetAnalytics(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId } = req.params;
            const { eventId } = req.query;

            // Optional ?eventId= scopes the whole breakdown to one function
            // (e.g. "just Sangeet spend by category") instead of the whole
            // wedding.
            const matchStage: any = { weddingId: weddingId as any };
            if (eventId) matchStage.eventId = eventId as any;

            const analytics = await Budget.aggregate([
                { $match: matchStage },
                {
                    $group: {
                        _id: '$category',
                        totalEstimated: { $sum: '$estimatedCost' },
                        totalActual: { $sum: '$actualCost' },
                        count: { $sum: 1 }
                    }
                },
                {
                    $project: {
                        category: '$_id',
                        totalEstimated: 1,
                        totalActual: 1,
                        count: 1,
                        variance: { $subtract: ['$totalActual', '$totalEstimated'] }
                    }
                }
            ]);

            const totals = await Budget.aggregate([
                { $match: matchStage },
                {
                    $group: {
                        _id: null,
                        totalEstimated: { $sum: '$estimatedCost' },
                        totalActual: { $sum: '$actualCost' }
                    }
                }
            ]);

            ApiResponse.success(res, 200, {
                data: {
                    byCategory: analytics,
                    totals: totals[0] || { totalEstimated: 0, totalActual: 0 }
                }
            });
        } catch (error: any) {
            logger.error('Get budget analytics error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to fetch budget analytics');
        }
    }
}