import mongoose from 'mongoose';
import { TaskTemplate, ITaskTemplate, ITaskTemplateItem } from '../../models/task-template.model';
import { OrgMember } from '../../models/org/org-member.model';
import { Organization } from '../../models/org/organization.model';
import { Wedding, IWedding } from '../../models/wedding.model';
import { Task } from '../../models/task.model';
import { WeddingEvent } from '../../models/event.model';
import { OrgPermission } from '../../constants/org';
import { membershipPermissions, orgReadOnlyReason, OrgMembership } from './org-access';
import { badRequest, notFound } from '../../utils/org';

const DAY = 24 * 60 * 60 * 1000;

export interface TemplateOrgAccess {
  name: string;
  permissions: Set<OrgPermission>;
}

/**
 * The agencies whose shared templates this person can use: active
 * memberships of non-suspended agencies, with their effective permissions.
 */
export const templateOrgsFor = async (userId: string): Promise<Map<string, TemplateOrgAccess>> => {
  const members = await OrgMember.find({ userId, status: 'active' }).lean();
  if (!members.length) return new Map();
  const orgs = await Organization.find({ _id: { $in: members.map((m) => m.organizationId) }, status: 'active' });
  const byId = new Map(orgs.map((o) => [String(o._id), o]));
  const out = new Map<string, TemplateOrgAccess>();
  for (const m of members) {
    const org = byId.get(String(m.organizationId));
    if (!org) continue;
    const perms = membershipPermissions(m, orgReadOnlyReason(org));
    if (perms.has('templates.apply') || perms.has('templates.manage')) out.set(String(org._id), { name: org.name, permissions: perms });
  }
  return out;
};

/** Mongo filter for the templates a person may see and apply. */
export const visibleTemplateFilter = (userId: string, orgs: Map<string, TemplateOrgAccess>) => ({
  $or: [
    { isSystemTemplate: true },
    { createdBy: userId, organizationId: null },
    ...(orgs.size ? [{ organizationId: { $in: [...orgs.keys()].map((id) => new mongoose.Types.ObjectId(id)) } }] : []),
  ],
});

/** Personal templates: their creator. Agency templates: staff with templates.manage. System: nobody. */
export const canEditTemplate = (template: Pick<ITaskTemplate, 'isSystemTemplate' | 'createdBy' | 'organizationId'>, userId: string, orgs: Map<string, TemplateOrgAccess>) => {
  if (template.isSystemTemplate) return false;
  if (template.organizationId) return !!orgs.get(String(template.organizationId))?.permissions.has('templates.manage');
  return String(template.createdBy) === userId;
};

/**
 * Who an agency template item's task goes to on a client wedding: its lead
 * planner, or everyone on its planning team holding that agency role.
 * Family weddings get nobody (the item just isn't assigned).
 */
export const resolveTemplateAssignees = async (wedding: Pick<IWedding, 'organizationId' | 'orgAssignees'>) => {
  const byRole = new Map<'lead' | 'manager' | 'coordinator', string[]>();
  if (!wedding.organizationId || !wedding.orgAssignees?.length) return byRole;
  const ids = wedding.orgAssignees.map((a) => a.userId);
  const members = await OrgMember.find({ organizationId: wedding.organizationId, userId: { $in: ids }, status: 'active' })
    .select('userId role')
    .lean();
  const active = new Set(members.map((m) => String(m.userId)));
  const lead = wedding.orgAssignees.find((a) => a.isLead && active.has(String(a.userId)));
  if (lead) byRole.set('lead', [String(lead.userId)]);
  for (const role of ['manager', 'coordinator'] as const) {
    byRole.set(role, members.filter((m) => m.role === role).map((m) => String(m.userId)));
  }
  return byRole;
};

export class OrgTemplateService {
  /**
   * "Save this wedding as a template": its open and finished tasks become
   * template items, each due the same number of days from the wedding date
   * as it is on this wedding (tasks without a due date land on the wedding
   * day). Cancelled tasks are left out.
   */
  static async fromWedding(m: OrgMembership, weddingId: string, input: { name: string; description?: string }) {
    if (!mongoose.isValidObjectId(weddingId)) throw notFound('Wedding');
    const wedding = await Wedding.findOne({ _id: weddingId, organizationId: m.org._id }).select('weddingDate').lean();
    if (!wedding) throw notFound('Wedding');

    const [tasks, events] = await Promise.all([
      Task.find({ weddingId, status: { $ne: 'cancelled' } }).sort({ dueDate: 1 }).limit(300).lean(),
      WeddingEvent.find({ weddingId }).select('eventType').lean(),
    ]);
    if (!tasks.length) throw badRequest('This wedding has no tasks to save yet');
    const typeByEvent = new Map(events.map((e) => [String(e._id), e.eventType]));
    const weddingDay = new Date(wedding.weddingDate).getTime();

    const items: ITaskTemplateItem[] = tasks.map((t) => ({
      title: t.title,
      description: t.description,
      category: t.category,
      priority: t.priority,
      dueOffsetDays: t.dueDate ? Math.round((new Date(t.dueDate).getTime() - weddingDay) / DAY) : 0,
      eventType: t.eventId ? typeByEvent.get(String(t.eventId)) : undefined,
      isInternal: !!t.isInternal,
    }));
    // Earliest first, as a checklist reads (undated tasks sit on the wedding day).
    items.sort((a, b) => a.dueOffsetDays - b.dueOffsetDays);

    return TaskTemplate.create({
      name: input.name,
      description: input.description,
      items,
      organizationId: m.org._id,
      createdBy: m.member.userId,
      isSystemTemplate: false,
    });
  }
}
