import { Request, Response, NextFunction } from 'express';
import { PlanResolutionService, UNLIMITED } from '../services/plan-resolution.service';
import { Wedding } from '../models/wedding.model';
import { ApiResponse } from '../utils/apiResponse';
import { ERROR_MESSAGES } from '../constants';

type CountableResource = 'guests' | 'tasks' | 'vendors' | 'collaborators';

/**
 * Gate a wedding-scoped "create" route on the wedding OWNER's effective
 * plan limit for `resource`. Sits in the same middleware slot as
 * `checkPermission` (after it, before `validate`) on every *.routes.ts file
 * that creates guests/tasks/vendors/collaborators.
 */
export const checkResourceLimit = (resource: CountableResource) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { weddingId } = req.params;

      const ownerId = await PlanResolutionService.getWeddingOwner(weddingId);
      if (!ownerId) {
        ApiResponse.error(res, 404, ERROR_MESSAGES.WEDDING_NOT_FOUND);
        return;
      }

      const effective = await PlanResolutionService.getEffectivePlanForWedding(ownerId, weddingId);
      const limit = effective.limits[resource];

      if (limit !== UNLIMITED) {
        const usage = await PlanResolutionService.getCurrentUsage(weddingId);
        const current = usage[resource];

        if (current >= limit) {
          ApiResponse.error(res, 403, `You have reached the ${resource} limit (${limit}) for your current plan.`, {
            code: 'PLAN_LIMIT_EXCEEDED',
            resource,
            limit,
            current,
            planKey: effective.planKey,
            upgradeRequired: true,
          });
          return;
        }
      }

      next();
    } catch (error) {
      ApiResponse.error(res, 500, ERROR_MESSAGES.INTERNAL_ERROR);
    }
  };
};

/**
 * Gate a wedding-scoped "create" route on a feature toggle rather than a
 * count (Budget has no natural cap — it's on or off for the plan).
 */
export const checkBudgetEnabled = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { weddingId } = req.params;

    const ownerId = await PlanResolutionService.getWeddingOwner(weddingId);
    if (!ownerId) {
      ApiResponse.error(res, 404, ERROR_MESSAGES.WEDDING_NOT_FOUND);
      return;
    }

    const effective = await PlanResolutionService.getEffectivePlanForWedding(ownerId, weddingId);

    if (!effective.budgetEnabled) {
      ApiResponse.error(res, 403, 'Budget is not available on your current plan.', {
        code: 'FEATURE_DISABLED',
        feature: 'budget',
        planKey: effective.planKey,
        upgradeRequired: true,
      });
      return;
    }

    next();
  } catch (error) {
    ApiResponse.error(res, 500, ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

/**
 * Gate the AI Assistant chat route on a feature toggle rather than a count,
 * mirroring checkBudgetEnabled exactly (same "on/off for the plan" shape —
 * AI Assistant has no natural cap either) but keyed on aiAssistantEnabled.
 */
export const checkAiAssistantEnabled = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { weddingId } = req.params;

    const ownerId = await PlanResolutionService.getWeddingOwner(weddingId);
    if (!ownerId) {
      ApiResponse.error(res, 404, ERROR_MESSAGES.WEDDING_NOT_FOUND);
      return;
    }

    const effective = await PlanResolutionService.getEffectivePlanForWedding(ownerId, weddingId);

    if (!effective.aiAssistantEnabled) {
      ApiResponse.error(res, 403, 'The AI Assistant is not available on your current plan.', {
        code: 'FEATURE_DISABLED',
        feature: 'aiAssistant',
        planKey: effective.planKey,
        upgradeRequired: true,
      });
      return;
    }

    next();
  } catch (error) {
    ApiResponse.error(res, 500, ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

/**
 * Gate wedding CREATION on the user's overall wedding-creation cap (Free =
 * 1; an active subscription raises this to its own configured value). No
 * wedding exists yet at this point, so unlike the checks above there's no
 * `checkWeddingAccess` to run first — this reads `req.user` directly.
 */
export const checkWeddingCreationLimit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      ApiResponse.error(res, 401, ERROR_MESSAGES.UNAUTHORIZED);
      return;
    }

    const { cap } = await PlanResolutionService.getWeddingCreationCap(userId);

    if (cap !== UNLIMITED) {
      const current = await Wedding.countDocuments({ createdBy: userId });

      if (current >= cap) {
        ApiResponse.error(res, 403, `You have reached your wedding limit (${cap}).`, {
          code: 'PLAN_LIMIT_EXCEEDED',
          resource: 'weddings',
          limit: cap,
          current,
          upgradeRequired: true,
        });
        return;
      }
    }

    next();
  } catch (error) {
    ApiResponse.error(res, 500, ERROR_MESSAGES.INTERNAL_ERROR);
  }
};
