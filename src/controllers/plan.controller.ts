import { Request, Response } from 'express';
import { PlanService } from '../services/plan.service';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';

export class PlanController {
  /** GET /plans — public catalog for the Pricing page. */
  static async getActivePlans(_req: Request, res: Response): Promise<void> {
    try {
      const plans = await PlanService.getActivePlans();
      ApiResponse.success(res, 200, { message: 'Plans fetched successfully', data: plans });
    } catch (error: any) {
      logger.error('Get active plans error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch plans');
    }
  }

  /** GET /plans/all — admin listing, active or not. */
  static async getAllPlans(_req: Request, res: Response): Promise<void> {
    try {
      const plans = await PlanService.getAllPlans();
      ApiResponse.success(res, 200, { message: 'Plans fetched successfully', data: plans });
    } catch (error: any) {
      logger.error('Get all plans error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch plans');
    }
  }

  static async getPlanById(req: Request, res: Response): Promise<void> {
    try {
      const plan = await PlanService.getPlanById(req.params.planId);
      if (!plan) {
        ApiResponse.error(res, 404, 'Plan not found');
        return;
      }
      ApiResponse.success(res, 200, { message: 'Plan fetched successfully', data: plan });
    } catch (error: any) {
      logger.error('Get plan error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch plan');
    }
  }

  static async createPlan(req: Request, res: Response): Promise<void> {
    try {
      const plan = await PlanService.createPlan(req.body);
      ApiResponse.success(res, 201, { message: 'Plan created successfully', data: plan });
    } catch (error: any) {
      logger.error('Create plan error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to create plan');
    }
  }

  static async updatePlan(req: Request, res: Response): Promise<void> {
    try {
      const plan = await PlanService.updatePlan(req.params.planId, req.body);
      if (!plan) {
        ApiResponse.error(res, 404, 'Plan not found');
        return;
      }
      ApiResponse.success(res, 200, { message: 'Plan updated successfully', data: plan });
    } catch (error: any) {
      logger.error('Update plan error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to update plan');
    }
  }

  /** Soft-delete (isActive: false) — never a hard delete, Purchases reference planId. */
  static async deactivatePlan(req: Request, res: Response): Promise<void> {
    try {
      const plan = await PlanService.deactivatePlan(req.params.planId);
      if (!plan) {
        ApiResponse.error(res, 404, 'Plan not found');
        return;
      }
      ApiResponse.success(res, 200, { message: 'Plan deactivated successfully', data: plan });
    } catch (error: any) {
      logger.error('Deactivate plan error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to deactivate plan');
    }
  }
}
