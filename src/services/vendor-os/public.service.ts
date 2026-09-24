import mongoose from 'mongoose';
import { WeddingVendor } from '../../models/wedding-vendor.model';
import { VendorResource } from '../../models/vendor-os/vendor-resource.model';
import { ResourceBlock } from '../../models/vendor-os/resource-block.model';
import { VendorPackage } from '../../models/vendor-os/vendor-package.model';
import { VendorQuote } from '../../models/vendor-os/vendor-quote.model';
import { VendorPayment } from '../../models/vendor-os/vendor-payment.model';
import { VendorBooking } from '../../models/vendor-os/vendor-booking.model';
import { VendorClient } from '../../models/vendor-os/vendor-client.model';
import { VendorLead } from '../../models/vendor-os/vendor-lead.model';
import { VendorNotifyService } from './vendor-notify.service';
import { VendorLeadService } from './lead.service';
import { VendorQuoteService } from './quote.service';
import { ATOMIC_SLOTS } from '../../constants/vendorOs';
import { addDays, badRequest, buildWhatsAppLink, formatDateKey, normalizePhone, notFound, toDateOnly, DAY_MS } from '../../utils/vendorOs';

type Id = mongoose.Types.ObjectId;

const PUBLIC_VENDOR_FIELDS = 'businessName slug logo phone whatsappNumber email gstNumber location';

