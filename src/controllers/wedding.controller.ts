import { Request, Response } from 'express';
import { Wedding } from '../models/wedding.model';
import { Collaborator } from '../models/collaborator.model';
import { Guest } from '../models/guest.model';
import { Task } from '../models/task.model';
import { Budget } from '../models/budget.model';
import { generateWeddingCode } from '../utils/generateCode';
import { ApiResponse } from '../utils/apiResponse';
import { ActivityService } from '../services/activity.service';
import logger from '../utils/logger';

export class WeddingController {
  static async createWedding(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { brideName, groomName, weddingDate, location, totalBudget, currency, description, imageUrl,name } = req.body;

      const weddingCode = generateWeddingCode();

      const wedding = await Wedding.create({
        weddingCode,
        name,
        brideName,
        groomName,
        weddingDate,
        location,
        totalBudget,
        currency: currency || 'INR',
        description,
        imageUrl,
        createdBy: userId,
        status: 'planning'
      });

      // Log activity
      await ActivityService.logActivity({
        weddingId: String(wedding._id),
        userId: userId!,
        actionType: 'created',
        entityType: 'wedding',
        entityId: String(wedding._id),
        entityName: `${brideName} & ${groomName}`,
        description: `Created wedding for ${brideName} and ${groomName}`
      });

      ApiResponse.success(res, 201, {
        message: 'Wedding created successfully',
        data: wedding
      });
    } catch (error: any) {
      logger.error('Create wedding error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to create wedding');
    }
  }

  static async getWeddings(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { page = 1, limit = 20, status } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const filter: any = {};

      if (status) {
        filter.status = status;
      }

      // Get weddings created by user
      const createdWeddings = await Wedding.find({
        ...filter,
        createdBy: userId
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

      // Get weddings where user is collaborator
      const collaborations = await Collaborator.find({
        userId,
        invitationStatus: 'accepted'
      }).select('weddingId');

      const collaboratorWeddingIds = collaborations.map(c => c.weddingId);

      const collaboratorWeddings = await Wedding.find({
        ...filter,
        _id: { $in: collaboratorWeddingIds }
      })
        .sort({ createdAt: -1 })
        .lean();

      const allWeddings = [...createdWeddings, ...collaboratorWeddings];
      const total = allWeddings.length;

      ApiResponse.paginated(res, allWeddings, Number(page), Number(limit), total);
    } catch (error: any) {
      logger.error('Get weddings error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch weddings');
    }
  }

  static async getWeddingById(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;

      const wedding = await Wedding.findById(weddingId)
        .populate('createdBy', 'fullName email phoneNumber')
        .lean();

      if (!wedding) {
        ApiResponse.error(res, 404, 'Wedding not found');
        return;
      }

      // Get collaborators
      const collaborators = await Collaborator.find({
        weddingId,
        invitationStatus: 'accepted'
      })
        .populate('userId', 'fullName email phoneNumber')
        .lean();

      ApiResponse.success(res, 200, {
        data: {
          ...wedding,
          collaborators
        }
      });
    } catch (error: any) {
      logger.error('Get wedding error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch wedding');
    }
  }

  static async updateWedding(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const userId = req.user?.userId;
      const updateData = req.body;

      const wedding = await Wedding.findByIdAndUpdate(
        weddingId,
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!wedding) {
        ApiResponse.error(res, 404, 'Wedding not found');
        return;
      }

      // Log activity
      await ActivityService.logActivity({
        weddingId: String(wedding._id),
        userId: userId!,
        actionType: 'updated',
        entityType: 'wedding',
        entityId: String(wedding._id),
        entityName: `${wedding.brideName} & ${wedding.groomName}`,
        description: 'Updated wedding details'
      });

      ApiResponse.success(res, 200, {
        message: 'Wedding updated successfully',
        data: wedding
      });
    } catch (error: any) {
      logger.error('Update wedding error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to update wedding');
    }
  }

  static async deleteWedding(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;

      const wedding = await Wedding.findByIdAndDelete(weddingId);

      if (!wedding) {
        ApiResponse.error(res, 404, 'Wedding not found');
        return;
      }

      // Delete related data
      await Promise.all([
        Guest.deleteMany({ weddingId }),
        Task.deleteMany({ weddingId }),
        Budget.deleteMany({ weddingId }),
        Collaborator.deleteMany({ weddingId })
      ]);

      ApiResponse.success(res, 200, {
        message: 'Wedding deleted successfully'
      });
    } catch (error: any) {
      logger.error('Delete wedding error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to delete wedding');
    }
  }

  static async joinWedding(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { weddingCode } = req.body;

      const wedding = await Wedding.findOne({ weddingCode });

      if (!wedding) {
        ApiResponse.error(res, 404, 'Invalid wedding code');
        return;
      }

      // Check if already a collaborator
      const existingCollaborator = await Collaborator.findOne({
        weddingId: wedding._id,
        userId
      });

      if (existingCollaborator) {
        ApiResponse.error(res, 400, 'You are already a member of this wedding');
        return;
      }

      // Add as collaborator
      const collaborator = await Collaborator.create({
        weddingId: wedding._id,
        userId,
        role: 'editor',
        invitationStatus: 'accepted',
        joinedAt: new Date()
      });

      // Log activity
      await ActivityService.logActivity({
        weddingId: String(wedding._id),
        userId: userId!,
        actionType: 'member_joined',
        entityType: 'collaborator',
        description: 'Joined the wedding using code'
      });

      ApiResponse.success(res, 200, {
        message: 'Successfully joined the wedding',
        data: {
          wedding,
          collaborator
        }
      });
    } catch (error: any) {
      logger.error('Join wedding error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to join wedding');
    }
  }

  static async getWeddingStats(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;

      const [guestCount, taskCount, completedTasks, budgetItems, totalSpent] = await Promise.all([
        Guest.countDocuments({ weddingId }),
        Task.countDocuments({ weddingId }),
        Task.countDocuments({ weddingId, status: 'completed' }),
        Budget.countDocuments({ weddingId }),
        Budget.aggregate([
          { $match: { weddingId: weddingId as any } },
          { $group: { _id: null, total: { $sum: '$actualCost' } } }
        ])
      ]);

      const wedding = await Wedding.findById(weddingId).select('totalBudget');

      const stats = {
        guests: {
          total: guestCount
        },
        tasks: {
          total: taskCount,
          completed: completedTasks,
          pending: taskCount - completedTasks,
          completionRate: taskCount > 0 ? ((completedTasks / taskCount) * 100).toFixed(2) : 0
        },
        budget: {
          total: wedding?.totalBudget || 0,
          spent: totalSpent[0]?.total || 0,
          remaining: (wedding?.totalBudget || 0) - (totalSpent[0]?.total || 0),
          items: budgetItems
        }
      };

      ApiResponse.success(res, 200, { data: stats });
    } catch (error: any) {
      logger.error('Get wedding stats error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch wedding statistics');
    }
  }
}