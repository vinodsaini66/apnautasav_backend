import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireAdmin } from '../../middleware/authorization.middleware';
import { loadOrgMember, requireOrgPermission } from '../../middleware/org.middleware';
import { validate } from '../../middleware/validation.middleware';
import { imageUpload } from '../../middleware/upload.middleware';
import { OrgController, AdminOrgController } from '../../controllers/org/org.controller';
import {
  createOrgSchema,
  updateOrgSchema,
  inviteMemberSchema,
  updateMemberSchema,
  assigneesSchema,
  archiveSchema,
  transferSchema,
  billingRequestSchema,
  adminCreateOrgSchema,
  adminSetPlanSchema,
  adminSetStatusSchema,
  createRosterSchema,
  updateRosterSchema,
  pushRosterSchema,
  rosterFromWeddingVendorSchema,
  importRowsSchema,
  templateFromWeddingSchema,
} from '../../validators/org/org.validator';

/**
 * Track C — planner organizations. Mounted at /orgs.
 * See apnautasav_frontend/docs/TrackC_Planner_Organization_Plan.md §7.
 *
 * Client weddings themselves stay on /weddings/:weddingId/* — access there is
 * resolved by services/access.service.ts, which knows about org membership.
 * Creating one is POST /weddings with `organizationId` in the body.
 */
const router: Router = Router();
router.use(authMiddleware);

// ---- ApnaUtsav admin (before /:orgId so "admin" isn't read as an org id) ----
router.get('/admin/list', requireAdmin, AdminOrgController.list);
router.post('/admin', requireAdmin, validate(adminCreateOrgSchema), AdminOrgController.create);
router.patch('/admin/:orgId/plan', requireAdmin, validate(adminSetPlanSchema), AdminOrgController.setPlan);
router.patch('/admin/:orgId/status', requireAdmin, validate(adminSetStatusSchema), AdminOrgController.setStatus);

// ---- mine / invites ----
router.post('/', validate(createOrgSchema), OrgController.create);
router.get('/mine', OrgController.listMine);
router.get('/invites/mine', OrgController.myInvites);
router.get('/invites/token/:token', OrgController.previewInvite);
router.post('/invites/token/:token/accept', OrgController.acceptInviteToken);
router.post('/invites/:memberId/accept', OrgController.acceptInvite);
router.post('/invites/:memberId/decline', OrgController.declineInvite);

// ---- one organization (caller must be an active member) ----
router.get('/:orgId', loadOrgMember, OrgController.get);
router.patch('/:orgId', loadOrgMember, validate(updateOrgSchema), OrgController.update);
router.post('/:orgId/logo', loadOrgMember, requireOrgPermission('org.branding'), imageUpload.single('image'), OrgController.uploadLogo);
router.delete('/:orgId/logo', loadOrgMember, requireOrgPermission('org.branding'), OrgController.removeLogo);

router.get('/:orgId/members', loadOrgMember, requireOrgPermission('team.view'), OrgController.listMembers);
router.post('/:orgId/members', loadOrgMember, requireOrgPermission('team.manage'), validate(inviteMemberSchema), OrgController.inviteMember);
router.post('/:orgId/members/:memberId/resend', loadOrgMember, requireOrgPermission('team.manage'), OrgController.resendInvite);
router.patch('/:orgId/members/:memberId', loadOrgMember, requireOrgPermission('team.manage'), validate(updateMemberSchema), OrgController.updateMember);
router.delete('/:orgId/members/:memberId', loadOrgMember, requireOrgPermission('team.manage'), OrgController.removeMember);

router.get('/:orgId/dashboard', loadOrgMember, OrgController.dashboard);
router.get('/:orgId/weddings', loadOrgMember, OrgController.portfolio);
router.patch('/:orgId/weddings/:weddingId/assignees', loadOrgMember, requireOrgPermission('weddings.assign'), validate(assigneesSchema), OrgController.setAssignees);
router.patch('/:orgId/weddings/:weddingId/archive', loadOrgMember, requireOrgPermission('weddings.archive'), validate(archiveSchema), OrgController.setArchived);
router.post('/:orgId/weddings/:weddingId/transfer-to-client', loadOrgMember, requireOrgPermission('org.settings'), validate(transferSchema), OrgController.transferToClient);

// Vendor roster (the agency's reusable vendor list). Fixed paths before /:rosterId.
router.get('/:orgId/roster', loadOrgMember, requireOrgPermission('roster.view'), OrgController.listRoster);
router.post('/:orgId/roster', loadOrgMember, requireOrgPermission('roster.manage'), validate(createRosterSchema), OrgController.createRoster);
router.post('/:orgId/roster/push', loadOrgMember, requireOrgPermission('roster.view'), validate(pushRosterSchema), OrgController.pushRoster);
router.post('/:orgId/roster/import', loadOrgMember, requireOrgPermission('roster.manage', 'import'), validate(importRowsSchema), OrgController.importRoster);
router.post('/:orgId/roster/from-wedding-vendor', loadOrgMember, requireOrgPermission('roster.manage'), validate(rosterFromWeddingVendorSchema), OrgController.rosterFromWeddingVendor);
router.post('/:orgId/roster/from-marketplace/:weddingVendorId', loadOrgMember, requireOrgPermission('roster.manage'), OrgController.rosterFromMarketplace);
router.patch('/:orgId/roster/:rosterId', loadOrgMember, requireOrgPermission('roster.manage'), validate(updateRosterSchema), OrgController.updateRoster);
router.delete('/:orgId/roster/:rosterId', loadOrgMember, requireOrgPermission('roster.manage'), OrgController.removeRoster);

// Agency templates live on /task-templates (with organizationId); this one
// builds a template from an existing client wedding's tasks.
router.post('/:orgId/templates/from-wedding/:weddingId', loadOrgMember, requireOrgPermission('templates.manage'), validate(templateFromWeddingSchema), OrgController.templateFromWedding);

router.get('/:orgId/billing', loadOrgMember, requireOrgPermission('org.billing'), OrgController.billing);
router.post('/:orgId/billing/request', loadOrgMember, requireOrgPermission('org.billing'), validate(billingRequestSchema), OrgController.requestPlan);
router.post('/:orgId/billing/pause', loadOrgMember, requireOrgPermission('org.billing'), OrgController.pausePlan);
router.post('/:orgId/billing/resume', loadOrgMember, requireOrgPermission('org.billing'), OrgController.resumePlan);
router.delete('/:orgId/billing/request', loadOrgMember, requireOrgPermission('org.billing'), OrgController.cancelPlanRequest);

export default router;
