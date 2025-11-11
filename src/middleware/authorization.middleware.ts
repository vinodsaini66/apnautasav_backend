import { Request, Response, NextFunction } from 'express';
import { Wedding } from '../models/wedding.model';
import { Collaborator } from '../models/collaborator.model';
import { ApiResponse } from '../utils/apiResponse';
import { ERROR_MESSAGES } from '../constants';
import { CollaboratorRole } from '../types';

export const checkWeddingAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { weddingId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      ApiResponse.error(res, 401, ERROR_MESSAGES.UNAUTHORIZED);
      return;
    }

    // Check if user is creator
    const wedding = await Wedding.findById(weddingId);
    
    if (!wedding) {
      ApiResponse.error(res, 404, ERROR_MESSAGES.WEDDING_NOT_FOUND);
      return;
    }

    if (wedding.createdBy.toString() === userId) {
      req.weddingId = weddingId;
      next();
      return;
    }

    // Check if user is collaborator
    const collaborator = await Collaborator.findOne({
      weddingId,
      userId,
      invitationStatus: 'accepted'
    });

    if (!collaborator) {
      ApiResponse.error(res, 403, ERROR_MESSAGES.FORBIDDEN);
      return;
    }

    req.weddingId = weddingId;
    next();
  } catch (error) {
    ApiResponse.error(res, 500, ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

export const checkPermission = (requiredRole: CollaboratorRole) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { weddingId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        ApiResponse.error(res, 401, ERROR_MESSAGES.UNAUTHORIZED);
        return;
      }

      const wedding = await Wedding.findById(weddingId);
      
      if (!wedding) {
        ApiResponse.error(res, 404, ERROR_MESSAGES.WEDDING_NOT_FOUND);
        return;
      }

      // Creator has all permissions
      if (wedding.createdBy.toString() === userId) {
        next();
        return;
      }

      const collaborator = await Collaborator.findOne({
        weddingId,
        userId,
        invitationStatus: 'accepted'
      });

      if (!collaborator) {
        ApiResponse.error(res, 403, ERROR_MESSAGES.NO_PERMISSION);
        return;
      }

      const roleHierarchy = {
        [CollaboratorRole.VIEWER]: 1,
        [CollaboratorRole.EDITOR]: 2,
        [CollaboratorRole.ADMIN]: 3
      };

      if (roleHierarchy[collaborator.role] < roleHierarchy[requiredRole]) {
        ApiResponse.error(res, 403, ERROR_MESSAGES.NO_PERMISSION);
        return;
      }

      next();
    } catch (error) {
      ApiResponse.error(res, 500, ERROR_MESSAGES.INTERNAL_ERROR);
    }
  };
};