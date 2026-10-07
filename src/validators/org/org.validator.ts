import { z } from 'zod';
import { ORG_PERMISSIONS, ORG_PLAN_KEYS } from '../../constants/org';
import { clientAccessBody } from '../client-access.validator';
import { VENDOR_CATEGORIES } from '../../models/vendor.model';

const objectId = (label = 'id') => z.string().regex(/^[a-f\d]{24}$/i, `Invalid ${label}`);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #9e2b46');
const optionalText = (max: number) => z.string().trim().max(max).optional();
const permissionList = z.array(z.enum(ORG_PERMISSIONS)).max(ORG_PERMISSIONS.length);
const orgParams = z.object({ orgId: objectId('organization') }).passthrough();

export const createOrgSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    phone: optionalText(20),
    email: z.string().trim().email().max(200).optional().or(z.literal('')),
    city: optionalText(100),
    address: optionalText(500),
    gstNumber: optionalText(20),
  }),
});

export const updateOrgSchema = z.object({
  params: orgParams,
  body: z
    .object({
      name: z.string().trim().min(2).max(100).optional(),
      phone: optionalText(20),
      email: z.string().trim().email().max(200).optional().or(z.literal('')),
      city: optionalText(100),
      address: optionalText(500),
      gstNumber: optionalText(20),
      brandColor: hex.optional().or(z.literal('')),
      accentColor: hex.optional().or(z.literal('')),
      showPoweredBy: z.boolean().optional(),
      defaultClientAccess: clientAccessBody.optional(),
    })
    .strict(),
});

export const inviteMemberSchema = z.object({
  params: orgParams,
  body: z.object({
    email: z.string().trim().email().max(200),
    name: optionalText(100),
    role: z.enum(['manager', 'coordinator']),
    grant: permissionList.optional(),
    revoke: permissionList.optional(),
  }),
});

export const updateMemberSchema = z.object({
  params: orgParams.extend({ memberId: objectId('team member') }),
  body: z
    .object({
      role: z.enum(['manager', 'coordinator']).optional(),
      name: optionalText(100),
      status: z.enum(['active', 'disabled']).optional(),
      grant: permissionList.optional(),
      revoke: permissionList.optional(),
    })
    .strict(),
});

export const assigneesSchema = z.object({
  params: orgParams.extend({ weddingId: objectId('wedding') }),
  body: z.object({
    assignees: z.array(z.object({ userId: objectId('assignee'), isLead: z.boolean().optional() })).max(20),
  }),
});

export const archiveSchema = z.object({
  params: orgParams.extend({ weddingId: objectId('wedding') }),
  body: z.object({ archived: z.boolean() }),
});

export const transferSchema = z.object({
  params: orgParams.extend({ weddingId: objectId('wedding') }),
  body: z.object({ clientUserId: objectId('client') }),
});

export const billingRequestSchema = z.object({
  params: orgParams,
  body: z.object({
    planKey: z.enum(ORG_PLAN_KEYS as [string, ...string[]]),
    billingPeriod: z.enum(['monthly', 'annual']),
    note: optionalText(500),
  }),
});

export const adminCreateOrgSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    ownerEmail: z.string().trim().email().max(200),
    city: optionalText(100),
    phone: optionalText(20),
    planKey: z.enum(ORG_PLAN_KEYS as [string, ...string[]]).optional(),
  }),
});

export const adminSetPlanSchema = z.object({
  params: z.object({ orgId: objectId('organization') }),
  body: z.object({
    planKey: z.enum(ORG_PLAN_KEYS as [string, ...string[]]),
    billingPeriod: z.enum(['monthly', 'annual']),
    amount: z.number().min(0),
    method: z.enum(['upi', 'bank_transfer', 'cash', 'cheque', 'waived', 'other']),
    reference: optionalText(100),
    note: optionalText(500),
    periodEnd: z.string().datetime().optional().or(z.string().date().optional()),
  }),
});

export const adminSetStatusSchema = z.object({
  params: z.object({ orgId: objectId('organization') }),
  body: z
    .object({
      status: z.enum(['active', 'suspended']).optional(),
      planStatus: z.enum(['trial', 'active', 'past_due', 'paused', 'cancelled']).optional(),
      trialEndsAt: z.string().datetime().optional().or(z.string().date().optional()),
    })
    .strict(),
});

// ---- Library (M4): vendor roster + agency templates ----

const rosterFields = {
  name: z.string().trim().min(1).max(150),
  category: z.enum(VENDOR_CATEGORIES),
  contactPerson: optionalText(100),
  phone: z.string().trim().min(5).max(20),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  city: optionalText(100),
  website: optionalText(300),
  priceRange: z.object({ min: z.number().min(0).optional(), max: z.number().min(0).optional() }).strict().optional(),
  notes: optionalText(2000),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  rating: z.number().int().min(1).max(5).optional().nullable(),
};

export const createRosterSchema = z.object({ params: orgParams, body: z.object(rosterFields).strict() });

export const updateRosterSchema = z.object({
  params: orgParams.extend({ rosterId: objectId('vendor') }),
  body: z
    .object({
      ...Object.fromEntries(Object.entries(rosterFields).map(([k, v]) => [k, (v as z.ZodTypeAny).optional()])),
      isArchived: z.boolean().optional(),
    })
    .strict(),
});

export const pushRosterSchema = z.object({
  params: orgParams,
  body: z.object({
    rosterIds: z.array(objectId('vendor')).min(1).max(100),
    weddingId: objectId('wedding'),
    eventIds: z.array(objectId('function')).max(20).optional(),
  }),
});

export const rosterFromWeddingVendorSchema = z.object({
  params: orgParams,
  body: z.object({ weddingId: objectId('wedding'), vendorId: objectId('vendor') }),
});

export const importRowsSchema = z.object({
  params: orgParams,
  body: z.object({ rows: z.array(z.record(z.any())).min(1).max(500), dryRun: z.boolean().optional() }),
});

export const templateFromWeddingSchema = z.object({
  params: orgParams.extend({ weddingId: objectId('wedding') }),
  body: z.object({ name: z.string().trim().min(2).max(150), description: optionalText(500) }),
});
