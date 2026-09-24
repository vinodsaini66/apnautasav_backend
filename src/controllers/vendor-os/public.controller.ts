import { Request, Response } from 'express';
import { PublicVendorOsService } from '../../services/vendor-os/public.service';
import { FamilyBindingService } from '../../services/vendor-os/family-binding.service';
import { VendorPdfService } from '../../services/vendor-os/pdf.service';
import { WeddingVendorService } from '../../services/wedding-vendor.service';
import { VendorCallSheetService } from '../../services/vendor-os/call-sheet.service';
import { ApiResponse } from '../../utils/apiResponse';
import { handle } from '../../utils/vendorOs';
import { q } from './_context';

// Unauthenticated (or family-authenticated) endpoints: the public profile's
// live availability, quote/receipt links shared on WhatsApp, and the
// family app's "my quotes / my vendor bookings" views.
export class VendorOsPublicController {
  static availability = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await PublicVendorOsService.availability(req.params.vendorId, q(req, 'from'), q(req, 'to')) });
  }, 'public availability');

  static packages = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await PublicVendorOsService.packages(req.params.vendorId) });
  }, 'public packages');

  static whatsappClick = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await PublicVendorOsService.whatsappClick(req.params.vendorId, req.body, req.user?.userId) });
  }, 'whatsapp click');

  static getQuote = handle(async (req: Request, res: Response) => {
    // ?preview=1 lets the vendor open their own link without it counting as "viewed".
    const data = await PublicVendorOsService.getQuoteByToken(req.params.token, q(req, 'preview') !== '1');
    ApiResponse.success(res, 200, { data });
  }, 'public quote');

  static acceptQuote = handle(async (req: Request, res: Response) => {
    const data = await PublicVendorOsService.actOnQuote(req.params.token, 'accept', undefined, req.user?.userId);
    ApiResponse.success(res, 200, { message: 'Quote accepted — the vendor has been notified', data });
  }, 'accept quote');

  static declineQuote = handle(async (req: Request, res: Response) => {
    const data = await PublicVendorOsService.actOnQuote(req.params.token, 'decline', req.body?.reason, req.user?.userId);
    ApiResponse.success(res, 200, { message: 'Quote declined', data });
  }, 'decline quote');

  static quotePdf = handle(async (req: Request, res: Response) => {
    const { quote, vendor, client } = await PublicVendorOsService.loadQuotePdfData(req.params.token);
    const buffer = await VendorPdfService.quote(quote, vendor as any, client as any);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${quote.quoteNumber}.pdf"`);
    res.send(buffer);
  }, 'public quote pdf');

  static getReceipt = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await PublicVendorOsService.getReceiptByToken(req.params.token) });
  }, 'public receipt');

  static receiptPdf = handle(async (req: Request, res: Response) => {
    const { payment, booking, vendor } = await PublicVendorOsService.loadReceiptPdfData(req.params.token);
    const buffer = await VendorPdfService.receipt(payment, booking, vendor as any);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${payment.receiptNo}.pdf"`);
    res.send(buffer);
  }, 'public receipt pdf');

  static runSheet = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorCallSheetService.publicRunSheet(req.params.token) });
  }, 'public run sheet');

  // ---- family (family-app JWT) ------------------------------------------
  static familyQuotes = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await FamilyBindingService.listFamilyQuotes(req.user!.userId, q(req, 'weddingId')) });
  }, 'family quotes');

  static familyBookings = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await FamilyBindingService.listFamilyBookings(req.user!.userId, q(req, 'weddingId')) });
  }, 'family bookings');

  static familyRunSheets = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorCallSheetService.familyRunSheets(req.user!.userId, q(req, 'weddingId')) });
  }, 'family run sheets');

  /**
   * "Shortlist 3 photographers → send one enquiry to all" (spec section 7).
   * Each becomes a marketplace inquiry, which in turn lands as a lead in
   * that vendor's Vendor OS inbox.
   */
  static bulkEnquiry = handle(async (req: Request, res: Response) => {
    const { vendorIds, weddingId, ...details } = req.body;
    const results = await Promise.allSettled(
      (vendorIds as string[]).map((id) => WeddingVendorService.createInquiry(id, req.user!.userId, { ...details, weddingId }))
    );
    const sent = results.filter((r) => r.status === 'fulfilled').length;
    ApiResponse.success(res, 201, {
      message: `Enquiry sent to ${sent} of ${vendorIds.length} vendors`,
      data: results.map((r, i) => ({ vendorId: vendorIds[i], ok: r.status === 'fulfilled', error: r.status === 'rejected' ? (r.reason as Error).message : undefined })),
    });
  }, 'bulk enquiry');
}
