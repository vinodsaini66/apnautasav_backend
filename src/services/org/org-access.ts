import mongoose from 'mongoose';
import { Organization, IOrganization } from '../../models/org/organization.model';
import { OrgMember, IOrgMember } from '../../models/org/org-member.model';
import {
  ORG_GRACE_DAYS,
  ORG_READ_ONLY_SAFE,
  OrgPermission,
  OrgRole,
  effectiveOrgPermissions,
} from '../../constants/org';

const DAY = 24 * 60 * 60 * 1000;

export type OrgReadOnlyReason = 'suspended' | 'paused' | 'cancelled' | 'trial_ended' | 'payment_overdue';

/**
 * Whether the org can currently make changes. Suspended orgs are blocked
 * entirely elsewhere; everything else here degrades to read-only (view,
 * export, billing still work) so an unpaid planner never loses sight of
 * their clients' weddings.
 */
export const orgReadOnlyReason = (
  org: Pick<IOrganization, 'status' | 'planStatus' | 'trialEndsAt' | 'currentPeriodEnd'>,
  now = new Date()
): OrgReadOnlyReason | null => {
  if (org.status === 'suspended') return 'suspended';
  if (org.planStatus === 'paused') return 'paused';
  if (org.planStatus === 'cancelled') return 'cancelled';
  const graceEnds = (d?: Date | null) => (d ? new Date(d).getTime() + ORG_GRACE_DAYS * DAY : Infinity);
  if (org.planStatus === 'trial' && graceEnds(org.trialEndsAt) < now.getTime()) return 'trial_ended';
  if ((org.planStatus === 'active' || org.planStatus === 'past_due') && graceEnds(org.currentPeriodEnd) < now.getTime()) {
    return 'payment_overdue';
  }
  return null;
};

export interface OrgMembership {
  org: IOrganization;
  member: IOrgMember;
  role: OrgRole;
  permissions: Set<OrgPermission>;
  readOnly: OrgReadOnlyReason | null;
}

/** Role defaults + overrides, cut down to the read-only-safe set when the org can't make changes. */
export const membershipPermissions = (
  member: Pick<IOrgMember, 'role' | 'permissionOverrides'>,
  readOnly: OrgReadOnlyReason | null
): Set<OrgPermission> => {
  const perms = effectiveOrgPermissions(member.role, member.permissionOverrides);
  if (!readOnly) return perms;
  return new Set([...perms].filter((p) => ORG_READ_ONLY_SAFE.includes(p)));
};

/**
 * The caller's active membership of `orgId`, or null. Suspended orgs return
 * null for everyone — their staff lose access until an admin reinstates them.
 * Pass `org` when it's already loaded to skip a query.
 */
export const loadMembership = async (
  orgId: string | mongoose.Types.ObjectId,
  userId: string,
  org?: IOrganization | null
): Promise<OrgMembership | null> => {
  if (!mongoose.isValidObjectId(orgId) || !mongoose.isValidObjectId(userId)) return null;

  const [organization, member] = await Promise.all([
    org ?? Organization.findById(orgId),
    OrgMember.findOne({ organizationId: orgId, userId, status: 'active' }),
  ]);
  if (!organization || !member || organization.status === 'suspended') return null;

  const readOnly = orgReadOnlyReason(organization);
  return {
    org: organization,
    member,
    role: member.role,
    permissions: membershipPermissions(member, readOnly),
    readOnly,
  };
};
