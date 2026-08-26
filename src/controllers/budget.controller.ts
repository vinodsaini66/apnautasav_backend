import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Budget } from '../models/budget.model';
import { ApiResponse } from '../utils/apiResponse';
import { ActivityService } from '../services/activity.service';
import { NotificationService } from '../services/notification.service';
import { recalculateBudgetActual } from '../services/budget-installment.service';
import { uploadBufferToS3, deleteObjectFromS3ByUrl } from '../config/s3';
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
            // .aggregate() talks to the raw MongoDB driver, not Mongoose's
            // query layer — string ids are NOT auto-cast to ObjectId here
            // (unlike Model.find()), so $match on a bare string silently
            // matches nothing. Cast explicitly, matching the convention
            // already used in event.controller.ts's aggregations.
            const matchStage: any = { weddingId: new mongoose.Types.ObjectId(weddingId) };
            if (eventId) matchStage.eventId = new mongoose.Types.ObjectId(eventId as string);

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

    static async addInstallment(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId, budgetId } = req.params;
            const userId = req.user?.userId;
            const { label, amount, dueDate, notes } = req.body;

            const budget = await Budget.findOne({ _id: budgetId, weddingId });
            if (!budget) {
                ApiResponse.error(res, 404, 'Budget item not found');
                return;
            }

            budget.installments.push({
                label,
                amount,
                dueDate,
                notes,
                status: 'pending',
                createdAt: new Date()
            } as any);
            await budget.save();

            await recalculateBudgetActual(String(budget._id));
            const updatedBudget = await Budget.findById(budget._id);

            await ActivityService.logActivity({
                weddingId,
                userId: userId!,
                actionType: 'updated',
                entityType: 'budget',
                entityId: String(budget._id),
                entityName: budget.description,
                description: `Added installment "${label}" to budget item: ${budget.description}`
            });

            await notifyBudgetChange(weddingId, userId!, budget.category, 'updated');

            ApiResponse.success(res, 201, {
                message: 'Installment added successfully',
                data: updatedBudget
            });
        } catch (error: any) {
            logger.error('Add budget installment error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to add installment');
        }
    }

    static async updateInstallment(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId, budgetId, installmentId } = req.params;
            const userId = req.user?.userId;
            const updateData = req.body;

            const budget = await Budget.findOne({ _id: budgetId, weddingId });
            if (!budget) {
                ApiResponse.error(res, 404, 'Budget item not found');
                return;
            }

            const installment = budget.installments.find((inst: any) => String(inst._id) === installmentId);
            if (!installment) {
                ApiResponse.error(res, 404, 'Installment not found');
                return;
            }

            Object.assign(installment, updateData);
            await budget.save();

            await recalculateBudgetActual(String(budget._id));
            const updatedBudget = await Budget.findById(budget._id);

            await ActivityService.logActivity({
                weddingId,
                userId: userId!,
                actionType: 'updated',
                entityType: 'budget',
                entityId: String(budget._id),
                entityName: budget.description,
                description: `Updated installment "${installment.label}" for budget item: ${budget.description}`
            });

            await notifyBudgetChange(weddingId, userId!, budget.category, 'updated');

            ApiResponse.success(res, 200, {
                message: 'Installment updated successfully',
                data: updatedBudget
            });
        } catch (error: any) {
            logger.error('Update budget installment error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to update installment');
        }
    }

    static async deleteInstallment(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId, budgetId, installmentId } = req.params;
            const userId = req.user?.userId;

            const budget = await Budget.findOne({ _id: budgetId, weddingId });
            if (!budget) {
                ApiResponse.error(res, 404, 'Budget item not found');
                return;
            }

            const installment = budget.installments.find((inst: any) => String(inst._id) === installmentId);
            if (!installment) {
                ApiResponse.error(res, 404, 'Installment not found');
                return;
            }

            const label = installment.label;
            budget.installments = budget.installments.filter((inst: any) => String(inst._id) !== installmentId) as any;
            await budget.save();

            await recalculateBudgetActual(String(budget._id));
            const updatedBudget = await Budget.findById(budget._id);

            await ActivityService.logActivity({
                weddingId,
                userId: userId!,
                actionType: 'updated',
                entityType: 'budget',
                entityId: String(budget._id),
                entityName: budget.description,
                description: `Removed installment "${label}" from budget item: ${budget.description}`
            });

            await notifyBudgetChange(weddingId, userId!, budget.category, 'updated');

            ApiResponse.success(res, 200, {
                message: 'Installment deleted successfully',
                data: updatedBudget
            });
        } catch (error: any) {
            logger.error('Delete budget installment error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to delete installment');
        }
    }

    static async uploadReceipts(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId, budgetId } = req.params;
            const userId = req.user?.userId;
            const documentType = ['receipt', 'invoice', 'other'].includes(req.body?.documentType)
                ? req.body.documentType
                : 'receipt';

            if (!userId) {
                ApiResponse.error(res, 401, 'Unauthorized');
                return;
            }

            const files = (req.files as Express.Multer.File[]) || [];
            if (files.length === 0) {
                ApiResponse.error(res, 400, 'No files provided (field name: "files")');
                return;
            }

            const budget = await Budget.findOne({ _id: budgetId, weddingId });
            if (!budget) {
                ApiResponse.error(res, 404, 'Budget item not found');
                return;
            }

            const uploaded = await Promise.all(
                files.map(async (file) => {
                    const url = await uploadBufferToS3(
                        file.buffer,
                        file.originalname,
                        file.mimetype,
                        `budget/${budgetId}/receipts`
                    );

                    return {
                        url,
                        fileName: file.originalname,
                        documentType,
                        uploadedBy: userId,
                        uploadedAt: new Date()
                    };
                })
            );

            budget.receipts.push(...(uploaded as any[]));
            await budget.save();

            await ActivityService.logActivity({
                weddingId,
                userId: userId!,
                actionType: 'updated',
                entityType: 'budget',
                entityId: String(budget._id),
                entityName: budget.description,
                description: `Uploaded ${uploaded.length} receipt(s) for budget item: ${budget.description}`
            });

            ApiResponse.success(res, 201, {
                message: 'Receipts uploaded successfully',
                data: budget
            });
        } catch (error: any) {
            logger.error('Upload budget receipts error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to upload receipts');
        }
    }

    static async deleteReceipt(req: Request, res: Response): Promise<void> {
        try {
            const { weddingId, budgetId, documentId } = req.params;
            const userId = req.user?.userId;

            const budget = await Budget.findOne({ _id: budgetId, weddingId });
            if (!budget) {
                ApiResponse.error(res, 404, 'Budget item not found');
                return;
            }

            const document = budget.receipts.find((doc: any) => String(doc._id) === documentId);
            if (!document) {
                ApiResponse.error(res, 404, 'Receipt not found');
                return;
            }

            budget.receipts = budget.receipts.filter((doc: any) => String(doc._id) !== documentId);
            await budget.save();

            try {
                await deleteObjectFromS3ByUrl(document.url);
            } catch (s3Error) {
                logger.error('Best-effort S3 delete failed for budget receipt:', s3Error);
            }

            await ActivityService.logActivity({
                weddingId,
                userId: userId!,
                actionType: 'updated',
                entityType: 'budget',
                entityId: String(budget._id),
                entityName: budget.description,
                description: `Removed receipt "${document.fileName}" from budget item: ${budget.description}`
            });

            ApiResponse.success(res, 200, {
                message: 'Receipt deleted successfully',
                data: budget
            });
        } catch (error: any) {
            logger.error('Delete budget receipt error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to delete receipt');
        }
    }
}