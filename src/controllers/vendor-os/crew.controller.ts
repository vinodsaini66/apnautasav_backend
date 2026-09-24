import { Request, Response } from 'express';
import { VendorCrewService } from '../../services/vendor-os/crew.service';
import { VendorCallSheetService } from '../../services/vendor-os/call-sheet.service';
import { VendorPdfService } from '../../services/vendor-os/pdf.service';
import { ApiResponse } from '../../utils/apiResponse';
import { handle } from '../../utils/vendorOs';
import { financials, q, userIdOf, vendorIdOf } from './_context';

// Wedding-day team coordination: crew roster, assignment, call sheets and
// the event-day run sheet (spec Phase 2 "Team & crew management" +
// "Event-day timeline & run sheet").
export class VendorOsCrewController {
  // ---- roster ---------------------------------------------------------
  static listMembers = handle(async (req: Request, res: Response) => {
    const data = await VendorCrewService.listMembers(vendorIdOf(req), {
      search: q(req, 'search'),
      active: q(req, 'active'),
      skill: q(req, 'skill'),
      resourceId: q(req, 'resourceId'),
    });
    ApiResponse.success(res, 200, { data: financials(req) ? data : data.map((m: any) => ({ ...m, defaultRate: undefined })) });
  }, 'list crew');

