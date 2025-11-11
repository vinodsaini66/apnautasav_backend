import { Request, Response } from 'express';
import { ActivityService } from '../services/activity.service';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';

export class ActivityController {
  static async getActivities(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const { page = 1, limit = 50 } = req.query;

      const result = await ActivityService.getWeddingActivities(
        weddingId,
        Number(page),
        Number(limit)
      );

      ApiResponse.paginated(
        res,
        result.activities,
        result.page,
        result.limit,
        result.total
      );
    } catch (error: any) {
      logger.error('Get activities error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch activities');
    }
  }
}