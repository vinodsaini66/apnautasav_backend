import mongoose from 'mongoose';
import { Wedding, IWedding } from '../models/wedding.model';
import { Collaborator } from '../models/collaborator.model';
import { Organization } from '../models/org/organization.model';
import { CollaboratorRole } from '../types';
import { COLLAB_ROLE_PERMISSIONS, VIEW_PERMISSIONS, WEDDING_PERMISSIONS, WeddingPermission } from '../constants/permissions';
import { ClientAccessSettings, clientPermissions, effectiveClientAccess } from '../constants/client-access';
import { ORG_TO_WEDDING_PERMISSIONS, OrgPermission, OrgRole } from '../constants/org';
import { loadMembership, orgReadOnlyReason, OrgReadOnlyReason } from './org/org-access';

/**
 * How the caller reached this wedding:
 * - owner / collaborator — ordinary family wedding (Track A), unchanged.
 * - org     — staff of the planning agency that runs the wedding (Track C).
 * - client  — a family collaborator on an agency-run wedding.
 * See apnautasav_frontend/docs/TrackC_Planner_Organization_Plan.md §5.
 */
export type WeddingAccessKind = 'owner' | 'collaborator' | 'org' | 'client';

export interface WeddingAccess {
  weddingId: string;
  kind: WeddingAccessKind;
  /** Equivalent collaborator role — 'admin' for the owner and for org staff. Kept for the legacy checkPermission(role) wrapper and UI labels. */
  role: CollaboratorRole;
  permissions: ReadonlySet<WeddingPermission>;
  /** The wedding document, already loaded — controllers may reuse it instead of re-fetching. */
  wedding: IWedding;
  /** Set when the wedding belongs to an organization. */
  org?: {
    id: string;
    name: string;
    logoUrl?: string;
    brandColor?: string;
    /** Staff only: their org role and org-level permissions (budget.view, export, …). */
    role?: OrgRole;
    permissions?: ReadonlySet<OrgPermission>;
    /** Why the org can't make changes right now, if it can't. */
    readOnly: OrgReadOnlyReason | null;
  };
  /** Agency weddings only: what the client family sees (already resolved against the agency default). */
  clientAccess?: ClientAccessSettings;
}

export type AccessResult =
  | { ok: true; access: WeddingAccess }
  | { ok: false; status: 404 | 403 };

const FORBIDDEN: AccessResult = { ok: false, status: 403 };

const toWeddingPermissions = (orgPerms: ReadonlySet<OrgPermission>): Set<WeddingPermission> => {
  const out = new Set<WeddingPermission>();
  for (const perm of WEDDING_PERMISSIONS) {
    const needs = ORG_TO_WEDDING_PERMISSIONS[perm];
    if (needs === null || orgPerms.has(needs)) out.add(perm);
  }
  return out;
};

/** While an agency can't make changes, everyone keeps their read access and nothing else. */
const viewOnly = (perms: Iterable<WeddingPermission>) => new Set([...perms].filter((p) => VIEW_PERMISSIONS.includes(p)));

const acceptedCollaboratorRole = async (weddingId: string, userId: string): Promise<CollaboratorRole | null> => {
  const collaborator = await Collaborator.findOne({ weddingId, userId, invitationStatus: 'accepted' })
    .select('role')
    .lean();
  return collaborator ? (collaborator.role as CollaboratorRole) : null;
};