export class PublicVendorOsService {
  static async resolveVendor(idOrSlug: string) {
    const lookup = mongoose.Types.ObjectId.isValid(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
    const vendor = await WeddingVendor.findOne({ ...lookup, isDeleted: false })
      .select('_id businessName whatsappNumber phone status osEnabled')
      .lean<{ _id: Id; businessName: string; whatsappNumber?: string; phone?: string; status: string; osEnabled?: boolean }>();
    if (!vendor) throw notFound('Vendor');
    return vendor;
  }

  /**
   * Public availability per date: Available / Booked / On request (spec
   * 4.4 + M2). Never exposes who booked or which resource — only whether
   * the vendor can still take a booking that day.
   *   booked     — no free capacity on any resource in any slot
   *   on_request — some capacity left but only half a day, or the vendor
   *                hasn't set up a calendar (not on Vendor OS)
   *   available  — at least one resource free for the full day
   */
  static async availability(idOrSlug: string, from?: string, to?: string) {
    const vendor = await this.resolveVendor(idOrSlug);
    const start = from ? toDateOnly(from) : toDateOnly(new Date());
    const end = to ? toDateOnly(to) : addDays(start, 89);
    if (end < start) throw badRequest('"to" must be on or after "from"');
    if ((end.getTime() - start.getTime()) / DAY_MS > 366) throw badRequest('Range cannot exceed one year');

    const resources = await VendorResource.find({ vendorId: vendor._id, isActive: true }).select('capacity').lean();
    const days: { date: string; status: 'available' | 'booked' | 'on_request' }[] = [];

    if (!vendor.osEnabled || !resources.length) {
      for (let d = start; d <= end; d = addDays(d, 1)) days.push({ date: formatDateKey(d), status: 'on_request' });
      return { vendorId: vendor._id, calendarManaged: false, days };
    }

    const usage = await ResourceBlock.aggregate([
      { $match: { vendorId: vendor._id, soft: false, date: { $gte: start, $lte: end } } },
      { $group: { _id: { resourceId: '$resourceId', date: '$date', slot: '$slot' }, units: { $sum: '$units' } } },
    ]);
    const used = new Map(usage.map((u: any) => [`${u._id.resourceId}|${u._id.date.getTime()}|${u._id.slot}`, u.units]));

    for (let d = start; d <= end; d = addDays(d, 1)) {
      let fullDayFree = false;
      let anySlotFree = false;
      for (const r of resources) {
        const free = ATOMIC_SLOTS.map((slot) => (used.get(`${r._id}|${d.getTime()}|${slot}`) || 0) < r.capacity);
        if (free.every(Boolean)) fullDayFree = true;
        if (free.some(Boolean)) anySlotFree = true;
      }
      days.push({ date: formatDateKey(d), status: fullDayFree ? 'available' : anySlotFree ? 'on_request' : 'booked' });
    }
    return { vendorId: vendor._id, calendarManaged: true, days };
  }

  static async packages(idOrSlug: string) {
    const vendor = await this.resolveVendor(idOrSlug);
    return VendorPackage.find({ vendorId: vendor._id, isActive: true })
      .select('-vendorId -__v')
      .sort({ kind: 1, sortOrder: 1, price: 1 })
      .lean();
  }

  /**
   * "WhatsApp" button on the public profile: routes through Vendor OS so
   * the enquiry is captured as a lead before handing the family off to the
   * vendor's WhatsApp (spec 4.4). A repeat click from the same phone within
   * 30 days is logged on the existing open lead instead of a duplicate.
   */
  static async whatsappClick(
    idOrSlug: string,
    data: { name?: string; phone?: string; message?: string; weddingDate?: string },
    familyUserId?: string
  ) {
    const vendor = await this.resolveVendor(idOrSlug);
    const vendorPhone = vendor.whatsappNumber || vendor.phone;
    const text =
      data.message ||
      `Hi ${vendor.businessName}, I found you on ApnaUtsav${data.weddingDate ? ` — my wedding is on ${data.weddingDate}` : ''}. I'd like to know more.`;

    let leadId: Id | undefined;
    if (data.phone && data.name) {
      const phone = normalizePhone(data.phone);
      const recent = await VendorLead.findOne({
        vendorId: vendor._id,
        'contact.phone': phone,
        status: { $nin: ['booked', 'lost'] },
        createdAt: { $gte: addDays(new Date(), -30) },
      });
      if (recent) {
        leadId = recent._id as Id;
        await VendorNotifyService.logActivity({
          vendorId: vendor._id,
          leadId,
          clientId: recent.clientId,
          type: 'message',
          channel: 'whatsapp',
          direction: 'inbound',
          text: `Clicked WhatsApp on the ApnaUtsav profile: "${text}"`,
        });
      } else {
        const lead = await VendorLeadService.create(vendor._id, {
          name: data.name,
          phone,
          source: 'whatsapp',
          message: text,
          weddingDates: data.weddingDate ? [data.weddingDate] : [],
          familyUserId,
        });
        leadId = lead._id as Id;
      }
    }

    return { waLink: buildWhatsAppLink(vendorPhone, text), leadId };
  }

  // -------------------------------------------------------------------
  // Public quote & receipt links (shared on WhatsApp)
  // -------------------------------------------------------------------

  static async getQuoteByToken(token: string, countView: boolean) {
    const quote = await VendorQuote.findOne({ publicToken: token });
    if (!quote || quote.status === 'draft') throw notFound('Quote');
    if (countView) {
      await VendorQuoteService.markViewed(quote);
    }
    const [vendor, client] = await Promise.all([
      WeddingVendor.findById(quote.vendorId).select(PUBLIC_VENDOR_FIELDS).lean(),
      VendorClient.findById(quote.clientId).select('name').lean(),
    ]);
    const booking = quote.bookingId ? await VendorBooking.findById(quote.bookingId).select('bookingNumber status').lean() : null;
    return {
      quote: {
        _id: quote._id,
        quoteNumber: quote.quoteNumber,
        version: quote.version,
        title: quote.title,
        status: quote.status,
        items: quote.items,
        discount: quote.discount,
        gstEnabled: quote.gstEnabled,
        subtotal: quote.subtotal,
        discountAmount: quote.discountAmount,
        taxTotal: quote.taxTotal,
        total: quote.total,
        validTill: quote.validTill,
        terms: quote.terms,
        deliverables: quote.deliverables,
        paymentSchedule: quote.paymentSchedule,
        events: quote.events,
        sentAt: quote.sentAt,
        acceptedAt: quote.acceptedAt,
        declinedAt: quote.declinedAt,
      },
      vendor,
      client: { name: client?.name },
      booking,
    };
  }

  static async actOnQuote(token: string, action: 'accept' | 'decline', reason?: string, familyUserId?: string) {
    const quote = await VendorQuote.findOne({ publicToken: token });
    if (!quote || quote.status === 'draft') throw notFound('Quote');
    if (familyUserId && !quote.familyUserId) {
      quote.familyUserId = new mongoose.Types.ObjectId(familyUserId);
      await quote.save();
    }
    if (action === 'accept') {
      const result = await VendorQuoteService.accept(quote);
      return { status: result.quote.status, bookingNumber: result.booking.bookingNumber };
    }
    const declined = await VendorQuoteService.decline(quote, reason);
    return { status: declined.status };
  }

  static async getReceiptByToken(token: string) {
    const payment = await VendorPayment.findOne({ publicToken: token }).lean();
    if (!payment) throw notFound('Receipt');
    const [booking, vendor] = await Promise.all([
      VendorBooking.findById(payment.bookingId).select('bookingNumber title client events totalAmount amountPaid balanceDue').lean(),
      WeddingVendor.findById(payment.vendorId).select(PUBLIC_VENDOR_FIELDS).lean(),
    ]);
    return {
      receipt: {
        receiptNo: payment.receiptNo,
        amount: payment.amount,
        mode: payment.mode,
        reference: payment.reference,
        receivedAt: payment.receivedAt,
        isVoided: payment.isVoided,
      },
      booking,
      vendor,
    };
  }

  static async loadQuotePdfData(token: string) {
    const quote = await VendorQuote.findOne({ publicToken: token });
    if (!quote || quote.status === 'draft') throw notFound('Quote');
    const [vendor, client] = await Promise.all([
      WeddingVendor.findById(quote.vendorId).select(PUBLIC_VENDOR_FIELDS).lean(),
      VendorClient.findById(quote.clientId).select('name phone email').lean(),
    ]);
    return { quote, vendor: vendor!, client: client! };
  }

  static async loadReceiptPdfData(token: string) {
    const payment = await VendorPayment.findOne({ publicToken: token });
    if (!payment) throw notFound('Receipt');
    const [booking, vendor] = await Promise.all([
      VendorBooking.findById(payment.bookingId),
      WeddingVendor.findById(payment.vendorId).select(PUBLIC_VENDOR_FIELDS).lean(),
    ]);
    return { payment, booking: booking!, vendor: vendor! };
  }
}
