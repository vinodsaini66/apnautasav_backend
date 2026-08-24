import { Request, Response } from 'express';
import { PurchaseService, PurchaseError } from '../services/purchase.service';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';

export class PurchaseController {
  static async createPurchase(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { planKey, weddingId } = req.body;

      const purchase = await PurchaseService.purchasePlan(userId, planKey, weddingId);

      ApiResponse.success(res, 201, {
        message: 'Plan purchased successfully',
        data: purchase,
      });
    } catch (error: any) {
      logger.error('Create purchase error:', error);
      if (error instanceof PurchaseError) {
        ApiResponse.error(res, error.statusCode, error.message, { code: error.code });
        return;
      }
      ApiResponse.error(res, 500, error.message || 'Failed to complete purchase');
    }
  }

  static async getMyPurchases(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { page = 1, limit = 20 } = req.query;

      const result = await PurchaseService.getMyPurchases(userId, Number(page), Number(limit));
      ApiResponse.paginated(res, result.purchases, result.page, result.limit, result.total);
    } catch (error: any) {
      logger.error('Get my purchases error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch purchase history');
    }
  }
}
