import { WeddingPermission } from './permissions';

/**
 * Track C — planner agencies ("organizations"). See
 * apnautasav_frontend/docs/TrackC_Planner_Organization_Plan.md §4 for the
 * role matrix and §3.7 for plans. Mirrored for the UI in
 * apnautasav_frontend/lib/org-permissions.ts — keep both in sync.
 */

export const ORG_ROLES = ['owner', 'manager', 'coordinator'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_PERMISSIONS = [
  // Organization
  'org.settings',
  'org.branding',
  'org.billing',
  // Team
  'team.view',
  'team.manage',
  // Weddings
  'weddings.viewAll',
  'weddings.create',
  'weddings.assign',
  'weddings.archive',
  'weddings.delete',
  'client.manage',
  // Inside a wedding
  'guests.manage',
  'events.manage',
  'tasks.manage',
  'vendors.manage',
  'budget.view',
  'budget.manage',
  'notes.internal',
  'export',
  // Library (roster/templates arrive in M4; the permissions exist now so
  // per-staff overrides set today keep meaning the same thing later)
  'roster.view',
  'roster.manage',
  'templates.apply',
  'templates.manage',
  'import',
] as const;
export type OrgPermission = (typeof ORG_PERMISSIONS)[number];

const ALL = [...ORG_PERMISSIONS];

export const ORG_ROLE_DEFAULTS: Record<OrgRole, readonly OrgPermission[]> = {
  owner: ALL,
  manager: ALL.filter((p) => !['org.settings', 'org.billing', 'weddings.delete'].includes(p)),
  coordinator: [
    'team.view',
    'guests.manage',
    'events.manage',
    'tasks.manage',
    'vendors.manage',
    'notes.internal',
    'export',
    'roster.view',
    'templates.apply',
  ],
};

/** While an org can't be edited (paused, unpaid, trial over), these still work. */
export const ORG_READ_ONLY_SAFE: readonly OrgPermission[] = [
  'org.billing',
  'team.view',
  'weddings.viewAll',
  'budget.view',
  'export',
  'roster.view',
];

export interface PermissionOverrides {
  grant?: string[];
  revoke?: string[];
}

const isOrgPermission = (p: string): p is OrgPermission => (ORG_PERMISSIONS as readonly string[]).includes(p);

/** Role defaults + grants − revokes. The owner's set is fixed (overrides ignored). */
export const effectiveOrgPermissions = (role: OrgRole, overrides?: PermissionOverrides | null): Set<OrgPermission> => {
  const set = new Set<OrgPermission>(ORG_ROLE_DEFAULTS[role] ?? []);
  if (role === 'owner') return set;
  for (const p of overrides?.grant ?? []) if (isOrgPermission(p)) set.add(p);
  for (const p of overrides?.revoke ?? []) if (isOrgPermission(p)) set.delete(p);
  return set;
};

/**
 * What an org staff member may do *inside* a wedding, expressed in the
 * wedding permission vocabulary every wedding route already checks
 * (constants/permissions.ts). `null` = granted to every staff member who can
 * see the wedding at all.
 */
export const ORG_TO_WEDDING_PERMISSIONS: Record<WeddingPermission, OrgPermission | null> = {
  'wedding.edit': 'weddings.create',
  'wedding.settings': 'client.manage',
  'wedding.delete': 'weddings.delete',
  'collaborators.manage': 'client.manage',
  'guests.view': null,
  'guests.manage': 'guests.manage',
  'events.view': null,
  'events.manage': 'events.manage',
  'tasks.view': null,
  'tasks.manage': 'tasks.manage',
  'tasks.complete': null,
  'tasks.assign': 'weddings.assign',
  'vendors.view': null,
  'vendors.details': null,
  'vendors.manage': 'vendors.manage',
  // Budget numbers follow the org-level budget.view (coordinators don't
  // have it by default), so a coordinator sees no budget tab or totals.
  'budget.summary': 'budget.view',
  'budget.view': 'budget.view',
  'budget.manage': 'budget.manage',
  'activity.view': null,
  'notes.manage': null,
  'comments.moderate': 'weddings.assign',
  'ai.use': null,
};

// ---- Plans -------------------------------------------------------------------

export type OrgPlanKey = 'org_trial' | 'org_founding' | 'org_starter' | 'org_growth' | 'org_agency';

export interface OrgPlanLimits {
  /** Org weddings not completed and not archived. -1 = unlimited. */
  activeWeddings: number;
  /** Active + invited members, owner included. -1 = unlimited. */
  seats: number;
  whiteLabel: boolean;
  brandedExports: boolean;
  csvImport: boolean;
}

export interface OrgPlan {
  key: OrgPlanKey;
  name: string;
  description: string;
  /** Rupees; 0 + `custom` = negotiated. */
  priceMonthly: number;
  priceAnnual: number;
  custom?: boolean;
  limits: OrgPlanLimits;
  /** Only an admin can put an org on this plan (not offered on the upgrade screen). */
  adminOnly?: boolean;
}

/**
 * Org plans live in code, not the `Plan` collection, on purpose: `Plan` rows
 * are the family pricing page's catalogue (GET /plans lists every active
 * one), and an org subscription is billed manually by an admin for now
 * (OrgPayment), not through the family Purchase flow.
 */
export const ORG_PLANS: Record<OrgPlanKey, OrgPlan> = {
  org_trial: {
    key: 'org_trial',
    name: 'Trial',
    description: '30 days to set up your first client weddings.',
    priceMonthly: 0,
    priceAnnual: 0,
    limits: { activeWeddings: 3, seats: 2, whiteLabel: false, brandedExports: false, csvImport: true },
    adminOnly: true,
  },
  org_founding: {
    key: 'org_founding',
    name: 'Founding Planner',
    description: 'Growth features at a locked founding rate.',
    priceMonthly: 999,
    priceAnnual: 9990,
    limits: { activeWeddings: 20, seats: 5, whiteLabel: true, brandedExports: true, csvImport: true },
    adminOnly: true,
  },
  org_starter: {
    key: 'org_starter',
    name: 'Starter',
    description: 'For a planner and one assistant.',
    priceMonthly: 1499,
    priceAnnual: 14990,
    limits: { activeWeddings: 5, seats: 2, whiteLabel: false, brandedExports: false, csvImport: true },
  },
  org_growth: {
    key: 'org_growth',
    name: 'Growth',
    description: 'For a growing team, with your own branding.',
    priceMonthly: 2999,
    priceAnnual: 29990,
    limits: { activeWeddings: 20, seats: 5, whiteLabel: true, brandedExports: true, csvImport: true },
  },
  org_agency: {
    key: 'org_agency',
    name: 'Agency',
    description: 'Unlimited weddings and seats. Priced with you.',
    priceMonthly: 0,
    priceAnnual: 0,
    custom: true,
    limits: { activeWeddings: -1, seats: -1, whiteLabel: true, brandedExports: true, csvImport: true },
  },
};

export const ORG_PLAN_KEYS = Object.keys(ORG_PLANS) as OrgPlanKey[];
export const ORG_TRIAL_DAYS = 30;
/** Days after a paid period (or trial) ends before the org goes read-only. */
export const ORG_GRACE_DAYS = 7;
export const ORG_INVITE_TTL_DAYS = 14;
/** The most a pause can push a paid period (or trial) back by. */
export const ORG_MAX_PAUSE_DAYS = 120;

/**
 * Founding Planner Program (Track C business analysis, §8 step 5): the first
 * planners get the whole 2026-27 season free, then Growth features at a
 * locked ₹999/month. Slots are limited; the count of orgs already on
 * `org_founding` decides how many are left. An admin still assigns the plan.
 */
export const FOUNDING_OFFER = {
  planKey: 'org_founding' as OrgPlanKey,
  slots: () => Number(process.env.ORG_FOUNDING_SLOTS) || 3,
  /** Free until the end of this day (IST season end). */
  freeUntil: '2027-03-31',
  /** Applications close at the end of this day. */
  applyBy: '2026-10-31',
};

/** Annual price = 10 x monthly. */
export const ORG_ANNUAL_MONTHS_FREE = 2;
