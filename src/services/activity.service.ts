import { Activity } from '../models/activity.model';
import mongoose from 'mongoose';
import logger from '../utils/logger';

export class ActivityService {
  static async logActivity(data: {
    weddingId: string;
    userId: string;
    actionType: string;
    entityType: string;
    entityId?: string;
    entityName?: string;
    description: string;
    changes?: any;
  }) {
    try {
      const activity = await Activity.create({
        ...data,
        weddingId: new mongoose.Types.ObjectId(data.weddingId),
        userId: new mongoose.Types.ObjectId(data.userId),
        entityId: data.entityId ? new mongoose.Types.ObjectId(data.entityId) : undefined
      });

      logger.info(`Activity logged: ${data.actionType} on ${data.entityType}`);
      return activity;
    } catch (error) {
      logger.error('Error logging activity:', error);
      throw error;
    }
  }

  static async getWeddingActivities(weddingId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;

    const activities = await Activity.find({ weddingId })
      .populate('userId', 'fullName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Activity.countDocuments({ weddingId });

    return {
      activities,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    };
  }
}