  static createMember = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 201, { message: 'Crew member added', data: await VendorCrewService.createMember(vendorIdOf(req), req.body) });
  }, 'create crew member');

  static getMember = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorCrewService.getMember(vendorIdOf(req), req.params.memberId, financials(req)) });
  }, 'get crew member');

  static updateMember = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Crew member updated', data: await VendorCrewService.updateMember(vendorIdOf(req), req.params.memberId, req.body) });
  }, 'update crew member');

  static deactivateMember = handle(async (req: Request, res: Response) => {
    await VendorCrewService.deactivateMember(vendorIdOf(req), req.params.memberId);
    ApiResponse.success(res, 200, { message: 'Crew member deactivated' });
  }, 'deactivate crew member');

  static addUnavailability = handle(async (req: Request, res: Response) => {
    const entries = await VendorCrewService.addUnavailability(vendorIdOf(req), req.params.memberId, req.body, userIdOf(req));
    ApiResponse.success(res, 201, { message: `Marked unavailable on ${entries.length} day(s)`, data: entries });
  }, 'crew unavailability');

  static removeUnavailability = handle(async (req: Request, res: Response) => {
    await VendorCrewService.removeUnavailability(vendorIdOf(req), req.params.entryId);
    ApiResponse.success(res, 200, { message: 'Unavailability removed' });
  }, 'remove crew unavailability');

  static availability = handle(async (req: Request, res: Response) => {
    const data = await VendorCrewService.availability(vendorIdOf(req), q(req, 'date')!, (q(req, 'slot') as any) || 'full_day', q(req, 'skill'));
    ApiResponse.success(res, 200, { data });
  }, 'crew availability');

  // ---- assignments ------------------------------------------------------
  static listForEvent = handle(async (req: Request, res: Response) => {
    const { bookingId, eventId } = req.params;
    ApiResponse.success(res, 200, { data: await VendorCrewService.listForEvent(vendorIdOf(req), bookingId, eventId, financials(req)) });
  }, 'event crew');

  static assign = handle(async (req: Request, res: Response) => {
    const { bookingId, eventId } = req.params;
    const data = await VendorCrewService.assign(vendorIdOf(req), bookingId, eventId, req.body.assignments, userIdOf(req), financials(req));
    ApiResponse.success(res, 201, { message: `${data.length} crew member(s) assigned`, data });
  }, 'assign crew');

  static assignDefaultTeam = handle(async (req: Request, res: Response) => {
    const { bookingId, eventId } = req.params;
    const data = await VendorCrewService.assignDefaultTeam(vendorIdOf(req), bookingId, eventId, userIdOf(req), financials(req));
    ApiResponse.success(res, 201, {
      message: `${data.assigned.length} assigned${data.skipped.length ? `, ${data.skipped.length} skipped` : ''}`,
      data,
    });
  }, 'assign default team');

  static updateAssignment = handle(async (req: Request, res: Response) => {
    const data = await VendorCrewService.updateAssignment(vendorIdOf(req), req.params.assignmentId, req.body, financials(req));
    ApiResponse.success(res, 200, { message: 'Assignment updated', data });
  }, 'update assignment');

  static removeAssignment = handle(async (req: Request, res: Response) => {
    await VendorCrewService.removeAssignment(vendorIdOf(req), req.params.assignmentId, userIdOf(req));
    ApiResponse.success(res, 200, { message: 'Crew member removed from the event' });
  }, 'remove assignment');

  static respond = handle(async (req: Request, res: Response) => {
    const data = await VendorCrewService.respond(vendorIdOf(req), req.params.assignmentId, req.body, {
      vendorUserId: userIdOf(req),
      role: req.vendorUser!.role,
    });
    ApiResponse.success(res, 200, { message: data.status === 'confirmed' ? 'Assignment confirmed' : 'Assignment declined', data });
  }, 'respond assignment');

  static myAssignments = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorCrewService.myAssignments(vendorIdOf(req), userIdOf(req), q(req, 'from'), q(req, 'to')) });
  }, 'my assignments');

  // ---- payouts ----------------------------------------------------------
  static payouts = handle(async (req: Request, res: Response) => {
    const data = await VendorCrewService.payouts(vendorIdOf(req), {
      from: q(req, 'from'),
      to: q(req, 'to'),
      crewMemberId: q(req, 'crewMemberId'),
      status: q(req, 'status'),
    });
    ApiResponse.success(res, 200, { data });
  }, 'crew payouts');

  static markPayouts = handle(async (req: Request, res: Response) => {
    const data = await VendorCrewService.markPaid(vendorIdOf(req), req.body);
    ApiResponse.success(res, 200, { message: req.body.paid === false ? 'Marked unpaid' : 'Marked paid', data });
  }, 'mark payouts');

  // ---- call sheets --------------------------------------------------------
  static callSheet = handle(async (req: Request, res: Response) => {
    const { bookingId, eventId } = req.params;
    ApiResponse.success(res, 200, { data: await VendorCallSheetService.buildCallSheet(vendorIdOf(req), bookingId, eventId) });
  }, 'call sheet');

  static callSheetPdf = handle(async (req: Request, res: Response) => {
    const { bookingId, eventId } = req.params;
    const sheet = await VendorCallSheetService.buildCallSheet(vendorIdOf(req), bookingId, eventId);
    const buffer = await VendorPdfService.callSheet(sheet as any);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="call-sheet-${sheet.booking.bookingNumber}-${sheet.event.date}.pdf"`);
    res.send(buffer);
  }, 'call sheet pdf');

  static shareCallSheet = handle(async (req: Request, res: Response) => {
    const { bookingId, eventId } = req.params;
    const data = await VendorCallSheetService.shareCallSheet(vendorIdOf(req), bookingId, eventId, userIdOf(req), req.body || {});
    ApiResponse.success(res, 200, { message: `Call sheet ready for ${data.messages.length} crew member(s)`, data });
  }, 'share call sheet');

  static daySheet = handle(async (req: Request, res: Response) => {
    const crewUser = req.vendorUser!.role === 'crew' ? userIdOf(req) : undefined;
    ApiResponse.success(res, 200, { data: await VendorCallSheetService.daySheet(vendorIdOf(req), q(req, 'date')!, crewUser) });
  }, 'day sheet');

  // ---- run sheet ----------------------------------------------------------
  static getRunSheet = handle(async (req: Request, res: Response) => {
    const { bookingId, eventId } = req.params;
    const sheet = await VendorCallSheetService.getRunSheet(vendorIdOf(req), bookingId, eventId);
    ApiResponse.success(res, 200, { data: sheet });
  }, 'get run sheet');

  static runSheetTemplate = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: VendorCallSheetService.templateFor(req.params.functionType) });
  }, 'run sheet template');

  static saveRunSheet = handle(async (req: Request, res: Response) => {
    const { bookingId, eventId } = req.params;
    const data = await VendorCallSheetService.saveRunSheet(vendorIdOf(req), bookingId, eventId, req.body, userIdOf(req));
    ApiResponse.success(res, 200, { message: 'Run sheet saved', data });
  }, 'save run sheet');

  static updateRunSheetItem = handle(async (req: Request, res: Response) => {
    const { bookingId, eventId, itemId } = req.params;
    const data = await VendorCallSheetService.updateItemStatus(vendorIdOf(req), bookingId, eventId, itemId, req.body.status);
    ApiResponse.success(res, 200, { data });
  }, 'run sheet item status');

  static deleteRunSheet = handle(async (req: Request, res: Response) => {
    const { bookingId, eventId } = req.params;
    await VendorCallSheetService.deleteRunSheet(vendorIdOf(req), bookingId, eventId);
    ApiResponse.success(res, 200, { message: 'Run sheet deleted' });
  }, 'delete run sheet');

  static shareRunSheet = handle(async (req: Request, res: Response) => {
    const { bookingId, eventId } = req.params;
    const data = await VendorCallSheetService.shareRunSheet(vendorIdOf(req), bookingId, eventId, userIdOf(req), req.body?.language);
    ApiResponse.success(res, 200, { message: 'Schedule ready to share with the client', data });
  }, 'share run sheet');
}
