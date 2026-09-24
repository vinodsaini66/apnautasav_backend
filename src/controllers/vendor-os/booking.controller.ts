import { Request, Response } from 'express';
import { VendorBookingService } from '../../services/vendor-os/booking.service';
import { VendorPaymentService } from '../../services/vendor-os/payment.service';
import { VendorWhatsAppService } from '../../services/vendor-os/whatsapp.service';
import { VendorPdfService } from '../../services/vendor-os/pdf.service';
import { VendorBooking } from '../../models/vendor-os/vendor-booking.model';
import { WeddingVendor } from '../../models/wedding-vendor.model';
import { ApiResponse } from '../../utils/apiResponse';
import { VENDOR_OS_PUBLIC_URL, handle, parsePagination } from '../../utils/vendorOs';
import { financials, q, userIdOf, vendorIdOf } from './_context';

export class VendorOsBookingController {
  static list = handle(async (req: Request, res: Response) => {
    const { page, limit, skip } = parsePagination(req.query);
    const { items, total, statusCounts } = await VendorBookingService.list(
      vendorIdOf(req),
      {
        status: q(req, 'status'),
        from: q(req, 'from'),
        to: q(req, 'to'),
        search: q(req, 'search'),
        clientId: q(req, 'clientId'),
        when: q(req, 'when') as 'upcoming' | 'past' | undefined,
        balance: q(req, 'balance') as 'due' | 'cleared' | undefined,
        sort: q(req, 'sort') as any,
        skip,
        limit,
      },
      financials(req)
    );
    res.status(200).json({
      status: 'success',
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page * limit < total, statusCounts },
    });
  }, 'list bookings');

  static create = handle(async (req: Request, res: Response) => {
    const body = financials(req) ? req.body : { ...req.body, totalAmount: undefined, paymentSchedule: undefined };
    const result = await VendorBookingService.create(vendorIdOf(req), body, userIdOf(req));
    ApiResponse.success(res, 201, {
      message: result.unallocatedEvents
        ? `Booking created — ${result.unallocatedEvents} event(s) still need a resource`
        : 'Booking created',
      data: result,
    });
  }, 'create booking');

  static get = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorBookingService.get(vendorIdOf(req), req.params.bookingId, financials(req)) });
  }, 'get booking');

  static update = handle(async (req: Request, res: Response) => {
    const result = await VendorBookingService.update(vendorIdOf(req), req.params.bookingId, req.body, userIdOf(req), financials(req));
    ApiResponse.success(res, 200, { message: 'Booking updated', data: result });
  }, 'update booking');

  static changeStatus = handle(async (req: Request, res: Response) => {
    const booking = await VendorBookingService.changeStatus(vendorIdOf(req), req.params.bookingId, req.body, userIdOf(req));
    ApiResponse.success(res, 200, { message: `Booking ${booking.status}`, data: booking });
  }, 'booking status');

  // ---- money (owner/manager only — enforced in routes) ----------------
  static listBookingPayments = handle(async (req: Request, res: Response) => {
    const { page, limit, skip } = parsePagination(req.query, 50);
    const result = await VendorPaymentService.list(vendorIdOf(req), { bookingId: req.params.bookingId, includeVoided: true, skip, limit });
    ApiResponse.success(res, 200, { data: result.items, meta: { total: result.total, totalAmount: result.totalAmount, page, limit } });
  }, 'booking payments');

  static recordPayment = handle(async (req: Request, res: Response) => {
    const vendorId = vendorIdOf(req);
    const result = await VendorPaymentService.record(vendorId, req.params.bookingId, req.body, userIdOf(req));
    const whatsapp = await VendorWhatsAppService.compose(vendorId, userIdOf(req), {
      templateKey: 'payment_receipt',
      paymentId: String(result.payment._id),
      log: false,
    });
    ApiResponse.success(res, 201, {
      message: `Payment recorded — receipt ${result.payment.receiptNo}`,
      data: { ...result, receiptUrl: `${VENDOR_OS_PUBLIC_URL}/r/${result.payment.publicToken}`, whatsapp },
    });
  }, 'record payment');

  static sendReminder = handle(async (req: Request, res: Response) => {
    const whatsapp = await VendorWhatsAppService.compose(vendorIdOf(req), userIdOf(req), {
      templateKey: 'payment_reminder',
      bookingId: req.params.bookingId,
      milestoneId: req.body?.milestoneId,
      language: req.body?.language,
    });
    ApiResponse.success(res, 200, { message: 'Reminder ready to send', data: whatsapp });
  }, 'payment reminder');

  static listPayments = handle(async (req: Request, res: Response) => {
    const { page, limit, skip } = parsePagination(req.query, 50);
    const result = await VendorPaymentService.list(vendorIdOf(req), {
      from: q(req, 'from'),
      to: q(req, 'to'),
      mode: q(req, 'mode'),
      includeVoided: q(req, 'includeVoided') === 'true',
      skip,
      limit,
    });
    res.status(200).json({
      status: 'success',
      data: result.items,
      meta: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit), hasMore: page * limit < result.total, totalAmount: result.totalAmount },
    });
  }, 'list payments');

  static dues = handle(async (req: Request, res: Response) => {
    const bucket = (q(req, 'bucket') as any) || 'week';
    ApiResponse.success(res, 200, { data: await VendorPaymentService.dues(vendorIdOf(req), bucket) });
  }, 'payment dues');

  static voidPayment = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Payment voided', data: await VendorPaymentService.void(vendorIdOf(req), req.params.paymentId, req.body.reason, userIdOf(req)) });
  }, 'void payment');

  static receiptPdf = handle(async (req: Request, res: Response) => {
    const vendorId = vendorIdOf(req);
    const payment = await VendorPaymentService.getOwned(vendorId, req.params.paymentId);
    const [booking, vendor] = await Promise.all([
      VendorBooking.findById(payment.bookingId),
      WeddingVendor.findById(vendorId).select('businessName phone whatsappNumber email gstNumber location').lean(),
    ]);
    const buffer = await VendorPdfService.receipt(payment, booking!, vendor as any);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${payment.receiptNo}.pdf"`);
    res.send(buffer);
  }, 'receipt pdf');

  static shareReceipt = handle(async (req: Request, res: Response) => {
    const whatsapp = await VendorWhatsAppService.compose(vendorIdOf(req), userIdOf(req), {
      templateKey: 'payment_receipt',
      paymentId: req.params.paymentId,
      language: req.body?.language,
    });
    ApiResponse.success(res, 200, { data: whatsapp });
  }, 'share receipt');
}
