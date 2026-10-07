import { Response } from 'express';
import { WeddingAccess } from './access.service';
import { WeddingPermission } from '../constants/permissions';

/**
 * Track C: a client family must never receive money detail their planner
 * hid from them, whichever endpoint it rides on (wedding, stats, console,
 * events, event stats, vendors…). Rather than patching every handler, every
 * JSON response to a *client* on a wedding route passes through here once
 * (hooked in middleware/authorization.middleware.ts) and these keys are
 * blanked wherever they appear. Values keep their type (numbers → 0,
 * arrays → [], booleans → false, objects → blanked recursively) so screens
 * that read them don't break — the frontend hides those sections anyway
 * from the same permissions (GET /weddings/:id/access).
 *
 * Family and staff responses are never touched.
 */

/** Line-item money detail — hidden unless the client has budget.view ("full"). */
const BUDGET_DETAIL_KEYS = [
  'budgetItems',
  'estimatedCost',
  'actualCost',
  'installments',
  'receipts',
  'overduePayments',
  'hasOverduePayment',
  'budgetEstimated',
  'budgetSpent',
  'estimatedBudget',
  'totalEstimatedBudget',
  'payments',
  'amount',
  'paidAmount',
];

/** Headline totals — hidden unless the client has budget.summary. */
const BUDGET_TOTAL_KEYS = ['budget', 'totalBudget', 'spent', 'remaining'];

/** Vendor terms — hidden unless the client has vendors.details ("full"). */
const VENDOR_DETAIL_KEYS = ['paymentTerms', 'contracts', 'estimatedCost', 'actualCost'];

const blank = (value: unknown): unknown => {
  if (typeof value === 'number') return 0;
  if (typeof value === 'boolean') return false;
  if (Array.isArray(value)) return [];
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, blank(v)]));
  }
  return value === undefined ? undefined : null;
};

const scrub = (value: unknown, keys: Set<string>, depth = 0): unknown => {
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, keys, depth + 1));
  // Mongoose documents / ObjectIds serialise themselves; turn docs into plain data first.
  const plain = typeof (value as any).toJSON === 'function' && !(value as any)._bsontype ? (value as any).toJSON() : value;
  if (plain !== value) return scrub(plain, keys, depth + 1);
  if ((value as any)._bsontype) return value;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = keys.has(k) ? blank(v) : scrub(v, keys, depth + 1);
  }
  return out;
};

/** Which keys to blank for a client holding these wedding permissions. */
export const redactionKeysForPermissions = (perms: ReadonlySet<WeddingPermission>): Set<string> => {
  const keys = new Set<string>();
  if (!perms.has('budget.view')) BUDGET_DETAIL_KEYS.forEach((k) => keys.add(k));
  if (!perms.has('budget.summary')) BUDGET_TOTAL_KEYS.forEach((k) => keys.add(k));
  if (!perms.has('vendors.details')) VENDOR_DETAIL_KEYS.forEach((k) => keys.add(k));
  return keys;
};

export const redactionKeysFor = (access: WeddingAccess): Set<string> =>
  access.kind === 'client' ? redactionKeysForPermissions(access.permissions) : new Set();

/** For payloads built outside a single wedding's request (e.g. the dashboard list). */
export const scrubWithPermissions = (value: unknown, perms: ReadonlySet<WeddingPermission>) =>
  scrub(value, redactionKeysForPermissions(perms));

/** Wraps res.json so the payload is scrubbed for this client before it's sent. */
export const installClientRedaction = (res: Response, access: WeddingAccess) => {
  const keys = redactionKeysFor(access);
  if (keys.size === 0 || (res as any).__clientRedaction) return;
  (res as any).__clientRedaction = true;
  const original = res.json.bind(res);
  res.json = ((body: any) => {
    if (body && typeof body === 'object' && 'data' in body) {
      return original({ ...body, data: scrub(body.data, keys) });
    }
    return original(body);
  }) as Response['json'];
};

/** Exposed for tests and for the few handlers that build payloads outside res.json (exports). */
export const scrubForClient = (value: unknown, access: WeddingAccess) => scrub(value, redactionKeysFor(access));