const resolveOrgWeddingAccess = async (userId: string, wedding: IWedding): Promise<AccessResult> => {
  const weddingId = String(wedding._id);
  const org = await Organization.findById(wedding.organizationId);
  if (!org) return FORBIDDEN;

  const clientAccess = effectiveClientAccess(wedding.clientAccess, org.settings?.defaultClientAccess);
  const orgSummary = {
    id: String(org._id),
    name: org.name,
    logoUrl: org.logoUrl,
    brandColor: org.brandColor,
  };

  // 1. Agency staff. Owner/manager (weddings.viewAll) see every org wedding;
  //    everyone else only the weddings they're assigned to.
  const membership = await loadMembership(org._id as mongoose.Types.ObjectId, userId, org);
  if (membership) {
    const assigned = (wedding.orgAssignees ?? []).some((a) => String(a.userId) === userId);
    if (!assigned && !membership.permissions.has('weddings.viewAll')) return FORBIDDEN;

    return {
      ok: true,
      access: {
        weddingId,
        kind: 'org',
        role: CollaboratorRole.ADMIN,
        permissions: membership.readOnly
          ? viewOnly(toWeddingPermissions(membership.permissions))
          : toWeddingPermissions(membership.permissions),
        wedding,
        org: { ...orgSummary, role: membership.role, permissions: membership.permissions, readOnly: membership.readOnly },
        clientAccess,
      },
    };
  }

  // 2. The client family, as ordinary per-wedding collaborators. Wedding.createdBy
  //    alone grants nothing here — it's just whichever staff member created it,
  //    and they must lose access when they leave the agency.
  const role = await acceptedCollaboratorRole(weddingId, userId);
  if (!role) return FORBIDDEN;

  // Clients keep seeing their wedding while the agency is suspended/unpaid,
  // but can't change it until the agency is back in good standing.
  const readOnly = orgReadOnlyReason(org);
  return {
    ok: true,
    access: {
      weddingId,
      kind: 'client',
      role,
      permissions: readOnly ? viewOnly(clientPermissions(role, clientAccess.sections)) : clientPermissions(role, clientAccess.sections),
      wedding,
      org: { ...orgSummary, readOnly },
      clientAccess,
    },
  };
};

/**
 * The single place that decides whether `userId` can see `weddingId`, and what
 * they can do there. Every wedding route goes through this (via
 * checkWeddingAccess), so a new way of reaching a wedding is added here once,
 * not per route.
 */
export const resolveWeddingAccess = async (userId: string, weddingId: string): Promise<AccessResult> => {
  if (!mongoose.isValidObjectId(weddingId)) return { ok: false, status: 404 };

  const wedding = await Wedding.findById(weddingId);
  if (!wedding) return { ok: false, status: 404 };

  if (wedding.organizationId) return resolveOrgWeddingAccess(userId, wedding);

  if (wedding.createdBy.toString() === userId) {
    return {
      ok: true,
      access: {
        weddingId,
        kind: 'owner',
        role: CollaboratorRole.ADMIN,
        permissions: new Set(WEDDING_PERMISSIONS),
        wedding,
      },
    };
  }

  const role = await acceptedCollaboratorRole(weddingId, userId);
  if (!role) return FORBIDDEN;

  return {
    ok: true,
    access: {
      weddingId,
      kind: 'collaborator',
      role,
      permissions: new Set(COLLAB_ROLE_PERMISSIONS[role] ?? []),
      wedding,
    },
  };
};

/**
 * Extra query filter hiding team-only items (`isInternal`) from a client
 * family. Spread it into every find/count/aggregate $match over Task, Vendor,
 * SharedNote or Budget that can be reached by a client.
 */
export const internalFilter = (access?: WeddingAccess): Record<string, unknown> =>
  access?.kind === 'client' ? { isInternal: { $ne: true } } : {};

export const hasPermission = (access: WeddingAccess, ...perms: WeddingPermission[]): boolean =>
  perms.every((p) => access.permissions.has(p));

/** Shape returned by GET /weddings/:weddingId/access — what the frontend gates UI on. */
export const serializeAccess = (access: WeddingAccess) => ({
  weddingId: access.weddingId,
  kind: access.kind,
  role: access.role,
  permissions: [...access.permissions],
  org: access.org
    ? {
        id: access.org.id,
        name: access.org.name,
        logoUrl: access.org.logoUrl,
        brandColor: access.org.brandColor,
        role: access.org.role,
        permissions: access.org.permissions ? [...access.org.permissions] : undefined,
        readOnly: access.org.readOnly,
      }
    : undefined,
  clientAccess: access.clientAccess,
});
