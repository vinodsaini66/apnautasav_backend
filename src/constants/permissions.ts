import { CollaboratorRole } from '../types';

/**
 * Wedding-scoped permission vocabulary — the single list every wedding route
 * checks against (via `requirePermission`, see authorization.middleware.ts).
 *
 * Family collaborators get these through COLLAB_ROLE_PERMISSIONS below; Track C
 * organization staff and client families (see
 * apnautasav_frontend/docs/TrackC_Planner_Organization_Plan.md) are resolved
 * to the same vocabulary by services/access.service.ts, so a route never has
 * to know *how* someone got access, only what they're allowed to do.
 *
 * Seeing the wedding itself is implied by having any access at all. The
 * `*.view` permissions gate individual sections: every family role and every
 * staff member has them; a client family on an agency wedding only has the
 * ones its planner switched on (constants/client-access.ts).
 */
export const WEDDING_PERMISSIONS = [
  'wedding.edit', //          PUT /:weddingId, cover image
  'wedding.settings', //      public page settings
  'wedding.delete',
  'collaborators.manage', //  invite / change role / remove (+ client access on agency weddings)
  'guests.view', //           guests, RSVPs, seating, guest notes
  'guests.manage', //         guests, RSVP compose, bulk import, seating
  'events.view',
  'events.manage',
  'tasks.view',
  'tasks.manage',
  'tasks.complete', //        mark a task done (POST .../complete)
  'tasks.assign',
  'vendors.view', //          vendor names, categories, contacts, booking status
  'vendors.details', //       + costs, agreed terms, notes, contracts, export
  'vendors.manage', //        includes vendor reviews moderation
  'budget.summary', //        totals only (budget / spent / remaining)
  'budget.view', //           budget items, payments, gifts, analytics, export
  'budget.manage', //         budget items, installments, receipts, gifts
  'activity.view',
  'notes.manage',
  'comments.moderate', //     delete other people's comments
  'ai.use',
] as const;

export type WeddingPermission = (typeof WEDDING_PERMISSIONS)[number];

/** Read access to every section — what any family member or staff member has. */
export const VIEW_PERMISSIONS: WeddingPermission[] = [
  'guests.view',
  'events.view',
  'tasks.view',
  'tasks.complete',
  'vendors.view',
  'vendors.details',
  'budget.summary',
  'budget.view',
  'activity.view',
];

const EDITOR_PERMISSIONS: WeddingPermission[] = [
  ...VIEW_PERMISSIONS,
  'wedding.edit',
  'guests.manage',
  'events.manage',
  'tasks.manage',
  'vendors.manage',
  'budget.manage',
  'notes.manage',
  'ai.use',
];

/**
 * Mirrors the old viewer < editor < admin hierarchy exactly — every route that
 * used checkPermission(EDITOR) now needs a permission editors have, and every
 * checkPermission(ADMIN) route needs one only admins have; every read route
 * any collaborator could use needs a view permission all of them have.
 * Changing this table changes Track A behaviour; the regression tests in
 * tests/access.routes.test.ts pin it.
 */
export const COLLAB_ROLE_PERMISSIONS: Record<CollaboratorRole, readonly WeddingPermission[]> = {
  [CollaboratorRole.VIEWER]: VIEW_PERMISSIONS,
  [CollaboratorRole.EDITOR]: EDITOR_PERMISSIONS,
  [CollaboratorRole.ADMIN]: WEDDING_PERMISSIONS,
};
