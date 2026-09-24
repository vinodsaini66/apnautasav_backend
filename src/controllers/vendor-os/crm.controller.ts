import { Request, Response } from 'express';
import { VendorLeadService } from '../../services/vendor-os/lead.service';
import { VendorClientService } from '../../services/vendor-os/client.service';
import { ApiResponse } from '../../utils/apiResponse';
import { handle, parsePagination } from '../../utils/vendorOs';
import { financials, q, userIdOf, vendorIdOf } from './_context';

export class VendorOsCrmController {
  // ---- leads ----------------------------------------------------------
  static listLeads = handle(async (req: Request, res: Response) => {
    const { page, limit, skip } = parsePagination(req.query);
    const { items, total, pipeline, overdueFollowUps } = await VendorLeadService.list(vendorIdOf(req), {
      status: q(req, 'status'),
      source: q(req, 'source'),
      search: q(req, 'search'),
      assignedTo: q(req, 'assignedTo'),
      followUp: q(req, 'followUp') as any,
      sort: q(req, 'sort') as any,
      weddingFrom: q(req, 'weddingFrom'),
      weddingTo: q(req, 'weddingTo'),
      skip,
      limit,
    });
    res.status(200).json({
      status: 'success',
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page * limit < total, pipeline, overdueFollowUps },
    });
  }, 'list leads');

  static createLead = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 201, { message: 'Lead added', data: await VendorLeadService.create(vendorIdOf(req), req.body, userIdOf(req)) });
  }, 'create lead');

  static getLead = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorLeadService.get(vendorIdOf(req), req.params.leadId, financials(req)) });
  }, 'get lead');

  static updateLead = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Lead updated', data: await VendorLeadService.update(vendorIdOf(req), req.params.leadId, req.body) });
  }, 'update lead');

  static changeLeadStatus = handle(async (req: Request, res: Response) => {
    const lead = await VendorLeadService.changeStatus(vendorIdOf(req), req.params.leadId, req.body, userIdOf(req));
    ApiResponse.success(res, 200, { message: `Lead moved to ${lead.status}`, data: lead });
  }, 'lead status');

  static addLeadNote = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 201, { message: 'Added to timeline', data: await VendorLeadService.addNote(vendorIdOf(req), req.params.leadId, req.body, userIdOf(req)) });
  }, 'lead note');

  static setFollowUp = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Follow-up saved', data: await VendorLeadService.setFollowUp(vendorIdOf(req), req.params.leadId, req.body, userIdOf(req)) });
  }, 'lead follow-up');

  static leadAvailability = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorLeadService.availability(vendorIdOf(req), req.params.leadId) });
  }, 'lead availability');

  static deleteLead = handle(async (req: Request, res: Response) => {
    await VendorLeadService.remove(vendorIdOf(req), req.params.leadId);
    ApiResponse.success(res, 200, { message: 'Lead deleted' });
  }, 'delete lead');

  // ---- clients --------------------------------------------------------
  static listClients = handle(async (req: Request, res: Response) => {
    const { page, limit, skip } = parsePagination(req.query);
    const { items, total } = await VendorClientService.list(vendorIdOf(req), { search: q(req, 'search'), skip, limit });
    ApiResponse.paginated(res, items, page, limit, total);
  }, 'list clients');

  static createClient = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 201, { message: 'Client added', data: await VendorClientService.create(vendorIdOf(req), req.body) });
  }, 'create client');

  static getClient = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorClientService.get(vendorIdOf(req), req.params.clientId, financials(req)) });
  }, 'get client');

  static updateClient = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Client updated', data: await VendorClientService.update(vendorIdOf(req), req.params.clientId, req.body) });
  }, 'update client');
}
