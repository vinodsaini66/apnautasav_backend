import mongoose from 'mongoose';
import { Organization, BillingPeriod } from '../../models/org/organization.model';
import { OrgMember } from '../../models/org/org-member.model';
import { OrgPayment } from '../../models/org/org-payment.model';
import { Wedding } from '../../models/wedding.model';
import { User } from '../../models/user.model';
import { ORG_MAX_PAUSE_DAYS, ORG_PLANS, ORG_PLAN_KEYS, ORG_TRIAL_DAYS, OrgPlanKey } from '../../constants/org';
import { OrgMembership, membershipPermissions, orgReadOnlyReason } from './org-access';
import { ACTIVE_ORG_WEDDING } from './org-wedding.service';
import { serializeOrg, uniqueSlug } from './org.service';
import { inviteLinkFor } from './org-member.service';
import { sendOrgInviteEmail } from './org-email';
import { badRequest, conflict, notFound } from '../../utils/org';
import crypto from 'crypto';

const DAY = 24 * 60 * 60 * 1000;

const publicPlans = () =>
  ORG_PLAN_KEYS.map((k) => ORG_PLANS[k])
    .filter((p) => !p.adminOnly)
    .map((p) => ({ ...p }));

/** Where to pay, shown on the billing screen. Configured per deployment. */
const paymentInstructions = () => ({
  upiId: process.env.ORG_BILLING_UPI_ID || null,
  bankDetails: process.env.ORG_BILLING_BANK_DETAILS || null,
  contactEmail: process.env.ORG_BILLING_CONTACT_EMAIL || process.env.EMAIL_FROM || null,
});

const addPeriod = (from: Date, period: BillingPeriod) => {
  const d = new Date(from);
  if (period === 'annual') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
};

export class OrgBillingService {
  static async get(m: OrgMembership) {
    const [activeWeddings, seats, payments] = await Promise.all([
      Wedding.countDocuments({ organizationId: m.org._id, ...ACTIVE_ORG_WEDDING }),
      OrgMember.countDocuments({ organizationId: m.org._id, status: { $in: ['invited', 'active'] } }),
      OrgPayment.find({ organizationId: m.org._id }).sort({ createdAt: -1 }).limit(24).lean(),
    ]);
    return {
      org: serializeOrg(m.org, m),
      usage: {
        activeWeddings: { used: activeWeddings, limit: m.org.limitsSnapshot.activeWeddings },
        seats: { used: seats, limit: m.org.limitsSnapshot.seats },
      },
      billingRequest: m.org.billingRequest ?? null,
      payments: payments.map((p) => ({
        id: String(p._id),
        planKey: p.planKey,
        planName: ORG_PLANS[p.planKey]?.name ?? p.planKey,
        billingPeriod: p.billingPeriod,
        amount: p.amount,
        currency: p.currency,
        method: p.method,
        reference: p.reference,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        createdAt: p.createdAt,
      })),
      plans: publicPlans(),
      paymentInstructions: paymentInstructions(),
    };
  }

  /** The owner picks a plan; an admin confirms once the transfer arrives. */
  static async request(m: OrgMembership, input: { planKey: OrgPlanKey; billingPeriod: BillingPeriod; note?: string }) {
    const plan = ORG_PLANS[input.planKey];
    if (!plan || plan.adminOnly) throw badRequest('Choose one of the listed plans');
    m.org.billingRequest = {
      planKey: input.planKey,
      billingPeriod: input.billingPeriod,
      note: input.note,
      requestedBy: m.member.userId!,
      requestedAt: new Date(),
    };
    await m.org.save();
    return { billingRequest: m.org.billingRequest };
  }

  static async cancelRequest(m: OrgMembership) {
    m.org.billingRequest = null;
    await m.org.save();
    return { billingRequest: null };
  }

