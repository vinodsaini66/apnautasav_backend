import { Request, Response, NextFunction } from 'express';
import { Task } from '../models/task.model';
import { ApiResponse } from '../utils/apiResponse';
import { ERROR_MESSAGES } from '../constants';
import { CollaboratorRole } from '../types';
import { WeddingPermission } from '../constants/permissions';
import { resolveWeddingAccess, hasPermission, internalFilter, WeddingAccess } from '../services/access.service';
import { installClientRedaction } from '../services/client-redaction';

/**
 * Resolves the caller's access to `req.params.weddingId` once per request and
 * caches it on `req.access`. Later middleware (requirePermission,
 * checkTaskAssigneeOrPermission) and controllers read the cache instead of
 * re-querying Wedding/Collaborator.
 */
const loadAccess = async (req: Request, res: Response): Promise<WeddingAccess | null> => {
  const { weddingId } = req.params;
  if (req.access && req.access.weddingId === weddingId) return req.access;

  const userId = req.user?.userId;
  if (!userId) {
    ApiResponse.error(res, 401, ERROR_MESSAGES.UNAUTHORIZED);
    return null;
  }

  const result = await resolveWeddingAccess(userId, weddingId);
  if (!result.ok) {
    if (result.status === 404) ApiResponse.error(res, 404, ERROR_MESSAGES.WEDDING_NOT_FOUND);
    else ApiResponse.error(res, 403, ERROR_MESSAGES.FORBIDDEN);
    return null;
  }

  req.access = result.access;
  req.weddingId = weddingId;

  // "Team only" is an agency concept: only its staff may set or clear it.
  // Dropped here, once, so no create/update handler can be fed it by a
  // family member or client.
  if (result.access.kind !== 'org' && req.body && typeof req.body === 'object' && 'isInternal' in req.body) {
    delete req.body.isInternal;
  }
  if (result.access.kind === 'client') installClientRedaction(res, result.access);
  return result.access;
};

export const checkWeddingAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (await loadAccess(req, res)) next();
  } catch (error) {
    ApiResponse.error(res, 500, ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

/** Requires every listed permission on the wedding in `req.params.weddingId`. */
export const requirePermission = (...perms: WeddingPermission[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const access = await loadAccess(req, res);
      if (!access) return;

      if (!hasPermission(access, ...perms)) {
        ApiResponse.error(res, 403, ERROR_MESSAGES.NO_PERMISSION);
        return;
      }

      next();
    } catch (error) {
      ApiResponse.error(res, 500, ERROR_MESSAGES.INTERNAL_ERROR);
    }
  };
};

const ROLE_RANK: Record<CollaboratorRole, number> = {
  [CollaboratorRole.VIEWER]: 1,
  [CollaboratorRole.EDITOR]: 2,
  [CollaboratorRole.ADMIN]: 3
};

/**
 * @deprecated Use `requirePermission(...)` — routes should say *what* they
 * need, not which collaborator role used to imply it. Kept so any route not
 * yet migrated keeps its old behaviour.
 */
export const checkPermission = (requiredRole: CollaboratorRole) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const access = await loadAccess(req, res);
      if (!access) return;

      if (ROLE_RANK[access.role] < ROLE_RANK[requiredRole]) {
        ApiResponse.error(res, 403, ERROR_MESSAGES.NO_PERMISSION);
        return;
      }

      next();
    } catch (error) {
      ApiResponse.error(res, 500, ERROR_MESSAGES.INTERNAL_ERROR);
    }
  };
};

/**
 * Platform-level admin check (as opposed to `requirePermission`, which is
 * scoped to a single wedding). Used for content that isn't tied to any one
 * wedding — e.g. promotional dashboard banners.
 */
export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (req.user?.role !== 'admin') {
    ApiResponse.error(res, 403, ERROR_MESSAGES.FORBIDDEN);
    return;
  }

  next();
};

// Like requirePermission, but also allows through a user who is the task's
// assignee, regardless of their permissions (e.g. a 'viewer' who was assigned
// the task can still update it). Loads the Task once and attaches it to
// req.task so the controller doesn't have to re-fetch it.
export const checkTaskAssigneeOrPermission = (...perms: WeddingPermission[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const access = await loadAccess(req, res);
      if (!access) return;

      const { weddingId, taskId } = req.params;
      const task = await Task.findOne({ _id: taskId, weddingId, ...internalFilter(access) });

      if (!task) {
        ApiResponse.error(res, 404, 'Task not found');
        return;
      }

      req.task = task;

      const userId = req.user!.userId;
      const isAssignee = task.assignedTo?.some((id: any) => id.toString() === userId);

      if (isAssignee || hasPermission(access, ...perms)) {
        next();
        return;
      }

      ApiResponse.error(res, 403, ERROR_MESSAGES.NO_PERMISSION);
    } catch (error) {
      ApiResponse.error(res, 500, ERROR_MESSAGES.INTERNAL_ERROR);
    }
  };
};
