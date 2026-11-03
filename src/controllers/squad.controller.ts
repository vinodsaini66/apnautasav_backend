import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Squad, ISquad } from '../models/squad.model';
import { Task } from '../models/task.model';
import { ApiResponse } from '../utils/apiResponse';
import { ActivityService } from '../services/activity.service';
import { SquadService } from '../services/squad.service';
import { hasPermission, internalFilter } from '../services/access.service';
import { getSocketServer } from '../config/socket';
import { DEFAULT_SQUADS, MAX_SQUADS_PER_WEDDING } from '../constants/squads';
import logger from '../utils/logger';

const MEMBER_FIELDS = 'fullName email';

/** Tell everyone on the wedding to refetch squads (best effort). */
const broadcast = (weddingId: string) => {
  try {
    getSocketServer().emitToWedding(weddingId, 'squads:updated', { timestamp: new Date() });
  } catch (error) {
    logger.warn('squads:updated broadcast failed:', error);
  }
};

const isAdmin = (req: Request) => !!req.access && hasPermission(req.access, 'collaborators.manage');
const isCaptain = (squad: ISquad, userId: string) => !!squad.captainId && String(squad.captainId) === userId;

const findSquad = (req: Request) =>
  mongoose.isValidObjectId(req.params.squadId) ? Squad.findOne({ _id: req.params.squadId, weddingId: req.params.weddingId }) : null;

/**
 * Family squads (Swagat Team, Prabandh Team, ...) — see models/squad.model.ts.
 * Admins (collaborators.manage) set squads up and edit any of them; a
 * squad's captain may rename it and manage its members; anyone on the
 * wedding may join or leave a squad and pick up its open tasks.
 */
