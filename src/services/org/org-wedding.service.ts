import mongoose from 'mongoose';
import { Wedding, IWedding } from '../../models/wedding.model';
import { Collaborator } from '../../models/collaborator.model';
import { OrgMember } from '../../models/org/org-member.model';
import { Task } from '../../models/task.model';
import { WeddingEvent } from '../../models/event.model';
import { User } from '../../models/user.model';
import { computeWeddingStats } from '../wedding-stats.service';
import { ActivityService } from '../activity.service';
import { OrgMembership, loadMembership } from './org-access';
import { badRequest, forbidden, notFound, OrgError } from '../../utils/org';

const DAY = 24 * 60 * 60 * 1000;

/** An org wedding that still counts against the plan: not completed, not archived. */
export const ACTIVE_ORG_WEDDING = { archivedAt: null, status: { $ne: 'completed' } };

export interface AssigneeInput {
  userId: string;
  isLead?: boolean;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const countActiveWeddings = (orgId: unknown) => Wedding.countDocuments({ organizationId: orgId, ...ACTIVE_ORG_WEDDING });

const assertWeddingSlot = async (m: OrgMembership) => {
  const limit = m.org.limitsSnapshot.activeWeddings;
  if (limit < 0) return;
  const used = await countActiveWeddings(m.org._id);
  if (used >= limit) {
    throw new OrgError(403, `Your plan includes ${limit} active weddings. Archive a finished one or upgrade.`, {
      code: 'ORG_LIMIT',
      resource: 'activeWeddings',
      limit,
      used,
    });
  }
};

/** Every assignee must be an active member of this org; at most one lead. */
const normaliseAssignees = async (orgId: unknown, assignees: AssigneeInput[]) => {
  const unique = new Map<string, boolean>();
  for (const a of assignees) {
    if (!mongoose.isValidObjectId(a.userId)) throw badRequest('Invalid assignee');
    unique.set(a.userId, (unique.get(a.userId) ?? false) || !!a.isLead);
  }
  const ids = [...unique.keys()];
  const active = await OrgMember.countDocuments({ organizationId: orgId, userId: { $in: ids }, status: 'active' });
  if (active !== ids.length) throw badRequest('Assignees must be active members of your team');
  if ([...unique.values()].filter(Boolean).length > 1) throw badRequest('Only one person can lead a wedding');
  return ids.map((id) => ({ userId: new mongoose.Types.ObjectId(id), isLead: unique.get(id)! }));
};

export class OrgWeddingService {
  /**
   * Called by POST /weddings when the body carries `organizationId`: checks
   * the caller may create weddings for that org and that the plan has room.
   * Returns the org fields to stamp onto the new wedding.
   */
  static async prepareCreate(
    userId: string,
    orgId: string,
    input: { assignees?: AssigneeInput[]; clientContact?: { name?: string; phone?: string; email?: string } }
  ) {
    const m = await loadMembership(orgId, userId);
    if (!m) throw new OrgError(404, 'Organization not found');
    if (!m.permissions.has('weddings.create')) {
      if (m.readOnly) throw forbidden('This organization is read-only until its plan is renewed.', { code: 'ORG_READ_ONLY', reason: m.readOnly });
      throw forbidden();
    }
    await assertWeddingSlot(m);

    // Default: whoever created it leads it.
    const assignees = input.assignees?.length ? input.assignees : [{ userId, isLead: true }];
    return {
      organizationId: m.org._id,
      orgAssignees: await normaliseAssignees(m.org._id, assignees),
      clientContact: input.clientContact,
    };
  }

