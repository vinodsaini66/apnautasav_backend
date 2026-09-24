import { Request, Response } from 'express';
import { CalendarService } from '../../services/vendor-os/calendar.service';
import { VendorBookingService } from '../../services/vendor-os/booking.service';
import { ApiResponse } from '../../utils/apiResponse';
import { handle } from '../../utils/vendorOs';
import { q, userIdOf, vendorIdOf } from './_context';

export class VendorOsCalendarController {
  static listResources = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await CalendarService.listResources(vendorIdOf(req), q(req, 'includeInactive') === 'true') });
  }, 'list resources');

  static createResource = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 201, { message: 'Resource added', data: await CalendarService.createResource(vendorIdOf(req), req.body) });
  }, 'create resource');

  static updateResource = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Resource updated', data: await CalendarService.updateResource(vendorIdOf(req), req.params.resourceId, req.body) });
  }, 'update resource');

  static deleteResource = handle(async (req: Request, res: Response) => {
    await CalendarService.deleteResource(vendorIdOf(req), req.params.resourceId);
    ApiResponse.success(res, 200, { message: 'Resource removed' });
  }, 'delete resource');

  static calendar = handle(async (req: Request, res: Response) => {
    const data = await CalendarService.getCalendar(vendorIdOf(req), {
      from: q(req, 'from'),
      to: q(req, 'to'),
      resourceId: q(req, 'resourceId'),
      crewMemberId: req.vendorUser!.role === 'crew' ? userIdOf(req) : undefined,
    });
    ApiResponse.success(res, 200, { data });
  }, 'calendar');

  static availability = handle(async (req: Request, res: Response) => {
    const dates = (q(req, 'dates') || '').split(',').map((d) => d.trim()).filter(Boolean).slice(0, 31);
    ApiResponse.success(res, 200, { data: await CalendarService.availabilityForDates(vendorIdOf(req), dates) });
  }, 'availability');

  /** Dry run of the conflict engine for a booking form, before saving. */
  static check = handle(async (req: Request, res: Response) => {
    const vendorId = vendorIdOf(req);
    const events = VendorBookingService.toEvents(req.body.events);
    const specs = await CalendarService.buildSpecs(vendorId, events);
    const result = await CalendarService.checkConflicts(vendorId, specs, req.body.excludeBookingId);
    ApiResponse.success(res, 200, { data: { ok: result.conflicts.length === 0, ...result } });
  }, 'conflict check');

  static createBlock = handle(async (req: Request, res: Response) => {
    const blocks = await CalendarService.createManualBlocks(vendorIdOf(req), req.body, userIdOf(req));
    ApiResponse.success(res, 201, { message: `${blocks.length} slot(s) blocked`, data: blocks });
  }, 'create block');

  static deleteBlock = handle(async (req: Request, res: Response) => {
    await CalendarService.deleteManualBlock(vendorIdOf(req), req.params.blockId);
    ApiResponse.success(res, 200, { message: 'Block removed' });
  }, 'delete block');
}
