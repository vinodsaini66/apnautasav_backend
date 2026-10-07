import crypto from 'crypto';
import mongoose from 'mongoose';
import { OrgMember, IOrgMember } from '../../models/org/org-member.model';
import { Organization } from '../../models/org/organization.model';
import { Wedding } from '../../models/wedding.model';
import { User } from '../../models/user.model';
import {
  ORG_INVITE_TTL_DAYS,
  ORG_ROLE_DEFAULTS,
  OrgPermission,
  OrgRole,
  effectiveOrgPermissions,
} from '../../constants/org';
import { OrgMembership } from './org-access';
import { badRequest, conflict, forbidden, notFound, OrgError } from '../../utils/org';
import { sendOrgInviteEmail } from './org-email';

const DAY = 24 * 60 * 60 * 1000;
const FRONTEND = () => (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const newInviteToken = () => {
  const token = crypto.randomBytes(24).toString('hex');
  return { token, hash: hashToken(token), expiresAt: new Date(Date.now() + ORG_INVITE_TTL_DAYS * DAY) };
};
export const inviteLinkFor = (token: string) => `${FRONTEND()}/org/invite/${token}`;

interface PermissionInput {
  grant?: OrgPermission[];
  revoke?: OrgPermission[];
}

/** Keep only overrides that actually change something vs the role default. */
const normaliseOverrides = (role: OrgRole, input: PermissionInput) => {
  const defaults = new Set(ORG_ROLE_DEFAULTS[role]);
  return {
    grant: [...new Set(input.grant ?? [])].filter((p) => !defaults.has(p)),
    revoke: [...new Set(input.revoke ?? [])].filter((p) => defaults.has(p)),
  };
};

/**
 * Who may manage whom. The owner manages everyone but themself. Anyone else
 * with team.manage (managers by default) may only manage coordinators, may
 * not create managers, and may not hand out a permission they don't hold.
 */
const assertCanManage = (m: OrgMembership, target: { role: OrgRole }, next: { role: OrgRole; grant: OrgPermission[] }) => {
  if (!m.permissions.has('team.manage')) throw forbidden();
  if (target.role === 'owner' || next.role === 'owner') throw forbidden('The owner can\'t be changed here');
  if (m.role === 'owner') return;
  if (target.role !== 'coordinator' || next.role !== 'coordinator') {
    throw forbidden('Only the owner can add or change managers');
  }
  const mine = m.permissions;
  const escalation = next.grant.filter((p) => !mine.has(p));
  if (escalation.length) throw forbidden('You can\'t grant permissions you don\'t have', { permissions: escalation });
};

const assertSeatAvailable = async (m: OrgMembership) => {
  const limit = m.org.limitsSnapshot.seats;
  if (limit < 0) return;
  const used = await OrgMember.countDocuments({ organizationId: m.org._id, status: { $in: ['invited', 'active'] } });
  if (used >= limit) {
    throw new OrgError(403, `Your plan includes ${limit} team seats. Upgrade to add more people.`, {
      code: 'ORG_LIMIT',
      resource: 'seats',
      limit,
      used,
    });
  }
};

const serializeMember = (member: IOrgMember | any, extra: { user?: any; assignedWeddings?: number } = {}) => ({
  id: String(member._id),
  userId: member.userId ? String(member.userId) : null,
  email: member.email,
  name: extra.user?.fullName || member.name || null,
  avatarUrl: extra.user?.avatarUrl || null,
  role: member.role,
  status: member.status,
  permissionOverrides: {
    grant: member.permissionOverrides?.grant ?? [],
    revoke: member.permissionOverrides?.revoke ?? [],
  },
  permissions: [...effectiveOrgPermissions(member.role, member.permissionOverrides)],
  inviteExpiresAt: member.inviteExpiresAt ?? null,
  joinedAt: member.joinedAt ?? null,
  assignedWeddings: extra.assignedWeddings ?? 0,
});

export class OrgMemberService {
  static async list(m: OrgMembership) {
    const orgId = m.org._id;
    const members = await OrgMember.find({ organizationId: orgId }).sort({ createdAt: 1 }).lean();
    const userIds = members.map((x) => x.userId).filter(Boolean) as mongoose.Types.ObjectId[];

    const [users, assignmentCounts] = await Promise.all([
      User.find({ _id: { $in: userIds } }).select('fullName avatarUrl').lean(),
      Wedding.aggregate([
        { $match: { organizationId: orgId, archivedAt: null } },
        { $unwind: '$orgAssignees' },
        { $group: { _id: '$orgAssignees.userId', count: { $sum: 1 } } },
      ]),
    ]);
    const userById = new Map(users.map((u) => [String(u._id), u]));
    const countByUser = new Map(assignmentCounts.map((a: any) => [String(a._id), a.count]));

    const used = members.filter((x) => x.status !== 'disabled').length;
    return {
      members: members.map((x) =>
        serializeMember(x, {
          user: x.userId ? userById.get(String(x.userId)) : undefined,
          assignedWeddings: x.userId ? countByUser.get(String(x.userId)) ?? 0 : 0,
        })
      ),
      seats: { used, limit: m.org.limitsSnapshot.seats },
    };
  }

  static async invite(
    m: OrgMembership,
    input: { email: string; name?: string; role: Exclude<OrgRole, 'owner'> } & PermissionInput
  ) {
    const email = input.email.trim().toLowerCase();
    const overrides = normaliseOverrides(input.role, input);
    assertCanManage(m, { role: input.role }, { role: input.role, grant: overrides.grant });

    const existing = await OrgMember.findOne({ organizationId: m.org._id, email });
    if (existing && existing.status !== 'disabled') {
      throw conflict(existing.status === 'active' ? 'This person is already on your team' : 'This person has already been invited');
    }
    await assertSeatAvailable(m);

    const { token, hash, expiresAt } = newInviteToken();
    const member = existing ?? new OrgMember({ organizationId: m.org._id, email });
    member.set({
      name: input.name || member.name,
      role: input.role,
      permissionOverrides: overrides,
      status: 'invited',
      userId: null,
      inviteTokenHash: hash,
      inviteExpiresAt: expiresAt,
      invitedBy: m.member.userId,
      joinedAt: null,
    });
    await member.save();

    const inviter = await User.findById(m.member.userId).select('fullName').lean();
    const inviteLink = inviteLinkFor(token);
    void sendOrgInviteEmail(email, { orgName: m.org.name, inviterName: inviter?.fullName, role: input.role, inviteLink });

    return { member: serializeMember(member), inviteLink };
  }

  static async resendInvite(m: OrgMembership, memberId: string) {
    const member = await this.findInOrg(m, memberId);
    if (member.status !== 'invited') throw badRequest('Only pending invites can be resent');
    assertCanManage(m, member, { role: member.role, grant: [] });

    const { token, hash, expiresAt } = newInviteToken();
    member.inviteTokenHash = hash;
    member.inviteExpiresAt = expiresAt;
    await member.save();

    const inviteLink = inviteLinkFor(token);
    void sendOrgInviteEmail(member.email, { orgName: m.org.name, role: member.role, inviteLink });
    return { member: serializeMember(member), inviteLink };
  }

  static async update(
    m: OrgMembership,
    memberId: string,
    input: { role?: Exclude<OrgRole, 'owner'>; name?: string; status?: 'active' | 'disabled' } & PermissionInput
  ) {
    const member = await this.findInOrg(m, memberId);
    if (member.userId && String(member.userId) === String(m.member.userId)) {
      throw forbidden('You can\'t change your own role or access');
    }

    const role = input.role ?? (member.role as Exclude<OrgRole, 'owner'>);
    const overrides =
      input.grant !== undefined || input.revoke !== undefined || input.role !== undefined
        ? normaliseOverrides(role, {
            grant: input.grant ?? (member.permissionOverrides.grant as OrgPermission[]),
            revoke: input.revoke ?? (member.permissionOverrides.revoke as OrgPermission[]),
          })
        : member.permissionOverrides;
    assertCanManage(m, member, { role, grant: overrides.grant as OrgPermission[] });

    if (input.status === 'active' && member.status === 'disabled') {
      if (!member.userId) throw badRequest('This invite was cancelled — send a new one instead');
      await assertSeatAvailable(m);
    }

    member.role = role;
    member.permissionOverrides = { grant: overrides.grant, revoke: overrides.revoke };
    if (input.name !== undefined) member.name = input.name;
    if (input.status) {
      if (member.status === 'invited' && input.status === 'active') throw badRequest('Invites become active when accepted');
      if (member.status !== 'invited') member.status = input.status;
    }
    await member.save();

    if (member.status === 'disabled' && member.userId) await this.unassignEverywhere(m.org._id, member.userId);
    return serializeMember(member);
  }

  /** Cancels a pending invite, or disables an active member (history and authorship stay intact). */
  static async remove(m: OrgMembership, memberId: string) {
    const member = await this.findInOrg(m, memberId);
    if (member.userId && String(member.userId) === String(m.member.userId)) throw forbidden('You can\'t remove yourself');
    assertCanManage(m, member, { role: member.role, grant: [] });

    if (member.status === 'invited' || !member.userId) {
      await member.deleteOne();
      return { removed: true };
    }
    member.status = 'disabled';
    await member.save();
    await this.unassignEverywhere(m.org._id, member.userId);
    return { removed: true };
  }

  private static async unassignEverywhere(orgId: mongoose.Types.ObjectId | unknown, userId: mongoose.Types.ObjectId) {
    await Wedding.updateMany({ organizationId: orgId }, { $pull: { orgAssignees: { userId } } });
  }

  private static async findInOrg(m: OrgMembership, memberId: string) {
    if (!mongoose.isValidObjectId(memberId)) throw notFound('Team member');
    const member = await OrgMember.findOne({ _id: memberId, organizationId: m.org._id });
    if (!member) throw notFound('Team member');
    return member;
  }

  // ---- the invitee's side ---------------------------------------------------

  /** Pending, unexpired invites addressed to the caller's email. */
  static async myInvites(userId: string) {
    const user = await User.findById(userId).select('email').lean();
    if (!user) return [];
    const invites = await OrgMember.find({ email: user.email, status: 'invited', inviteExpiresAt: { $gt: new Date() } }).lean();
    const orgs = await Organization.find({ _id: { $in: invites.map((i) => i.organizationId) }, status: 'active' })
      .select('name logoUrl')
      .lean();
    const orgById = new Map(orgs.map((o) => [String(o._id), o]));
    return invites
      .filter((i) => orgById.has(String(i.organizationId)))
      .map((i) => {
        const org = orgById.get(String(i.organizationId))!;
        return { id: String(i._id), role: i.role, org: { id: String(org._id), name: org.name, logoUrl: org.logoUrl } };
      });
  }

  /** What the /org/invite/[token] page shows before the person accepts. */
  static async previewToken(token: string) {
    const member = await OrgMember.findOne({ inviteTokenHash: hashToken(token), status: 'invited' }).lean();
    if (!member) throw notFound('Invite');
    const org = await Organization.findById(member.organizationId).select('name logoUrl status').lean();
    if (!org || org.status !== 'active') throw notFound('Invite');
    return {
      id: String(member._id),
      email: member.email,
      role: member.role,
      expired: !member.inviteExpiresAt || member.inviteExpiresAt < new Date(),
      org: { id: String(org._id), name: org.name, logoUrl: org.logoUrl },
    };
  }

  static async acceptToken(userId: string, token: string) {
    const member = await OrgMember.findOne({ inviteTokenHash: hashToken(token), status: 'invited' });
    if (!member) throw notFound('Invite');
    return this.accept(userId, member);
  }

  static async acceptById(userId: string, memberId: string) {
    if (!mongoose.isValidObjectId(memberId)) throw notFound('Invite');
    const member = await OrgMember.findOne({ _id: memberId, status: 'invited' });
    if (!member) throw notFound('Invite');
    return this.accept(userId, member);
  }

  static async decline(userId: string, memberId: string) {
    const user = await User.findById(userId).select('email').lean();
    if (!user || !mongoose.isValidObjectId(memberId)) throw notFound('Invite');
    const res = await OrgMember.deleteOne({ _id: memberId, email: user.email, status: 'invited' });
    if (res.deletedCount === 0) throw notFound('Invite');
    return { declined: true };
  }

  private static async accept(userId: string, member: IOrgMember) {
    const user = await User.findById(userId).select('email').lean();
    if (!user) throw notFound('User');
    // The invite is for an email address; only the account with that email can take it.
    if (user.email.toLowerCase() !== member.email) {
      throw forbidden(`This invite was sent to ${member.email}. Sign in with that email to accept it.`, { code: 'INVITE_EMAIL_MISMATCH' });
    }
    if (!member.inviteExpiresAt || member.inviteExpiresAt < new Date()) {
      throw new OrgError(410, 'This invite has expired. Ask for a new one.', { code: 'INVITE_EXPIRED' });
    }
    const org = await Organization.findById(member.organizationId);
    if (!org || org.status !== 'active') throw notFound('Invite');

    // An admin-created org waits for its owner to accept.
    if (member.role === 'owner') {
      if (org.ownerId && String(org.ownerId) !== userId) throw conflict('This organization already has an owner');
      if (!org.ownerId && (await Organization.exists({ ownerId: userId }))) {
        throw conflict('You already own an organization', { code: 'ALREADY_OWNS_ORG' });
      }
    }

    member.userId = new mongoose.Types.ObjectId(userId);
    member.status = 'active';
    member.joinedAt = new Date();
    member.inviteTokenHash = null;
    member.inviteExpiresAt = null;
    await member.save();

    if (member.role === 'owner' && !org.ownerId) {
      org.ownerId = member.userId;
      await org.save();
    }
    return { orgId: String(org._id), role: member.role };
  }
}