  /**
   * Off-season pause (PDF risk #8: better than cancelling). Everything goes
   * read-only — staff and families can still see and export — and the paid
   * period (or trial) is pushed back by the paused time on resume, up to
   * ORG_MAX_PAUSE_DAYS. Owner/billing permission only.
   */
  static async pause(m: OrgMembership) {
    const org = m.org;
    if (org.planStatus === 'paused') throw badRequest('Your plan is already paused');
    if (org.planStatus !== 'active' && org.planStatus !== 'trial') throw badRequest('Only an active plan or trial can be paused');
    if (orgReadOnlyReason(org)) throw badRequest('Renew your plan first — it has already lapsed');
    org.pausedFromStatus = org.planStatus;
    org.pausedAt = new Date();
    org.planStatus = 'paused';
    await org.save();
    return serializeOrg(org, m);
  }

  static async resume(m: OrgMembership) {
    const org = m.org;
    if (org.planStatus !== 'paused' || !org.pausedAt) throw badRequest('Your plan isn\'t paused');
    const pausedMs = Math.min(Date.now() - new Date(org.pausedAt).getTime(), ORG_MAX_PAUSE_DAYS * DAY);
    const shift = (d?: Date | null) => (d ? new Date(new Date(d).getTime() + pausedMs) : d);
    org.planStatus = org.pausedFromStatus ?? 'active';
    if (org.planStatus === 'trial') org.trialEndsAt = shift(org.trialEndsAt);
    else org.currentPeriodEnd = shift(org.currentPeriodEnd);
    org.pausedAt = null;
    org.pausedFromStatus = null;
    await org.save();
    // Membership permissions were computed while read-only; recompute for the response.
    const fresh = { ...m, readOnly: orgReadOnlyReason(org), permissions: membershipPermissions(m.member, orgReadOnlyReason(org)) };
    return serializeOrg(org, fresh);
  }

  // ---- ApnaUtsav admin -------------------------------------------------------

