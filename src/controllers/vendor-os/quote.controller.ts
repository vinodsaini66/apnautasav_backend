import { Request, Response } from 'express';
import { VendorQuoteService, quotePublicUrl } from '../../services/vendor-os/quote.service';
import { VendorWhatsAppService } from '../../services/vendor-os/whatsapp.service';
import { VendorPdfService } from '../../services/vendor-os/pdf.service';
import { WeddingVendor } from '../../models/wedding-vendor.model';
import { VendorClient } from '../../models/vendor-os/vendor-client.model';
import { ApiResponse } from '../../utils/apiResponse';
import { handle, parsePagination } from '../../utils/vendorOs';
import { q, userIdOf, vendorIdOf } from './_context';

export class VendorOsQuoteController {
  static list = handle(async (req: Request, res: Response) => {
    const { page, limit, skip } = parsePagination(req.query);
    const { items, total } = await VendorQuoteService.list(vendorIdOf(req), {
      status: q(req, 'status'),
      leadId: q(req, 'leadId'),
      clientId: q(req, 'clientId'),
      search: q(req, 'search'),
      skip,
      limit,
    });
    ApiResponse.paginated(res, items, page, limit, total);
  }, 'list quotes');

  static create = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 201, { message: 'Quote drafted', data: await VendorQuoteService.create(vendorIdOf(req), req.body, userIdOf(req)) });
  }, 'create quote');

  static get = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorQuoteService.get(vendorIdOf(req), req.params.quoteId) });
  }, 'get quote');

  static update = handle(async (req: Request, res: Response) => {
    const quote = await VendorQuoteService.update(vendorIdOf(req), req.params.quoteId, req.body, userIdOf(req));
    ApiResponse.success(res, 200, { message: quote.version > 1 ? `Quote revised (v${quote.version})` : 'Quote updated', data: quote });
  }, 'update quote');

  static remove = handle(async (req: Request, res: Response) => {
    await VendorQuoteService.remove(vendorIdOf(req), req.params.quoteId);
    ApiResponse.success(res, 200, { message: 'Quote deleted' });
  }, 'delete quote');

  static duplicate = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 201, { message: 'Quote duplicated', data: await VendorQuoteService.duplicate(vendorIdOf(req), req.params.quoteId, userIdOf(req)) });
  }, 'duplicate quote');

  /**
   * Marks the quote sent and returns the public link plus a ready WhatsApp
   * deep link (spec M4: "share via WhatsApp / ApnaUtsav in one tap"). The
   * family also sees it in their ApnaUtsav account if they came from there.
   */
  static send = handle(async (req: Request, res: Response) => {
    const vendorId = vendorIdOf(req);
    const { quote, publicUrl } = await VendorQuoteService.markSent(vendorId, req.params.quoteId, userIdOf(req));
    const whatsapp = await VendorWhatsAppService.compose(vendorId, userIdOf(req), {
      templateKey: 'quote_share',
      language: req.body?.language,
      quoteId: String(quote._id),
    });
    ApiResponse.success(res, 200, {
      message: 'Quote sent',
      data: { quote, publicUrl, pdfUrl: `/vendor-os/public/quotes/${quote.publicToken}/pdf`, whatsapp },
    });
  }, 'send quote');

  static setStatus = handle(async (req: Request, res: Response) => {
    const quote = await VendorQuoteService.getOwned(vendorIdOf(req), req.params.quoteId);
    if (req.body.status === 'accepted') {
      const result = await VendorQuoteService.accept(quote, userIdOf(req));
      ApiResponse.success(res, 200, { message: `Accepted — tentative booking ${result.booking.bookingNumber} created`, data: result });
      return;
    }
    ApiResponse.success(res, 200, { message: 'Quote marked declined', data: await VendorQuoteService.decline(quote, req.body.reason, userIdOf(req)) });
  }, 'quote status');

  static pdf = handle(async (req: Request, res: Response) => {
    const vendorId = vendorIdOf(req);
    const quote = await VendorQuoteService.getOwned(vendorId, req.params.quoteId);
    const [vendor, client] = await Promise.all([
      WeddingVendor.findById(vendorId).select('businessName phone whatsappNumber email gstNumber location').lean(),
      VendorClient.findById(quote.clientId).select('name phone email').lean(),
    ]);
    const buffer = await VendorPdfService.quote(quote, vendor as any, client as any);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${quote.quoteNumber}.pdf"`);
    res.send(buffer);
  }, 'quote pdf');

  static link = handle(async (req: Request, res: Response) => {
    const quote = await VendorQuoteService.getOwned(vendorIdOf(req), req.params.quoteId);
    ApiResponse.success(res, 200, { data: { publicUrl: quotePublicUrl(quote.publicToken), token: quote.publicToken } });
  }, 'quote link');

  static saveAsTemplate = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 201, { message: 'Saved as template', data: await VendorQuoteService.saveAsTemplate(vendorIdOf(req), req.params.quoteId, req.body.name) });
  }, 'save quote template');

  // ---- templates ------------------------------------------------------
  static listTemplates = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorQuoteService.listTemplates(vendorIdOf(req), q(req, 'all') === 'true') });
  }, 'list quote templates');

  static createTemplate = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 201, { message: 'Template saved', data: await VendorQuoteService.createTemplate(vendorIdOf(req), req.body) });
  }, 'create quote template');

  static updateTemplate = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Template updated', data: await VendorQuoteService.updateTemplate(vendorIdOf(req), req.params.templateId, req.body) });
  }, 'update quote template');

  static deleteTemplate = handle(async (req: Request, res: Response) => {
    await VendorQuoteService.deleteTemplate(vendorIdOf(req), req.params.templateId);
    ApiResponse.success(res, 200, { message: 'Template deleted' });
  }, 'delete quote template');
}
