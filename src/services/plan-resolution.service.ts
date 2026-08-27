import { Plan, IPlanLimits } from '../models/plan.model';
import { Purchase } from '../models/purchase.model';
import { Wedding } from '../models/wedding.model';
import { Guest } from '../models/guest.model';
import { Task } from '../models/task.model';
import { Vendor } from '../models/vendor.model';
import { Collaborator } from '../models/collaborator.model';
import logger from '../utils/logger';

export const UNLIMITED = -1;

// Hard-coded last resort, used only if the 'free' Plan document is ever
// missing or deactivated (should never happen once seeded) — keeps the app
// from hard-failing every request for every free user if that row disappears.
const FREE_PLAN_FALLBACK = {
  planKey: 'free',
  limits: { guests: 50, tasks: 50, vendors: 5, collaborators: 0 } as IPlanLimits,
  budgetEnabled: false,
  aiAssistantEnabled: true,
  maxWeddings: 1,
};

export type PlanSource = 'subscription' | 'one_time' | 'free';

export interface EffectivePlan {
  source: PlanSource;
  planKey: string;
  limits: IPlanLimits;
  budgetEnabled: boolean;
  aiAssistantEnabled: boolean;
  purchaseId?: string;
}

export interface UsageCounts {
  guests: number;
  tasks: number;
  vendors: number;
  collaborators: number;
}

export class PlanResolutionService {
  private static async getFreePlanDefaults(): Promise<{
    planKey: string;
    limits: IPlanLimits;
    budgetEnabled: boolean;
    aiAssistantEnabled: boolean;
    maxWeddings: number | null;
  }> {
    const freePlan = await Plan.findOne({ key: 'free', isActive: true }).lean();
    if (!freePlan) {
      logger.warn('Free plan document not found/inactive — falling back to hardcoded defaults');
      return FREE_PLAN_FALLBACK;
    }
    return {
      planKey: freePlan.key,
      limits: freePlan.limits,
      budgetEnabled: freePlan.budgetEnabled,
      // Pre-migration Plan documents fetched via .lean() won't have this
      // field in the DB yet — schema defaults don't apply to .lean() reads,
      // so fall back to true (this field's default) explicitly.
      aiAssistantEnabled: freePlan.aiAssistantEnabled ?? true,
      maxWeddings: freePlan.maxWeddings,
    };
  }

  private static async getActiveSubscription(ownerUserId: string) {
    const now = new Date();
    return Purchase.findOne({
      userId: ownerUserId,
      planType: 'subscription',
      status: 'active',
      $or: [{ endDate: null }, { endDate: { $gt: now } }],
    })
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * The effective limits currently in force for a given wedding, resolved
   * from the wedding OWNER's account (`wedding.createdBy`) — never the
   * acting collaborator's own plan. Precedence: owner's active subscription
   * (account-level, wins for every wedding they have) > an active one-time
   * purchase scoped to this exact wedding > Free plan defaults.
   */
  static async getEffectivePlanForWedding(ownerUserId: string, weddingId: string): Promise<EffectivePlan> {
    const subscription = await this.getActiveSubscription(ownerUserId);
    if (subscription) {
      return {
        source: 'subscription',
        planKey: subscription.planKey,
        limits: subscription.limitsSnapshot,
        budgetEnabled: subscription.budgetEnabledSnapshot,
        // .lean() skips schema defaults — pre-migration purchases fall back to true.
        aiAssistantEnabled: subscription.aiAssistantEnabledSnapshot ?? true,
        purchaseId: String(subscription._id),
      };
    }

    const oneTime = await Purchase.findOne({
      weddingId,
      planType: 'one_time',
      status: 'active',
    })
      .sort({ createdAt: -1 })
      .lean();

    if (oneTime) {
      return {
        source: 'one_time',
        planKey: oneTime.planKey,
        limits: oneTime.limitsSnapshot,
        budgetEnabled: oneTime.budgetEnabledSnapshot,
        aiAssistantEnabled: oneTime.aiAssistantEnabledSnapshot ?? true,
        purchaseId: String(oneTime._id),
      };
    }

    const free = await this.getFreePlanDefaults();
    return {
      source: 'free',
      planKey: free.planKey,
      limits: free.limits,
      budgetEnabled: free.budgetEnabled,
      aiAssistantEnabled: free.aiAssistantEnabled,
    };
  }

  /**
   * How many weddings this user is allowed to CREATE in total. An active
   * subscription replaces the Free plan's cap entirely.
   */
  static async getWeddingCreationCap(userId: string): Promise<{ cap: number; source: 'subscription' | 'free' }> {
    const subscription = await this.getActiveSubscription(userId);
    if (subscription) {
      return { cap: subscription.maxWeddingsSnapshot ?? UNLIMITED, source: 'subscription' };
    }
    const free = await this.getFreePlanDefaults();
    return { cap: free.maxWeddings ?? 1, source: 'free' };
  }

  static async getCurrentUsage(weddingId: string): Promise<UsageCounts> {
    const [guests, tasks, vendors, collaborators] = await Promise.all([
      Guest.countDocuments({ weddingId }),
      Task.countDocuments({ weddingId }),
      Vendor.countDocuments({ weddingId }),
      Collaborator.countDocuments({ weddingId, invitationStatus: { $in: ['pending', 'accepted'] } }),
    ]);
    return { guests, tasks, vendors, collaborators };
  }

  /** Convenience used by middleware: loads the wedding just to get its owner. */
  static async getWeddingOwner(weddingId: string): Promise<string | null> {
    const wedding = await Wedding.findById(weddingId).select('createdBy').lean();
    return wedding ? String(wedding.createdBy) : null;
  }

  /**
   * Account-level summary for GET /me/plan — whether the user has an active
   * subscription, its plan key, their wedding-creation cap, and how many
   * they've used. Powers the Pricing page's "you're already on X" state.
   */
  static async getAccountPlanSummary(userId: string): Promise<{
    hasActiveSubscription: boolean;
    planKey: string;
    cap: number;
    weddingsUsed: number;
  }> {
    const [subscription, weddingsUsed] = await Promise.all([
      this.getActiveSubscription(userId),
      Wedding.countDocuments({ createdBy: userId }),
    ]);

    if (subscription) {
      return {
        hasActiveSubscription: true,
        planKey: subscription.planKey,
        cap: subscription.maxWeddingsSnapshot ?? UNLIMITED,
        weddingsUsed,
      };
    }

    const free = await this.getFreePlanDefaults();
    return {
      hasActiveSubscription: false,
      planKey: free.planKey,
      cap: free.maxWeddings ?? 1,
      weddingsUsed,
    };
  }
}