  /** The planner's portfolio: one card per client wedding, with live stats. */
  static async portfolio(
    m: OrgMembership,
    query: { status?: string; month?: string; assignee?: string; q?: string }
  ) {
    const filter: Record<string, any> = { organizationId: m.org._id };
    switch (query.status ?? 'active') {
      case 'active':
        Object.assign(filter, ACTIVE_ORG_WEDDING);
        break;
      case 'completed':
        Object.assign(filter, { archivedAt: null, status: 'completed' });
        break;
      case 'archived':
        filter.archivedAt = { $ne: null };
        break;
      case 'all':
        break;
      default:
        throw badRequest('status must be active, completed, archived or all');
    }

    if (query.month) {
      const match = /^(\d{4})-(\d{2})$/.exec(query.month);
      if (!match) throw badRequest('month must look like 2026-11');
      const start = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
      const end = new Date(Date.UTC(Number(match[1]), Number(match[2]), 1));
      filter.weddingDate = { $gte: start, $lt: end };
    }

    // Coordinators (no weddings.viewAll) only ever see what they're assigned to.
    const me = String(m.member.userId);
    if (!m.permissions.has('weddings.viewAll')) filter['orgAssignees.userId'] = m.member.userId;
    else if (query.assignee && mongoose.isValidObjectId(query.assignee)) filter['orgAssignees.userId'] = new mongoose.Types.ObjectId(query.assignee);

    if (query.q?.trim()) {
      const rx = new RegExp(escapeRegex(query.q.trim()), 'i');
      filter.$or = [{ name: rx }, { brideName: rx }, { groomName: rx }, { location: rx }, { 'clientContact.name': rx }];
    }

    const weddings = await Wedding.find(filter).sort({ weddingDate: 1 }).limit(200).lean();
    const weddingIds = weddings.map((w) => w._id);

    const assigneeIds = [...new Set(weddings.flatMap((w) => (w.orgAssignees ?? []).map((a) => String(a.userId))))];
    const [users, clientCounts] = await Promise.all([
      User.find({ _id: { $in: assigneeIds } }).select('fullName avatarUrl').lean(),
      Collaborator.aggregate([
        { $match: { weddingId: { $in: weddingIds }, invitationStatus: { $in: ['pending', 'accepted'] } } },
        { $group: { _id: { weddingId: '$weddingId', status: '$invitationStatus' }, count: { $sum: 1 } } },
      ]),
    ]);
    const userById = new Map(users.map((u) => [String(u._id), u]));
    const clients = new Map<string, { accepted: number; pending: number }>();
    for (const row of clientCounts as any[]) {
      const key = String(row._id.weddingId);
      const entry = clients.get(key) ?? { accepted: 0, pending: 0 };
      entry[row._id.status as 'accepted' | 'pending'] = row.count;
      clients.set(key, entry);
    }

    const showBudget = m.permissions.has('budget.view');
    const cards = await Promise.all(
      weddings.map(async (w) => {
        const stats = await computeWeddingStats(String(w._id), w.totalBudget || 0);
        return {
          _id: String(w._id),
          name: w.name,
          brideName: w.brideName,
          groomName: w.groomName,
          weddingDate: w.weddingDate,
          location: w.location,
          imageUrl: w.imageUrl,
          status: w.status,
          archivedAt: w.archivedAt ?? null,
          currency: w.currency,
          clientContact: w.clientContact ?? null,
          daysLeft: Math.ceil((new Date(w.weddingDate).getTime() - Date.now()) / DAY),
          assignees: (w.orgAssignees ?? []).map((a) => ({
            userId: String(a.userId),
            isLead: a.isLead,
            name: userById.get(String(a.userId))?.fullName ?? null,
            avatarUrl: userById.get(String(a.userId))?.avatarUrl ?? null,
          })),
          isMine: (w.orgAssignees ?? []).some((a) => String(a.userId) === me),
          clients: clients.get(String(w._id)) ?? { accepted: 0, pending: 0 },
          stats: {
            guests: stats.guests,
            tasks: stats.tasks,
            vendors: stats.vendors,
            planningProgress: stats.planningProgress,
            budget: showBudget ? stats.budget : null,
          },
        };
      })
    );
    return cards;
  }

  /** Agency-wide numbers for the top of the portfolio screen. */
  static async dashboard(m: OrgMembership) {
    const scope: Record<string, any> = { organizationId: m.org._id, ...ACTIVE_ORG_WEDDING };
    if (!m.permissions.has('weddings.viewAll')) scope['orgAssignees.userId'] = m.member.userId;

    const weddings = await Wedding.find(scope).select('name brideName groomName weddingDate').lean();
    const ids = weddings.map((w) => w._id);
    const nameById = new Map(weddings.map((w) => [String(w._id), w.name || `${w.brideName} & ${w.groomName}`]));

    const now = new Date();
    const in14 = new Date(now.getTime() + 14 * DAY);
    const in7 = new Date(now.getTime() + 7 * DAY);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const openTask = { weddingId: { $in: ids }, status: { $nin: ['completed', 'cancelled'] } };

    const [overdueCount, dueThisWeek, overdueTasks, upcomingEvents, activeWeddings, seatsUsed] = await Promise.all([
      Task.countDocuments({ ...openTask, dueDate: { $lt: now } }),
      Task.countDocuments({ ...openTask, dueDate: { $gte: now, $lt: in7 } }),
      Task.find({ ...openTask, dueDate: { $lt: now } })
        .sort({ dueDate: 1 })
        .limit(10)
        .select('title dueDate weddingId priority')
        .lean(),
      WeddingEvent.find({ weddingId: { $in: ids }, startDateTime: { $gte: now, $lt: in14 } })
        .sort({ startDateTime: 1 })
        .limit(20)
        .select('title eventType startDateTime weddingId')
        .lean(),
      countActiveWeddings(m.org._id),
      OrgMember.countDocuments({ organizationId: m.org._id, status: { $in: ['invited', 'active'] } }),
    ]);

    const upcomingWeddings = weddings
      .filter((w) => w.weddingDate >= now && w.weddingDate < in14)
      .map((w) => ({ weddingId: String(w._id), title: nameById.get(String(w._id)), date: w.weddingDate, kind: 'wedding' as const }));

    return {
      counts: {
        activeWeddings: weddings.length,
        weddingsThisMonth: weddings.filter((w) => w.weddingDate >= monthStart && w.weddingDate < monthEnd).length,
        overdueTasks: overdueCount,
        tasksDueThisWeek: dueThisWeek,
      },
      overdueTasks: overdueTasks.map((t) => ({
        _id: String(t._id),
        title: t.title,
        dueDate: t.dueDate,
        priority: t.priority,
        weddingId: String(t.weddingId),
        weddingName: nameById.get(String(t.weddingId)),
      })),
      upcoming: [
        ...upcomingWeddings,
        ...upcomingEvents.map((e) => ({
          weddingId: String(e.weddingId),
          title: `${e.title} · ${nameById.get(String(e.weddingId))}`,
          date: e.startDateTime,
          kind: 'event' as const,
        })),
      ].sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime()),
      usage: {
        activeWeddings: { used: activeWeddings, limit: m.org.limitsSnapshot.activeWeddings },
        seats: { used: seatsUsed, limit: m.org.limitsSnapshot.seats },
      },
    };
  }

