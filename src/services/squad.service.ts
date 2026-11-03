import mongoose from 'mongoose';
import { Squad } from '../models/squad.model';
import { Task } from '../models/task.model';
import { User } from '../models/user.model';
import { Wedding } from '../models/wedding.model';
import { resolveWeddingAccess, internalFilter, WeddingAccess } from './access.service';

export interface SquadTaskStats {
  total: number;
  completed: number;
  open: number;
  /** Open tasks nobody has picked up yet — the "Main karunga" pool. */
  unclaimed: number;
  overdue: number;
  completedThisWeek: number;
}

const EMPTY_STATS: SquadTaskStats = { total: 0, completed: 0, open: 0, unclaimed: 0, overdue: 0, completedThisWeek: 0 };
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const toObjectId = (id: string) => new mongoose.Types.ObjectId(id);

export class SquadService {
  /** Only the ids that can actually open this wedding (owner, accepted collaborator, staff, client). */
  static async withWeddingAccess(weddingId: string, userIds: string[]): Promise<string[]> {
    const unique = [...new Set(userIds.map(String))];
    const checks = await Promise.all(unique.map((id) => resolveWeddingAccess(id, weddingId).then((r) => (r.ok ? id : null))));
    return checks.filter((id): id is string => !!id);
  }

  /**
   * Someone left the wedding: drop them from every squad (and captaincy),
   * and hand their unfinished squad tasks back to the squad's open pool.
   */
  static async removeMember(weddingId: string, userId: string): Promise<void> {
    const uid = toObjectId(userId);
    await Promise.all([
      Squad.updateMany({ weddingId, memberIds: uid }, { $pull: { memberIds: uid } }),
      Squad.updateMany({ weddingId, captainId: uid }, { $set: { captainId: null } }),
      Task.updateMany(
        { weddingId, squadId: { $ne: null }, assignedTo: uid, status: { $nin: ['completed', 'cancelled'] } },
        { $pull: { assignedTo: uid } }
      )
    ]);
  }

  /**
   * Per-squad task numbers, keyed by squad id. Respects the client "team
   * only" filter; `excludeInternal` hides team-only tasks regardless of who's
   * asking (for reminders that may reach a client family).
   */
  static async taskStats(weddingId: string, access?: WeddingAccess, excludeInternal = false): Promise<Record<string, SquadTaskStats>> {
    const hidden = excludeInternal ? { isInternal: { $ne: true } } : internalFilter(access);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - WEEK_MS);
    const rows = await Task.aggregate<{ _id: mongoose.Types.ObjectId } & SquadTaskStats>([
      { $match: { weddingId: toObjectId(weddingId), squadId: { $ne: null }, status: { $ne: 'cancelled' }, ...hidden } },
      {
        $group: {
          _id: '$squadId',
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          open: { $sum: { $cond: [{ $ne: ['$status', 'completed'] }, 1, 0] } },
          unclaimed: {
            $sum: {
              $cond: [{ $and: [{ $ne: ['$status', 'completed'] }, { $eq: [{ $size: { $ifNull: ['$assignedTo', []] } }, 0] }] }, 1, 0]
            }
          },
          overdue: {
            $sum: {
              $cond: [{ $and: [{ $ne: ['$status', 'completed'] }, { $gt: ['$dueDate', null] }, { $lt: ['$dueDate', now] }] }, 1, 0]
            }
          },
          completedThisWeek: {
            $sum: { $cond: [{ $and: [{ $eq: ['$status', 'completed'] }, { $gte: ['$completedAt', weekAgo] }] }, 1, 0] }
          }
        }
      }
    ]);
    const out: Record<string, SquadTaskStats> = {};
    for (const { _id, ...stats } of rows) out[String(_id)] = stats;
    return out;
  }

  static statsFor(stats: Record<string, SquadTaskStats>, squadId: string): SquadTaskStats {
    return stats[squadId] ?? EMPTY_STATS;
  }

  /**
   * "Shaadi Samachar" — the week in one card: how each squad moved, who
   * ticked off the most, what's due next. Built from real task data only.
   */
  static async weeklyDigest(weddingId: string, access?: WeddingAccess) {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - WEEK_MS);
    const weekAhead = new Date(now.getTime() + WEEK_MS);
    const hidden = internalFilter(access);

    const [wedding, squads, stats, heroRows, upcoming, completedThisWeek] = await Promise.all([
      Wedding.findById(weddingId).select('name brideName groomName weddingDate').lean(),
      Squad.find({ weddingId }).sort({ order: 1, createdAt: 1 }).select('name emoji color').lean(),
      SquadService.taskStats(weddingId, access),
      Task.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
        { $match: { weddingId: toObjectId(weddingId), status: 'completed', completedAt: { $gte: weekAgo }, completedBy: { $ne: null }, ...hidden } },
        { $group: { _id: '$completedBy', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 }
      ]),
      Task.find({ weddingId, status: { $nin: ['completed', 'cancelled'] }, dueDate: { $gte: now, $lte: weekAhead }, ...hidden })
        .select('title dueDate squadId')
        .sort({ dueDate: 1 })
        .limit(5)
        .lean(),
      Task.countDocuments({ weddingId, status: 'completed', completedAt: { $gte: weekAgo }, ...hidden })
    ]);

    let hero: { name: string; count: number } | null = null;
    if (heroRows[0]) {
      const user = await User.findById(heroRows[0]._id).select('fullName').lean();
      if (user) hero = { name: user.fullName || 'Someone', count: heroRows[0].count };
    }

    const squadRows = squads.map((s) => {
      const st = SquadService.statsFor(stats, String(s._id));
      return {
        _id: String(s._id),
        name: s.name,
        emoji: s.emoji,
        color: s.color,
        completedThisWeek: st.completedThisWeek,
        progress: st.total ? Math.round((st.completed / st.total) * 100) : 0,
        open: st.open
      };
    });

    const daysToGo = wedding?.weddingDate
      ? Math.max(0, Math.ceil((new Date(wedding.weddingDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
      : null;

    return {
      weddingName: wedding?.name ?? '',
      daysToGo,
      completedThisWeek,
      hero,
      squads: squadRows,
      upcoming: upcoming.map((t) => ({
        _id: String(t._id),
        title: t.title,
        dueDate: t.dueDate,
        squadId: t.squadId ? String(t.squadId) : null
      }))
    };
  }
}
