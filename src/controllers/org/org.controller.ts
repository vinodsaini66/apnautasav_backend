import { Request, Response } from 'express';
import { ApiResponse } from '../../utils/apiResponse';
import { handle } from '../../utils/org';
import { OrgService } from '../../services/org/org.service';
import { OrgMemberService } from '../../services/org/org-member.service';
import { OrgWeddingService } from '../../services/org/org-wedding.service';
import { OrgBillingService } from '../../services/org/org-billing.service';
import { OrgRosterService } from '../../services/org/org-roster.service';
import { OrgTemplateService } from '../../services/org/org-template.service';

// Track C planner organizations (/orgs). Routes under /orgs/:orgId run
// loadOrgMember first, so `req.orgMembership` is the caller's verified
// membership of exactly that org.
const userIdOf = (req: Request) => req.user!.userId;
const membershipOf = (req: Request) => req.orgMembership!;
const q = (req: Request, key: string) => {
  const v = req.query[key];
  return typeof v === 'string' && v.length ? v : undefined;
};

export class OrgController {
  // ---- organizations ------------------------------------------------------
  static create = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 201, { message: 'Agency created', data: await OrgService.create(userIdOf(req), req.body) });
  }, 'create');

  static listMine = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await OrgService.listMine(userIdOf(req)) });
  }, 'list mine');

  static get = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: OrgService.get(membershipOf(req)) });
  }, 'get');

  static update = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Saved', data: await OrgService.update(membershipOf(req), req.body) });
  }, 'update');

  static uploadLogo = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Logo updated', data: await OrgService.uploadLogo(membershipOf(req), req.file) });
  }, 'upload logo');

  static removeLogo = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Logo removed', data: await OrgService.removeLogo(membershipOf(req)) });
  }, 'remove logo');

  // ---- team ---------------------------------------------------------------
  static listMembers = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await OrgMemberService.list(membershipOf(req)) });
  }, 'list members');

  static inviteMember = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 201, { message: 'Invite sent', data: await OrgMemberService.invite(membershipOf(req), req.body) });
  }, 'invite member');

  static resendInvite = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Invite resent', data: await OrgMemberService.resendInvite(membershipOf(req), req.params.memberId) });
  }, 'resend invite');

  static updateMember = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Saved', data: await OrgMemberService.update(membershipOf(req), req.params.memberId, req.body) });
  }, 'update member');

  static removeMember = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Removed', data: await OrgMemberService.remove(membershipOf(req), req.params.memberId) });
  }, 'remove member');

  // ---- invites (the invitee's side) ------------------------------------------
  static myInvites = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await OrgMemberService.myInvites(userIdOf(req)) });
  }, 'my invites');

  static previewInvite = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await OrgMemberService.previewToken(req.params.token) });
  }, 'preview invite');

  static acceptInviteToken = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Welcome to the team', data: await OrgMemberService.acceptToken(userIdOf(req), req.params.token) });
  }, 'accept invite');

  static acceptInvite = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Welcome to the team', data: await OrgMemberService.acceptById(userIdOf(req), req.params.memberId) });
  }, 'accept invite');

  static declineInvite = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Invite declined', data: await OrgMemberService.decline(userIdOf(req), req.params.memberId) });
  }, 'decline invite');

  // ---- weddings -----------------------------------------------------------
  static portfolio = handle(async (req: Request, res: Response) => {
    const data = await OrgWeddingService.portfolio(membershipOf(req), {
      status: q(req, 'status'),
      month: q(req, 'month'),
      assignee: q(req, 'assignee'),
      q: q(req, 'q'),
    });
    ApiResponse.success(res, 200, { data });
  }, 'portfolio');

  static dashboard = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await OrgWeddingService.dashboard(membershipOf(req)) });
  }, 'dashboard');

  static setAssignees = handle(async (req: Request, res: Response) => {
    const data = await OrgWeddingService.setAssignees(membershipOf(req), req.params.weddingId, req.body.assignees);
    ApiResponse.success(res, 200, { message: 'Team updated', data });
  }, 'set assignees');

  static setArchived = handle(async (req: Request, res: Response) => {
    const data = await OrgWeddingService.setArchived(membershipOf(req), req.params.weddingId, req.body.archived);
    ApiResponse.success(res, 200, { message: req.body.archived ? 'Wedding archived' : 'Wedding restored', data });
  }, 'archive');

  static transferToClient = handle(async (req: Request, res: Response) => {
    const data = await OrgWeddingService.transferToClient(membershipOf(req), req.params.weddingId, req.body.clientUserId);
    ApiResponse.success(res, 200, { message: 'Wedding handed over to the family', data });
  }, 'transfer');

  // ---- vendor roster ------------------------------------------------------
  static listRoster = handle(async (req: Request, res: Response) => {
    const data = await OrgRosterService.list(membershipOf(req), { q: q(req, 'q'), category: q(req, 'category'), archived: q(req, 'archived') });
    ApiResponse.success(res, 200, { data });
  }, 'list roster');

  static createRoster = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 201, { message: 'Added to your roster', data: await OrgRosterService.create(membershipOf(req), req.body) });
  }, 'create roster');

  static updateRoster = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Saved', data: await OrgRosterService.update(membershipOf(req), req.params.rosterId, req.body) });
  }, 'update roster');

  static removeRoster = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Removed', data: await OrgRosterService.remove(membershipOf(req), req.params.rosterId) });
  }, 'remove roster');

  static pushRoster = handle(async (req: Request, res: Response) => {
    const data = await OrgRosterService.pushToWedding(membershipOf(req), req.body);
    ApiResponse.success(res, 200, { message: `Added ${data.added} vendor${data.added === 1 ? '' : 's'} to the wedding`, data });
  }, 'push roster');

  static rosterFromWeddingVendor = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 201, { message: 'Saved to your roster', data: await OrgRosterService.fromWeddingVendor(membershipOf(req), req.body) });
  }, 'roster from wedding vendor');

  static rosterFromMarketplace = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 201, { message: 'Saved to your roster', data: await OrgRosterService.fromMarketplace(membershipOf(req), req.params.weddingVendorId) });
  }, 'roster from marketplace');

  static importRoster = handle(async (req: Request, res: Response) => {
    const data = await OrgRosterService.importRows(membershipOf(req), req.body.rows, req.body.dryRun === true);
    ApiResponse.success(res, 200, { message: data.dryRun ? 'Checked' : `Imported ${data.created} vendor${data.created === 1 ? '' : 's'}`, data });
  }, 'import roster');

  // ---- agency templates ---------------------------------------------------
  static templateFromWedding = handle(async (req: Request, res: Response) => {
    const data = await OrgTemplateService.fromWedding(membershipOf(req), req.params.weddingId, req.body);
    ApiResponse.success(res, 201, { message: 'Saved as a template', data });
  }, 'template from wedding');

  // ---- billing ------------------------------------------------------------
  static billing = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await OrgBillingService.get(membershipOf(req)) });
  }, 'billing');

  static requestPlan = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Request sent', data: await OrgBillingService.request(membershipOf(req), req.body) });
  }, 'request plan');

  static pausePlan = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Plan paused', data: await OrgBillingService.pause(membershipOf(req)) });
  }, 'pause plan');

  static resumePlan = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Welcome back', data: await OrgBillingService.resume(membershipOf(req)) });
  }, 'resume plan');

  static cancelPlanRequest = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Request withdrawn', data: await OrgBillingService.cancelRequest(membershipOf(req)) });
  }, 'cancel plan request');
}

/** ApnaUtsav staff (User.role === 'admin') managing agencies and manual billing. */
export class AdminOrgController {
  static list = handle(async (req: Request, res: Response) => {
    const data = await OrgBillingService.adminList({
      q: q(req, 'q'),
      status: q(req, 'status'),
      planStatus: q(req, 'planStatus'),
      requests: q(req, 'requests'),
    });
    ApiResponse.success(res, 200, { data });
  }, 'admin list');

  static create = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 201, { message: 'Agency created', data: await OrgBillingService.adminCreate(userIdOf(req), req.body) });
  }, 'admin create');

  static setPlan = handle(async (req: Request, res: Response) => {
    const data = await OrgBillingService.adminSetPlan(userIdOf(req), req.params.orgId, req.body);
    ApiResponse.success(res, 200, { message: 'Payment recorded and plan activated', data });
  }, 'admin set plan');

  static setStatus = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Saved', data: await OrgBillingService.adminSetStatus(req.params.orgId, req.body) });
  }, 'admin set status');
}
