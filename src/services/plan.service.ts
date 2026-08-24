import { Plan, IPlan } from '../models/plan.model';
import logger from '../utils/logger';

interface PlanInput {
  key?: string;
  name?: string;
  description?: string;
  type?: 'free' | 'one_time' | 'subscription';
  price?: number;
  currency?: string;
  billingPeriod?: 'monthly' | 'annual' | null;
  limits?: { guests: number; tasks: number; vendors: number; collaborators: number };
  budgetEnabled?: boolean;
  maxWeddings?: number | null;
  isActive?: boolean;
  sortOrder?: number;
}

export class PlanService {
  /** Public catalog — what the Pricing page renders. */
  static async getActivePlans(): Promise<IPlan[]> {
    return Plan.find({ isActive: true }).sort({ sortOrder: 1, price: 1 }).lean() as unknown as Promise<IPlan[]>;
  }

  /** Admin listing — every plan, active or not. */
  static async getAllPlans(): Promise<IPlan[]> {
    return Plan.find().sort({ sortOrder: 1, createdAt: -1 }).lean() as unknown as Promise<IPlan[]>;
  }

  static async getPlanById(planId: string): Promise<IPlan | null> {
    return Plan.findById(planId).lean() as unknown as Promise<IPlan | null>;
  }

  static async createPlan(data: PlanInput): Promise<IPlan> {
    const plan = await Plan.create(data);
    logger.info(`Plan created: ${plan.key}`);
    return plan;
  }

  static async updatePlan(planId: string, data: PlanInput): Promise<IPlan | null> {
    const plan = await Plan.findByIdAndUpdate(planId, { $set: data }, { new: true, runValidators: true }).lean();
    return plan as IPlan | null;
  }

  /** Soft-delete only — Purchases reference planId, so plans are never hard-deleted. */
  static async deactivatePlan(planId: string): Promise<IPlan | null> {
    const plan = await Plan.findByIdAndUpdate(planId, { $set: { isActive: false } }, { new: true }).lean();
    return plan as IPlan | null;
  }
}
