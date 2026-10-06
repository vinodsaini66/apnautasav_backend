import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../utils/apiResponse';
import { ERROR_MESSAGES } from '../constants';
import { OrgPermission, effectiveOrgPermissions } from '../constants/org';
import { loadMembership } from '../services/org/org-access';

/**
 * Track C org routes (`/orgs/:orgId/...`). Resolves the caller's active
 * membership of `req.params.orgId` once and caches it on `req.orgMembership`.
 * Every org-owned query downstream must be scoped by that org's id (services
 * take it as their first argument) — never by an id from the request body.
 */
export const loadOrgMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      ApiResponse.error(res, 401, ERROR_MESSAGES.UNAUTHORIZED);
      return;
    }

    const membership = await loadMembership(req.params.orgId, userId);
    if (!membership) {
      // Same answer for "no such org" and "not your org", so org ids can't be probed.
      ApiResponse.error(res, 404, 'Organization not found');
      return;
    }

    req.orgMembership = membership;
    next();
  } catch (error) {
    ApiResponse.error(res, 500, ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

/** Requires every listed org permission. Run after loadOrgMember. */
export const requireOrgPermission = (...perms: OrgPermission[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const m = req.orgMembership;
    if (!m) {
      ApiResponse.error(res, 500, ERROR_MESSAGES.INTERNAL_ERROR);
      return;
    }

    const missing = perms.filter((p) => !m.permissions.has(p));
    if (missing.length === 0) {
      next();
      return;
    }

    // The member would normally have it — the org is just read-only right now.
    const normally = effectiveOrgPermissions(m.role, m.member.permissionOverrides);
    if (m.readOnly && missing.every((p) => normally.has(p))) {
      ApiResponse.error(res, 403, 'This organization is read-only until its plan is renewed.', {
        code: 'ORG_READ_ONLY',
        reason: m.readOnly,
      });
      return;
    }

    ApiResponse.error(res, 403, ERROR_MESSAGES.NO_PERMISSION);
  };
};