  private static async findOrgWedding(m: OrgMembership, weddingId: string): Promise<IWedding> {
    if (!mongoose.isValidObjectId(weddingId)) throw notFound('Wedding');
    const wedding = await Wedding.findOne({ _id: weddingId, organizationId: m.org._id });
    if (!wedding) throw notFound('Wedding');
    return wedding;
  }

  static async setAssignees(m: OrgMembership, weddingId: string, assignees: AssigneeInput[]) {
    const wedding = await this.findOrgWedding(m, weddingId);
    wedding.orgAssignees = await normaliseAssignees(m.org._id, assignees);
    await wedding.save();

    await ActivityService.logActivity({
      weddingId: String(wedding._id),
      userId: String(m.member.userId),
      actionType: 'assigned',
      entityType: 'wedding',
      entityId: String(wedding._id),
      description: 'Updated the planning team for this wedding',
    });
    return { orgAssignees: wedding.orgAssignees };
  }

  static async setArchived(m: OrgMembership, weddingId: string, archived: boolean) {
    const wedding = await this.findOrgWedding(m, weddingId);
    if (!archived && wedding.archivedAt && wedding.status !== 'completed') await assertWeddingSlot(m);
    wedding.archivedAt = archived ? new Date() : null;
    await wedding.save();
    return { archivedAt: wedding.archivedAt };
  }

  /**
   * Hands a wedding over to the client family when the agency's engagement
   * ends: the chosen client becomes its owner and it leaves the org (staff
   * lose access; other family collaborators keep theirs). Owner-only.
   */
  static async transferToClient(m: OrgMembership, weddingId: string, clientUserId: string) {
    if (m.role !== 'owner') throw forbidden('Only the agency owner can hand a wedding over');
    const wedding = await this.findOrgWedding(m, weddingId);
    if (!mongoose.isValidObjectId(clientUserId)) throw badRequest('Choose a client to hand the wedding to');

    const collaborator = await Collaborator.findOne({ weddingId: wedding._id, userId: clientUserId, invitationStatus: 'accepted' });
    if (!collaborator) throw badRequest('The new owner must be a client who has joined this wedding');

    wedding.createdBy = collaborator.userId;
    wedding.organizationId = undefined;
    wedding.orgAssignees = undefined;
    wedding.archivedAt = undefined;
    await wedding.save();
    await collaborator.deleteOne();

    await ActivityService.logActivity({
      weddingId: String(wedding._id),
      userId: String(m.member.userId),
      actionType: 'updated',
      entityType: 'wedding',
      entityId: String(wedding._id),
      description: `${m.org.name} handed this wedding over to the family`,
    });
    return { transferred: true };
  }
}

/**
 * Staff on an agency wedding's planning team who are still active members —
 * they can be assigned tasks and are listed alongside the family's
 * collaborators. Empty for family weddings.
 */
export const assignableStaffIds = async (wedding?: Pick<IWedding, 'organizationId' | 'orgAssignees'> | null): Promise<Set<string>> => {
  if (!wedding?.organizationId || !wedding.orgAssignees?.length) return new Set();
  const active = await OrgMember.find({
    organizationId: wedding.organizationId,
    userId: { $in: wedding.orgAssignees.map((a) => a.userId) },
    status: 'active',
  })
    .select('userId')
    .lean();
  return new Set(active.map((m) => String(m.userId)));
};
