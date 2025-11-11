import { Request, Response } from 'express';
import { Collaborator } from '../models/collaborator.model';
import { User } from '../models/user.model';
import { Wedding } from '../models/wedding.model';
import { ApiResponse } from '../utils/apiResponse';
import { ActivityService } from '../services/activity.service';
import { NotificationService } from '../services/notification.service';
import { generateInvitationCode } from '../utils/generateCode';
import logger from '../utils/logger';

export class CollaboratorController {
  static async inviteCollaborator(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const userId = req.user?.userId;
      const { phoneNumber, role } = req.body;

      const user = await User.findOne({ phoneNumber });

      if (!user) {
        ApiResponse.error(res, 404, 'User not found with this phone number');
        return;
      }

      const existingCollaborator = await Collaborator.findOne({
        weddingId,
        userId: user._id
      });

      if (existingCollaborator) {
        ApiResponse.error(res, 400, 'User is already a collaborator');
        return;
      }

      const invitationCode = generateInvitationCode();

      const collaborator = await Collaborator.create({
        weddingId,
        userId: user._id,
        role: role || 'editor',
        invitedBy: userId,
        invitationStatus: 'pending',
        invitationCode,
        permissions: {
          canEdit: role === 'editor' || role === 'admin',
          canDelete: role === 'admin',
          canInvite: role === 'admin',
          canManageMembers: role === 'admin'
        }
      });

      await NotificationService.notifyMemberInvitation(
        String(user._id),
        userId!,
        weddingId
      );

      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'created',
        entityType: 'collaborator',
        description: `Invited ${user.fullName} to collaborate`
      });

      ApiResponse.success(res, 201, {
        message: 'Collaborator invited successfully',
        data: collaborator
      });
    } catch (error: any) {
      logger.error('Invite collaborator error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to invite collaborator');
    }
  }

  static async getCollaborators(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;

      const collaborators = await Collaborator.find({ weddingId })
        .populate('userId', 'fullName email phoneNumber')
        .populate('invitedBy', 'fullName')
        .sort({ joinedAt: -1 })
        .lean();

      const wedding = await Wedding.findById(weddingId)
        .populate('createdBy', 'fullName email phoneNumber')
        .lean();

      ApiResponse.success(res, 200, {
        data: {
          owner: wedding?.createdBy,
          collaborators
        }
      });
    } catch (error: any) {
      logger.error('Get collaborators error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch collaborators');
    }
  }

  static async updateCollaborator(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, collaboratorId } = req.params;
      const userId = req.user?.userId;
      const { role, permissions } = req.body;

      const updateData: any = {};
      if (role) updateData.role = role;
      if (permissions) updateData.permissions = permissions;

      const collaborator = await Collaborator.findOneAndUpdate(
        { _id: collaboratorId, weddingId },
        { $set: updateData },
        { new: true }
      ).populate('userId', 'fullName');

      if (!collaborator) {
        ApiResponse.error(res, 404, 'Collaborator not found');
        return;
      }

      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'updated',
        entityType: 'collaborator',
        description: `Updated collaborator role/permissions`
      });

      ApiResponse.success(res, 200, {
        message: 'Collaborator updated successfully',
        data: collaborator
      });
    } catch (error: any) {
      logger.error('Update collaborator error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to update collaborator');
    }
  }

  static async removeCollaborator(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, collaboratorId } = req.params;
      const userId = req.user?.userId;

      const collaborator = await Collaborator.findOneAndDelete({
        _id: collaboratorId,
        weddingId
      });

      if (!collaborator) {
        ApiResponse.error(res, 404, 'Collaborator not found');
        return;
      }

      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'deleted',
        entityType: 'collaborator',
        description: 'Removed a collaborator'
      });

      ApiResponse.success(res, 200, {
        message: 'Collaborator removed successfully'
      });
    } catch (error: any) {
      logger.error('Remove collaborator error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to remove collaborator');
    }
  }
}