  static async adminList(query: { q?: string; status?: string; planStatus?: string; requests?: string }) {
    const filter: Record<string, any> = {};
    if (query.status) filter.status = query.status;
    if (query.planStatus) filter.planStatus = query.planStatus;
    if (query.requests === '1') filter.billingRequest = { $ne: null };
    if (query.q?.trim()) filter.name = new RegExp(query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const orgs = await Organization.find(filter).sort({ createdAt: -1 }).limit(200);
    const ids = orgs.map((o) => o._id);
    const ownerIds = orgs.map((o) => o.ownerId).filter(Boolean);

    const [owners, weddingCounts, memberCounts] = await Promise.all([
      User.find({ _id: { $in: ownerIds } }).select('fullName email').lean(),
      Wedding.aggregate([
        { $match: { organizationId: { $in: ids }, ...ACTIVE_ORG_WEDDING } },
        { $group: { _id: '$organizationId', count: { $sum: 1 } } },
      ]),
      OrgMember.aggregate([
        { $match: { organizationId: { $in: ids }, status: { $in: ['invited', 'active'] } } },
        { $group: { _id: '$organizationId', count: { $sum: 1 } } },
      ]),
    ]);
    const ownerById = new Map(owners.map((u) => [String(u._id), u]));
    const weddings = new Map(weddingCounts.map((r: any) => [String(r._id), r.count]));
    const members = new Map(memberCounts.map((r: any) => [String(r._id), r.count]));

    return orgs.map((o) => ({
      ...serializeOrg(o),
      owner: o.ownerId ? ownerById.get(String(o.ownerId)) ?? null : null,
      billingRequest: o.billingRequest ?? null,
      usage: { activeWeddings: weddings.get(String(o._id)) ?? 0, seats: members.get(String(o._id)) ?? 0 },
    }));
  }

  /**
   * Concierge onboarding: an admin sets an agency up for a planner. If the
   * owner already has an account they own it straight away; otherwise they
   * get an owner invite by email and the org waits for them.
   */
  static async adminCreate(adminId: string, input: { name: string; ownerEmail: string; city?: string; phone?: string; planKey?: OrgPlanKey }) {
    const email = input.ownerEmail.trim().toLowerCase();
    const owner = await User.findOne({ email }).select('fullName email').lean();
    if (owner && (await Organization.exists({ ownerId: owner._id }))) {
      throw conflict('That person already owns an organization');
    }

    const planKey = input.planKey ?? 'org_trial';
    const slug = await uniqueSlug(input.name);

    const now = Date.now();
    const org = await Organization.create({
      name: input.name,
      slug,
      ownerId: owner?._id ?? null,
      contact: { phone: input.phone, email, city: input.city },
      planKey,
      planStatus: planKey === 'org_trial' ? 'trial' : 'active',
      trialEndsAt: planKey === 'org_trial' ? new Date(now + ORG_TRIAL_DAYS * DAY) : null,
      limitsSnapshot: ORG_PLANS[planKey].limits,
      createdBy: adminId,
    });

    let inviteLink: string | null = null;
    if (owner) {
      await OrgMember.create({
        organizationId: org._id,
        userId: owner._id,
        email,
        name: owner.fullName,
        role: 'owner',
        status: 'active',
        joinedAt: new Date(),
      });
    } else {
      const token = crypto.randomBytes(24).toString('hex');
      await OrgMember.create({
        organizationId: org._id,
        email,
        role: 'owner',
        status: 'invited',
        inviteTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
        inviteExpiresAt: new Date(now + 30 * DAY),
        invitedBy: adminId,
      });
      inviteLink = inviteLinkFor(token);
      void sendOrgInviteEmail(email, { orgName: org.name, role: 'owner', inviteLink });
    }
    return { org: serializeOrg(org), inviteLink };
  }

  /** Records a confirmed manual payment and moves the org onto that plan. */
  static async adminSetPlan(
    adminId: string,
    orgId: string,
    input: {
      planKey: OrgPlanKey;
      billingPeriod: BillingPeriod;
      amount: number;
      method: 'upi' | 'bank_transfer' | 'cash' | 'cheque' | 'waived' | 'other';
      reference?: string;
      note?: string;
      periodEnd?: string;
    }
  ) {
    if (!mongoose.isValidObjectId(orgId)) throw notFound('Organization');
    const org = await Organization.findById(orgId);
    if (!org) throw notFound('Organization');

    // A renewal extends from the current period end if it hasn't lapsed yet.
    const now = new Date();
    const start = org.planStatus === 'active' && org.currentPeriodEnd && org.currentPeriodEnd > now ? org.currentPeriodEnd : now;
    const end = input.periodEnd ? new Date(input.periodEnd) : addPeriod(start, input.billingPeriod);
    if (Number.isNaN(end.getTime()) || end <= now) throw badRequest('periodEnd must be a future date');

    const payment = await OrgPayment.create({
      organizationId: org._id,
      planKey: input.planKey,
      billingPeriod: input.billingPeriod,
      amount: input.amount,
      method: input.method,
      reference: input.reference,
      note: input.note,
      periodStart: start,
      periodEnd: end,
      recordedBy: adminId,
    });

    org.planKey = input.planKey;
    org.planStatus = 'active';
    org.billingPeriod = input.billingPeriod;
    org.currentPeriodEnd = end;
    org.trialEndsAt = null;
    org.limitsSnapshot = ORG_PLANS[input.planKey].limits;
    org.billingRequest = null;
    await org.save();

    return { org: serializeOrg(org), paymentId: String(payment._id) };
  }

  static async adminSetStatus(orgId: string, input: { status?: 'active' | 'suspended'; planStatus?: 'trial' | 'active' | 'past_due' | 'paused' | 'cancelled'; trialEndsAt?: string }) {
    if (!mongoose.isValidObjectId(orgId)) throw notFound('Organization');
    const org = await Organization.findById(orgId);
    if (!org) throw notFound('Organization');
    if (input.status) org.status = input.status;
    if (input.planStatus) org.planStatus = input.planStatus;
    if (input.trialEndsAt) org.trialEndsAt = new Date(input.trialEndsAt);
    await org.save();
    return { ...serializeOrg(org), readOnly: orgReadOnlyReason(org) };
  }
}