export class SquadController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const userId = req.user!.userId;
      const [squads, stats] = await Promise.all([
        Squad.find({ weddingId })
          .sort({ order: 1, createdAt: 1 })
          .populate('memberIds', MEMBER_FIELDS)
          .populate('captainId', MEMBER_FIELDS)
          .lean(),
        SquadService.taskStats(weddingId, req.access)
      ]);

      ApiResponse.success(res, 200, {
        data: squads.map(({ memberIds, captainId, lastNudgedAt, ...squad }) => {
          const members = (memberIds as unknown as { _id: mongoose.Types.ObjectId; fullName?: string }[]).filter(Boolean);
          return {
            ...squad,
            captain: captainId ?? null,
            members,
            isMember: members.some((m) => String(m._id) === userId),
            stats: SquadService.statsFor(stats, String(squad._id))
          };
        })
      });
    } catch (error: any) {
      logger.error('List squads error:', error);
      ApiResponse.error(res, 500, 'Failed to fetch squads');
    }
  }

  /** POST /squads/setup — create several squads at once (the four defaults, edited or not). */
  static async setup(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const userId = req.user!.userId;
      const existing = await Squad.countDocuments({ weddingId });
      const incoming: { name: string; emoji?: string; color?: string; areas?: string[] }[] = req.body.squads;

      if (existing + incoming.length > MAX_SQUADS_PER_WEDDING) {
        ApiResponse.error(res, 400, `A wedding can have up to ${MAX_SQUADS_PER_WEDDING} squads`);
        return;
      }

      const created = await Squad.insertMany(
        incoming.map((s, i) => {
          const preset = DEFAULT_SQUADS.find((d) => d.name === s.name);
          return {
            weddingId,
            name: s.name,
            emoji: s.emoji ?? preset?.emoji ?? '✨',
            color: s.color ?? preset?.color ?? '#9e2b46',
            areas: s.areas ?? preset?.areas ?? [],
            order: existing + i,
            createdBy: userId
          };
        })
      );

      await ActivityService.logActivity({
        weddingId,
        userId,
        actionType: 'created',
        entityType: 'wedding',
        description: `Set up ${created.length} family squads`
      });
      broadcast(weddingId);

      ApiResponse.success(res, 201, { message: 'Squads created', data: created });
    } catch (error: any) {
      logger.error('Setup squads error:', error);
      ApiResponse.error(res, 500, 'Failed to create squads');
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const count = await Squad.countDocuments({ weddingId });
      if (count >= MAX_SQUADS_PER_WEDDING) {
        ApiResponse.error(res, 400, `A wedding can have up to ${MAX_SQUADS_PER_WEDDING} squads`);
        return;
      }

      const squad = await Squad.create({ ...req.body, weddingId, order: count, createdBy: req.user!.userId });
      broadcast(weddingId);
      ApiResponse.success(res, 201, { message: 'Squad created', data: squad });
    } catch (error: any) {
      logger.error('Create squad error:', error);
      ApiResponse.error(res, 500, 'Failed to create squad');
    }
  }

  /**
   * PATCH /squads/:squadId — admins may change anything; the captain may
   * rename it and manage its members, but not its areas or captaincy.
   */
  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const userId = req.user!.userId;
      const squad = await findSquad(req);
      if (!squad) {
        ApiResponse.error(res, 404, 'Squad not found');
        return;
      }

      const admin = isAdmin(req);
      if (!admin && !isCaptain(squad, userId)) {
        ApiResponse.error(res, 403, 'Only an admin or this squad’s captain can change it');
        return;
      }

      const { name, emoji, color, areas, captainId, memberIds } = req.body;
      if (!admin && (areas !== undefined || captainId !== undefined || color !== undefined)) {
        ApiResponse.error(res, 403, 'Only an admin can change a squad’s areas, colour or captain');
        return;
      }

      if (name !== undefined) squad.name = name;
      if (emoji !== undefined) squad.emoji = emoji;
      if (color !== undefined) squad.color = color;
      if (areas !== undefined) squad.areas = areas;

      if (memberIds !== undefined) {
        // Only people who can actually open this wedding.
        const allowed = await SquadService.withWeddingAccess(weddingId, memberIds);
        const removed = squad.memberIds.map(String).filter((id) => !allowed.includes(id));
        squad.memberIds = allowed.map((id) => new mongoose.Types.ObjectId(id));
        if (squad.captainId && removed.includes(String(squad.captainId))) squad.captainId = null;
      }

      if (captainId !== undefined) {
        if (captainId === null) {
          squad.captainId = null;
        } else {
          const [ok] = await SquadService.withWeddingAccess(weddingId, [captainId]);
          if (!ok) {
            ApiResponse.error(res, 400, 'The captain must be someone on this wedding');
            return;
          }
          squad.captainId = new mongoose.Types.ObjectId(captainId);
          // A captain is always in their own squad.
          if (!squad.memberIds.some((m) => String(m) === captainId)) squad.memberIds.push(squad.captainId);
        }
      }

      await squad.save();
      broadcast(weddingId);
      ApiResponse.success(res, 200, { message: 'Squad updated', data: squad });
    } catch (error: any) {
      logger.error('Update squad error:', error);
      ApiResponse.error(res, 500, 'Failed to update squad');
    }
  }

  /** DELETE /squads/:squadId — the squad goes; its tasks stay, just without a squad. */
  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const squad = await findSquad(req);
      if (!squad) {
        ApiResponse.error(res, 404, 'Squad not found');
        return;
      }

      await Promise.all([squad.deleteOne(), Task.updateMany({ weddingId, squadId: squad._id }, { $set: { squadId: null } })]);
      broadcast(weddingId);
      ApiResponse.success(res, 200, { message: 'Squad deleted' });
    } catch (error: any) {
      logger.error('Delete squad error:', error);
      ApiResponse.error(res, 500, 'Failed to delete squad');
    }
  }

  static async join(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const squad = await findSquad(req);
      if (!squad) {
        ApiResponse.error(res, 404, 'Squad not found');
        return;
      }

      await Squad.updateOne({ _id: squad._id }, { $addToSet: { memberIds: new mongoose.Types.ObjectId(req.user!.userId) } });
      broadcast(weddingId);
      ApiResponse.success(res, 200, { message: `Welcome to ${squad.name}!` });
    } catch (error: any) {
      logger.error('Join squad error:', error);
      ApiResponse.error(res, 500, 'Failed to join squad');
    }
  }

  /** Leaving keeps the tasks you already picked up — they still belong to the squad. */
  static async leave(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const userId = req.user!.userId;
      const squad = await findSquad(req);
      if (!squad) {
        ApiResponse.error(res, 404, 'Squad not found');
        return;
      }

      const uid = new mongoose.Types.ObjectId(userId);
      await Squad.updateOne(
        { _id: squad._id },
        { $pull: { memberIds: uid }, ...(isCaptain(squad, userId) ? { $set: { captainId: null } } : {}) }
      );
      broadcast(weddingId);
      ApiResponse.success(res, 200, { message: `Left ${squad.name}` });
    } catch (error: any) {
      logger.error('Leave squad error:', error);
      ApiResponse.error(res, 500, 'Failed to leave squad');
    }
  }

  /**
   * POST /tasks/:taskId/claim — "Main karunga": a squad member puts their
   * own name on one of the squad's tasks. Joins the existing assignees
   * rather than replacing them.
   */
  static async claimTask(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, taskId } = req.params;
      const userId = req.user!.userId;

      const task = mongoose.isValidObjectId(taskId)
        ? await Task.findOne({ _id: taskId, weddingId, ...internalFilter(req.access) })
        : null;
      if (!task) {
        ApiResponse.error(res, 404, 'Task not found');
        return;
      }
      if (task.status === 'completed' || task.status === 'cancelled') {
        ApiResponse.error(res, 400, 'This task is already closed');
        return;
      }
      if (!task.squadId) {
        ApiResponse.error(res, 400, 'Only squad tasks can be picked up this way');
        return;
      }

      const inSquad = await Squad.exists({ _id: task.squadId, memberIds: new mongoose.Types.ObjectId(userId) });
      if (!inSquad) {
        ApiResponse.error(res, 403, 'Join this squad first to pick up its tasks');
        return;
      }

      const updated = await Task.findByIdAndUpdate(
        task._id,
        { $addToSet: { assignedTo: new mongoose.Types.ObjectId(userId) }, $set: { assignedAt: new Date() } },
        { new: true }
      )
        .populate('assignedTo', 'fullName email')
        .populate('dependsOn', 'title status');

      await ActivityService.logActivity({
        weddingId,
        userId,
        actionType: 'assigned',
        entityType: 'task',
        entityId: String(task._id),
        entityName: task.title,
        description: `Picked up task: ${task.title}`
      });
      try {
        getSocketServer().emitToWedding(weddingId, 'task:updated', { taskId: task._id, updatedBy: userId, timestamp: new Date() });
      } catch (error) {
        logger.warn('task:updated broadcast failed:', error);
      }
      broadcast(weddingId);

      ApiResponse.success(res, 200, { message: 'Task picked up', data: updated });
    } catch (error: any) {
      logger.error('Claim task error:', error);
      ApiResponse.error(res, 500, 'Failed to pick up task');
    }
  }

  static async digest(req: Request, res: Response): Promise<void> {
    try {
      const data = await SquadService.weeklyDigest(req.params.weddingId, req.access);
      ApiResponse.success(res, 200, { data });
    } catch (error: any) {
      logger.error('Squad digest error:', error);
      ApiResponse.error(res, 500, 'Failed to build the weekly digest');
    }
  }
}
