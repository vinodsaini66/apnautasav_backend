import crypto from 'crypto';
import { Plan, IPlan } from '../models/plan.model';
import { Purchase, IPurchase } from '../models/purchase.model';
import { Wedding } from '../models/wedding.model';
import logger from '../utils/logger';

interface MockPaymentResult {
  status: 'success';
  reference: string;
  provider: 'mock';
}

export class PurchaseError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = 'PURCHASE_ERROR'
  ) {
    super(message);
  }
}

export class PurchaseService {
  /**
   * The one function a real payment gateway integration replaces. Today it
   * mocks an instantly-successful charge; later this becomes an actual call
   * out to Razorpay/Stripe/etc, and everything else in `purchasePlan` below
   * (plan lookup, ownership checks, snapshotting, activation) stays as-is.
   */
  private static async processPayment(_plan: IPlan): Promise<MockPaymentResult> {
    return {
      status: 'success',
      reference: `MOCK-${crypto.randomUUID()}`,
      provider: 'mock',
    };
  }

  private static computeEndDate(billingPeriod?: string | null): Date | null {
    if (!billingPeriod) return null;
    const endDate = new Date();
    if (billingPeriod === 'monthly') {
      endDate.setMonth(endDate.getMonth() + 1);
    } else if (billingPeriod === 'annual') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }
    return endDate;
  }

  static async purchasePlan(userId: string, planKey: string, weddingId?: string): Promise<IPurchase> {
    const plan = await Plan.findOne({ key: planKey, isActive: true });
    if (!plan) {
      throw new PurchaseError('Plan not found or no longer available', 404, 'PLAN_NOT_FOUND');
    }

    if (plan.type === 'one_time') {
      if (!weddingId) {
        throw new PurchaseError('weddingId is required to purchase a one-time plan', 400, 'WEDDING_ID_REQUIRED');
      }

      const wedding = await Wedding.findById(weddingId);
      if (!wedding) {
        throw new PurchaseError('Wedding not found', 404, 'WEDDING_NOT_FOUND');
      }

      if (wedding.createdBy.toString() !== userId) {
        throw new PurchaseError('Only the wedding creator can purchase a plan for this wedding', 403, 'FORBIDDEN');
      }

      // Only one active one-time purchase per wedding at a time.
      await Purchase.updateMany(
        { weddingId, planType: 'one_time', status: 'active' },
        { $set: { status: 'cancelled' } }
      );
    } else {
      // Subscription: account-level, ignores weddingId. Only one active
      // subscription per user at a time.
      await Purchase.updateMany(
        { userId, planType: 'subscription', status: 'active' },
        { $set: { status: 'cancelled' } }
      );
    }

    const payment = await this.processPayment(plan);

    const purchase = await Purchase.create({
      userId,
      planId: plan._id,
      planKey: plan.key,
      planType: plan.type as 'one_time' | 'subscription',
      weddingId: plan.type === 'one_time' ? weddingId : null,
      limitsSnapshot: plan.limits,
      budgetEnabledSnapshot: plan.budgetEnabled,
      aiAssistantEnabledSnapshot: plan.aiAssistantEnabled,
      maxWeddingsSnapshot: plan.maxWeddings,
      billingPeriodSnapshot: plan.billingPeriod ?? null,
      amount: plan.price,
      currency: plan.currency,
      status: 'active',
      paymentStatus: payment.status,
      paymentProvider: payment.provider,
      paymentReference: payment.reference,
      startDate: new Date(),
      endDate: plan.type === 'subscription' ? this.computeEndDate(plan.billingPeriod) : null,
    });

    logger.info(`Purchase completed: user=${userId} plan=${plan.key} purchase=${purchase._id}`);
    return purchase;
  }

  static async getMyPurchases(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [purchases, total] = await Promise.all([
      Purchase.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Purchase.countDocuments({ userId }),
    ]);
    return { purchases, page, limit, total };
  }
}
