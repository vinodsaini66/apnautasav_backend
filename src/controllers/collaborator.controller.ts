import { Request, Response } from 'express';
import { Collaborator } from '../models/collaborator.model';
import { User } from '../models/user.model';
// import { Wedding } from '../models/wedding.model';
import { ApiResponse } from '../utils/apiResponse';
import { ActivityService } from '../services/activity.service';
import { NotificationService } from '../services/notification.service';
import { generateInvitationCode } from '../utils/generateCode';
import logger from '../utils/logger';
import collaborationInvitation from '../models/collaborationInvitation';
import { sendCollaborationInviteEmail } from '../helpers/function';
import { OrgMember } from '../models/org/org-member.model';
import { assignableStaffIds } from '../services/org/org-wedding.service';

const planningTeamRows = async (req: Request) => {
  const wedding = req.access?.wedding;
  const staffIds = await assignableStaffIds(wedding);
  if (!wedding || staffIds.size === 0) return [];
  const [users, members] = await Promise.all([
    User.find({ _id: { $in: [...staffIds] } }).select('fullName email phoneNumber').lean(),
    OrgMember.find({ organizationId: wedding.organizationId, userId: { $in: [...staffIds] } }).select('userId role').lean(),
  ]);
  const roleOf = new Map(members.map((m) => [String(m.userId), m.role]));
  const leadId = String(wedding.orgAssignees?.find((a) => a.isLead)?.userId ?? '');
  return users.map((u) => ({
    _id: `staff-${u._id}`,
    weddingId: wedding._id,
    userId: u,
    role: 'admin',
    invitationStatus: 'accepted',
    isStaff: true,
    staffRole: roleOf.get(String(u._id)),
    isLead: String(u._id) === leadId,
  }));
};

export class CollaboratorController {

  static async inviteCollaborator(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const userId = req.user?.userId;

      const { role, name } = req.body;
      const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

      if (!email) {
        ApiResponse.error(res, 400, 'Email is required');
        return;
      }

      const user = await User.findOne({ email });

      if (!user) {
        const invitationCode = generateInvitationCode();

        const invitation = await collaborationInvitation.create({
          email,
          weddingId,
          name,
          role: role || 'editor',
          invitedBy: userId,
          invitationCode,
          invitationStatus: 'pending',
        });

        const inviter = await User.findById(userId).select('fullName').lean();
        void sendCollaborationInviteEmail(email, {
          inviterName: inviter?.fullName,
          weddingName: req.access?.wedding.name,
        });

        ApiResponse.success(res, 200, {
          message: 'User not registered. Invitation sent by email.',
          data: invitation,
        });
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
        name,
        userId: user._id,
        role: role || 'editor',
        invitedBy: userId,
        invitationStatus: 'pending',
        invitationCode
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
      const { invitationStatus } = req.query;
      const query: any = { weddingId };
      if (invitationStatus) {
        query.invitationStatus = invitationStatus;
      }

      const collaborators = await Collaborator.find({ ...query })
        .populate('userId', 'fullName email phoneNumber')
        .populate('invitedBy', 'fullName')
        .sort({ joinedAt: -1 })
        .lean();

      // const wedding = await Wedding.findById(weddingId)
      //   .populate('createdBy', 'fullName email phoneNumber')
      //   .lean();

      // Agency weddings (Track C): list the planning team too, flagged
      // `isStaff` so screens show them read-only (staff are managed from the
      // agency's Team page, not per wedding).
      const staff = !invitationStatus || invitationStatus === 'accepted' ? await planningTeamRows(req) : [];

      ApiResponse.success(res, 200, {
        data: [...staff, ...collaborators],
        // owner: wedding?.createdBy
        // {
        //   owner: wedding?.createdBy,
        //   collaborators
        // }
      });
    } catch (error: any) {
      logger.error('Get collaborators error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch collaborators');
    }
  }

  static async getInviteCollaborators(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const { status } = req.query;
      const query: any = { weddingId, status: 'pending' };
      if (status) {
        query.status = status;
      }

      const collaborators = await collaborationInvitation.find({ ...query })
        // .populate('userId', 'fullName email phoneNumber')
        .populate('invitedBy', 'fullName')
        .sort({ joinedAt: -1 })
        .lean();

      ApiResponse.success(res, 200, {
        data: collaborators,
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
      const { role } = req.body;

      const updateData: any = {};
      if (role) updateData.role = role;

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
        description: `Updated collaborator role`
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