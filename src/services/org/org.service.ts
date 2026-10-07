import mongoose from 'mongoose';
import { Organization, IOrganization } from '../../models/org/organization.model';
import { OrgMember } from '../../models/org/org-member.model';
import { User } from '../../models/user.model';
import { ORG_PLANS, ORG_TRIAL_DAYS } from '../../constants/org';
import { normaliseClientAccess } from '../../constants/client-access';
import { uploadBufferToS3, deleteObjectFromS3ByUrl } from '../../config/s3';
import { OrgMembership, membershipPermissions, orgReadOnlyReason } from './org-access';
import { badRequest, conflict, forbidden, notFound } from '../../utils/org';
import logger from '../../utils/logger';

const DAY = 24 * 60 * 60 * 1000;

const slugify = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'agency';

export const uniqueSlug = async (name: string): Promise<string> => {
  const base = slugify(name);
  for (let i = 0; i < 20; i += 1) {
    const candidate = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    if (!(await Organization.exists({ slug: candidate }))) return candidate;
  }
  return `${base}-${new mongoose.Types.ObjectId().toString().slice(-6)}`;
};

/** What an org looks like to its own members. `me` is the caller's role/permissions in it. */
export const serializeOrg = (org: IOrganization, membership?: Pick<OrgMembership, 'role' | 'permissions' | 'readOnly'>) => ({
  id: String(org._id),
  name: org.name,
  slug: org.slug,
  contact: org.contact ?? {},
  gstNumber: org.gstNumber,
  logoUrl: org.logoUrl,
  brandColor: org.brandColor,
  accentColor: org.accentColor,
  showPoweredBy: org.showPoweredBy,
  status: org.status,
  planKey: org.planKey,
  planName: ORG_PLANS[org.planKey]?.name ?? org.planKey,
  planStatus: org.planStatus,
  billingPeriod: org.billingPeriod ?? null,
  trialEndsAt: org.trialEndsAt ?? null,
  currentPeriodEnd: org.currentPeriodEnd ?? null,
  pausedAt: org.pausedAt ?? null,
  limits: org.limitsSnapshot,
  readOnly: orgReadOnlyReason(org),
  defaultClientAccess: normaliseClientAccess(org.settings?.defaultClientAccess),
  createdAt: org.createdAt,
  me: membership
    ? { role: membership.role, permissions: [...membership.permissions], readOnly: membership.readOnly }
    : undefined,
});

export interface CreateOrgInput {
  name: string;
  phone?: string;
  email?: string;
  city?: string;
  address?: string;
  gstNumber?: string;
}

export class OrgService {
  /**
   * Self-serve agency sign-up: the caller becomes the owner, on a trial.
   * A user owns at most one organization (they can still be staff in others).
   */
  static async create(userId: string, input: CreateOrgInput) {
    if (await Organization.exists({ ownerId: userId })) {
      throw conflict('You already own an organization', { code: 'ALREADY_OWNS_ORG' });
    }
    const user = await User.findById(userId).select('email fullName');
    if (!user) throw notFound('User');

    const now = Date.now();
    const org = await Organization.create({
      name: input.name,
      slug: await uniqueSlug(input.name),
      ownerId: user._id,
      contact: { phone: input.phone, email: input.email || user.email, city: input.city, address: input.address },
      gstNumber: input.gstNumber,
      planKey: 'org_trial',
      planStatus: 'trial',
      trialEndsAt: new Date(now + ORG_TRIAL_DAYS * DAY),
      limitsSnapshot: ORG_PLANS.org_trial.limits,
      createdBy: user._id,
    });

    try {
      const member = await OrgMember.create({
        organizationId: org._id,
        userId: user._id,
        email: user.email,
        name: user.fullName,
        role: 'owner',
        status: 'active',
        joinedAt: new Date(),
      });
      return serializeOrg(org, { role: 'owner', permissions: membershipPermissions(member, null), readOnly: null });
    } catch (error) {
      // Don't leave an ownerless org behind.
      await Organization.deleteOne({ _id: org._id });
      throw error;
    }
  }

  /** Every org the caller is an active member of, with their role in each. Suspended orgs are listed (flagged) so the switcher can explain. */
  static async listMine(userId: string) {
    const members = await OrgMember.find({ userId, status: 'active' }).lean();
    if (members.length === 0) return [];
    const orgs = await Organization.find({ _id: { $in: members.map((m) => m.organizationId) } });
    const byId = new Map(orgs.map((o) => [String(o._id), o]));

    return members
      .map((m) => {
        const org = byId.get(String(m.organizationId));
        if (!org) return null;
        const readOnly = orgReadOnlyReason(org);
        return serializeOrg(org, { role: m.role, permissions: membershipPermissions(m, readOnly), readOnly });
      })
      .filter(Boolean);
  }

  static get(m: OrgMembership) {
    return serializeOrg(m.org, m);
  }

  /** Profile fields need org.settings; brand fields need org.branding. */
  static async update(m: OrgMembership, body: Record<string, any>) {
    const org = m.org;
    const profileKeys = ['name', 'phone', 'email', 'city', 'address', 'gstNumber'];
    const brandKeys = ['brandColor', 'accentColor', 'showPoweredBy'];
    const touchesProfile = profileKeys.some((k) => body[k] !== undefined);
    const touchesBrand = brandKeys.some((k) => body[k] !== undefined);
    if (body.defaultClientAccess !== undefined && !m.permissions.has('client.manage')) throw forbidden();

    if (touchesProfile && !m.permissions.has('org.settings')) throw forbidden();
    if (touchesBrand && !m.permissions.has('org.branding')) throw forbidden();
    if (body.showPoweredBy === false && !org.limitsSnapshot.whiteLabel) {
      throw forbidden('Hiding "Powered by ApnaUtsav" needs a plan with white-label branding', { code: 'ORG_PLAN_FEATURE', feature: 'whiteLabel' });
    }

    if (body.name !== undefined) org.name = body.name;
    for (const k of ['phone', 'email', 'city', 'address'] as const) {
      if (body[k] !== undefined) org.set(`contact.${k}`, body[k] || undefined);
    }
    if (body.gstNumber !== undefined) org.gstNumber = body.gstNumber || undefined;
    if (body.brandColor !== undefined) org.brandColor = body.brandColor || undefined;
    if (body.accentColor !== undefined) org.accentColor = body.accentColor || undefined;
    if (body.showPoweredBy !== undefined) org.showPoweredBy = body.showPoweredBy;
    if (body.defaultClientAccess !== undefined) {
      org.set('settings.defaultClientAccess', normaliseClientAccess(body.defaultClientAccess));
    }

    await org.save();
    return serializeOrg(org, m);
  }

  static async uploadLogo(m: OrgMembership, file?: Express.Multer.File) {
    if (!file) throw badRequest('No image file provided (field name: "image")');
    const previous = m.org.logoUrl;
    m.org.logoUrl = await uploadBufferToS3(file.buffer, file.originalname, file.mimetype, 'org-logos');
    await m.org.save();
    if (previous) {
      deleteObjectFromS3ByUrl(previous).catch((err) => logger.warn('Old org logo cleanup failed', err));
    }
    return serializeOrg(m.org, m);
  }

  static async removeLogo(m: OrgMembership) {
    const previous = m.org.logoUrl;
    m.org.logoUrl = undefined;
    await m.org.save();
    if (previous) {
      deleteObjectFromS3ByUrl(previous).catch((err) => logger.warn('Old org logo cleanup failed', err));
    }
    return serializeOrg(m.org, m);
  }
}
