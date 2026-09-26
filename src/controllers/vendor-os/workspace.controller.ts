import { Request, Response } from 'express';
import { VendorWhatsAppService } from '../../services/vendor-os/whatsapp.service';
import { VendorInsightsService } from '../../services/vendor-os/insights.service';
import { VendorTeamService } from '../../services/vendor-os/team.service';
import { ApiResponse } from '../../utils/apiResponse';
import { handle } from '../../utils/vendorOs';
import { financials, q, userIdOf, vendorIdOf } from './_context';

// Dashboard, reports, export, notifications, WhatsApp and team.
export class VendorOsWorkspaceController {
  static dashboard = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorInsightsService.dashboard(vendorIdOf(req), userIdOf(req), financials(req)) });
  }, 'dashboard');

  static sourceConversion = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, {
      data: await VendorInsightsService.sourceConversion(vendorIdOf(req), q(req, 'from'), q(req, 'to'), financials(req)),
    });
  }, 'source conversion');

  static exportCsv = handle(async (req: Request, res: Response) => {
    const { filename, csv } = await VendorInsightsService.exportCsv(vendorIdOf(req), req.params.entity, financials(req));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csv); // BOM so Excel opens Hindi names correctly
  }, 'export');

  // ---- notifications --------------------------------------------------
  static listNotifications = handle(async (req: Request, res: Response) => {
    const result = await VendorInsightsService.listNotifications(vendorIdOf(req), userIdOf(req), req.query);
    res.status(200).json({
      status: 'success',
      data: result.items,
      meta: { page: result.page, limit: result.limit, total: result.total, unread: result.unread, hasMore: result.page * result.limit < result.total },
    });
  }, 'list notifications');

  static markNotificationRead = handle(async (req: Request, res: Response) => {
    await VendorInsightsService.markRead(vendorIdOf(req), userIdOf(req), req.params.notificationId);
    ApiResponse.success(res, 200, { message: 'Marked as read' });
  }, 'mark notification read');

  static markAllNotificationsRead = handle(async (req: Request, res: Response) => {
    await VendorInsightsService.markRead(vendorIdOf(req), userIdOf(req));
    ApiResponse.success(res, 200, { message: 'All notifications marked as read' });
  }, 'mark all notifications read');

  // ---- WhatsApp -------------------------------------------------------
  static compose = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorWhatsAppService.compose(vendorIdOf(req), userIdOf(req), req.body, financials(req)) });
  }, 'whatsapp compose');

  static listMessageTemplates = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorWhatsAppService.listTemplates(vendorIdOf(req), q(req, 'type')) });
  }, 'list message templates');

  static messageVariables = handle(async (_req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: VendorWhatsAppService.variables() });
  }, 'message variables');

  static previewMessageTemplate = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorWhatsAppService.preview(vendorIdOf(req), userIdOf(req), req.body, financials(req)) });
  }, 'preview message template');

  static createMessageTemplate = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 201, { message: 'Template saved', data: await VendorWhatsAppService.createTemplate(vendorIdOf(req), req.body) });
  }, 'create message template');

  static updateMessageTemplate = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Template saved', data: await VendorWhatsAppService.updateTemplate(vendorIdOf(req), req.params.templateId, req.body) });
  }, 'update message template');

  static deleteMessageTemplate = handle(async (req: Request, res: Response) => {
    await VendorWhatsAppService.deleteTemplate(vendorIdOf(req), req.params.templateId);
    ApiResponse.success(res, 200, { message: 'Template deleted' });
  }, 'delete message template');

  // ---- team -----------------------------------------------------------
  static listTeam = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorTeamService.list(vendorIdOf(req)) });
  }, 'list team');

  static inviteMember = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 201, { message: 'Team member added — they can log in with their phone', data: await VendorTeamService.invite(vendorIdOf(req), req.body, userIdOf(req)) });
  }, 'invite member');

  static updateMember = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Team member updated', data: await VendorTeamService.update(vendorIdOf(req), req.params.memberId, req.body, userIdOf(req)) });
  }, 'update member');

  static reinviteMember = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorTeamService.reinvite(vendorIdOf(req), req.params.memberId) });
  }, 'reinvite member');

  static removeMember = handle(async (req: Request, res: Response) => {
    await VendorTeamService.remove(vendorIdOf(req), req.params.memberId, userIdOf(req));
    ApiResponse.success(res, 200, { message: 'Team member removed' });
  }, 'remove member');
}
