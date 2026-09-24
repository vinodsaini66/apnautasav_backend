import mongoose from 'mongoose';
import { IVendorBooking } from '../../models/vendor-os/vendor-booking.model';
import { VendorBooking } from '../../models/vendor-os/vendor-booking.model';
import { VendorQuote } from '../../models/vendor-os/vendor-quote.model';
import { VendorLead } from '../../models/vendor-os/vendor-lead.model';
import { WeddingVendor } from '../../models/wedding-vendor.model';
import { Wedding } from '../../models/wedding.model';
import { Budget } from '../../models/budget.model';
import { Vendor, VendorCategory as TrackerCategory } from '../../models/vendor.model';
import { IWeddingVendorInquiry } from '../../models/vendor-enquery.model';
import { quotePublicUrl } from './quote.service';
import { VendorLeadService } from './lead.service';
import { formatDateKey, round2, toDateOnly } from '../../utils/vendorOs';
import logger from '../../utils/logger';

// Spec section 7: how Vendor OS plugs into the family side of ApnaUtsav.
//  - marketplace enquiry  → lead in the vendor's inbox (auto)
//  - booking (from an accepted quote or created by the vendor for a family
//    who came through ApnaUtsav) → family's budget line + vendor tracker
//    entry, kept in sync as the vendor logs payments ("no double entry").
// Every method here is best-effort: the family side must never block or
// fail a vendor action.

const BUDGET_CATEGORY: Record<string, string> = {
  venue: 'venue',
  photography: 'photography',
  catering: 'catering',
  decor: 'decoration',
  makeup: 'others',
  music: 'music',
  transport: 'logistics',
  invitations: 'invitations',
};

const TRACKER_CATEGORY: Record<string, TrackerCategory> = {
  venue: 'hospitality',
  photography: 'photographer',
  catering: 'caterer',
  decor: 'decorator',
  makeup: 'makeup-artist',
  music: 'dj',
  transport: 'transport',
  invitations: 'invitation',
};

const TRACKER_STATUS: Record<string, 'negotiating' | 'booked' | 'confirmed' | 'cancelled'> = {
  hold: 'negotiating',
  tentative: 'booked',
  confirmed: 'confirmed',
  completed: 'confirmed',
  cancelled: 'cancelled',
};

export class FamilyBindingService {
  /** Called from WeddingVendorService.createInquiry — every ApnaUtsav enquiry becomes a lead. */
  static async onMarketplaceInquiry(inquiry: IWeddingVendorInquiry): Promise<void> {
    try {
      const vendorId = inquiry.weddingVendorId as mongoose.Types.ObjectId;
      if (!inquiry.phone) return;

      let city: string | undefined;
      if (inquiry.weddingId) {
        const wedding = await Wedding.findById(inquiry.weddingId).select('location').lean();
        city = wedding?.location;
      }

      await VendorLeadService.create(vendorId, {
        name: inquiry.fullName,
        phone: inquiry.phone,
        email: inquiry.email,
        source: 'apnautsav',
        weddingDates: inquiry.functionDate ? [formatDateKey(toDateOnly(inquiry.functionDate))] : [],
        functions: inquiry.functionType ? [inquiry.functionType] : [],
        guestCount: inquiry.guestCount,
        message: inquiry.message,
        city,
        familyUserId: inquiry.userId,
        weddingId: inquiry.weddingId,
        marketplaceInquiryId: inquiry._id as mongoose.Types.ObjectId,
      });
    } catch (error) {
      logger.error('Vendor OS: failed to turn marketplace inquiry into a lead', error);
    }
  }

  /**
   * Mirrors a booking into the family's wedding: one budget line (with the
   * payment schedule as installments) and one vendor-tracker entry. Only
   * runs for bookings that know their wedding (lead came from ApnaUtsav).
   */
  static async syncBooking(booking: IVendorBooking): Promise<void> {
    if (!booking.weddingId) return;
    try {
      const [wedding, vendor] = await Promise.all([
        Wedding.findById(booking.weddingId).select('createdBy').lean(),
        WeddingVendor.findById(booking.vendorId).select('businessName osCategory phone whatsappNumber email contactPerson').lean(),
      ]);
      if (!wedding || !vendor) return;
      const addedBy = booking.familyUserId || wedding.createdBy;
      const category = vendor.osCategory || '';

      // --- Budget line -------------------------------------------------
      if (booking.status === 'cancelled') {
        if (booking.familyBudgetId) {
          await Budget.updateOne(
            { _id: booking.familyBudgetId },
            { $set: { status: 'pending', notes: `Booking ${booking.bookingNumber} was cancelled by the vendor (Vendor OS)` } }
          );
        }
      } else {
        const today = toDateOnly(new Date());
        const installments = booking.paymentSchedule.map((m) => ({
          label: m.label,
          amount: m.amount,
          dueDate: m.dueDate,
          status: m.status === 'paid' ? 'paid' : 'pending',
          paidDate: m.status === 'paid' ? today : undefined,
        }));
        const budgetFields = {
          category: BUDGET_CATEGORY[category] || 'others',
          description: `${vendor.businessName} — ${booking.bookingNumber}`,
          estimatedCost: booking.totalAmount,
          actualCost: booking.amountPaid,
          amountPaid: booking.amountPaid,
          status: booking.totalAmount > 0 && booking.balanceDue <= 0 ? 'paid' : 'approved',
          installments,
          notes: 'Synced automatically from the vendor’s ApnaUtsav Vendor OS booking',
        };
        if (booking.familyBudgetId && (await Budget.exists({ _id: booking.familyBudgetId }))) {
          await Budget.updateOne({ _id: booking.familyBudgetId }, { $set: budgetFields });
        } else {
          const budget = await Budget.create({ ...budgetFields, weddingId: booking.weddingId, addedBy, currency: 'INR' });
          await VendorBooking.updateOne({ _id: booking._id }, { $set: { familyBudgetId: budget._id } });
          booking.familyBudgetId = budget._id as mongoose.Types.ObjectId;
        }
      }

      // --- Vendor tracker ------------------------------------------------
      await Vendor.updateOne(
        { weddingId: booking.weddingId, marketplaceVendorId: booking.vendorId },
        {
          $set: {
            bookingStatus: TRACKER_STATUS[booking.status],
            estimatedCost: booking.totalAmount,
            actualCost: booking.amountPaid,
            paymentTerms: booking.paymentSchedule
              .map((m) => `${m.label}: Rs. ${round2(m.amount)}${m.dueDate ? ` by ${formatDateKey(m.dueDate)}` : ''}`)
              .join('; '),
          },
          $setOnInsert: {
            vendorName: vendor.businessName,
            category: TRACKER_CATEGORY[category] || 'hospitality',
            contactPerson: vendor.contactPerson,
            phoneNumber: vendor.whatsappNumber || vendor.phone || booking.client.phone,
            email: vendor.email,
            addedBy,
            eventIds: [],
            contracts: [],
          },
        },
        { upsert: true }
      );
    } catch (error) {
      logger.error(`Vendor OS: failed to sync booking ${booking._id} to the family wedding`, error);
    }
  }

  // -------------------------------------------------------------------
  // Family-facing reads ("My enquiries" / vendor tracker in the family app)
  // -------------------------------------------------------------------

  static async listFamilyQuotes(userId: string, weddingId?: string) {
    const filter: any = { familyUserId: new mongoose.Types.ObjectId(userId), status: { $ne: 'draft' } };
    if (weddingId) {
      const leadIds = await VendorLead.find({ weddingId, familyUserId: filter.familyUserId }).distinct('_id');
      filter.leadId = { $in: leadIds };
    }
    const quotes = await VendorQuote.find(filter)
      .select('-history -notes -createdBy')
      .populate('vendorId', 'businessName slug logo osCategory rating')
      .sort({ updatedAt: -1 })
      .lean();
    return quotes.map((q) => ({ ...q, publicUrl: quotePublicUrl(q.publicToken) }));
  }

  static async listFamilyBookings(userId: string, weddingId?: string) {
    const filter: any = { familyUserId: new mongoose.Types.ObjectId(userId) };
    if (weddingId) filter.weddingId = new mongoose.Types.ObjectId(weddingId);
    return VendorBooking.find(filter)
      .select('bookingNumber title status events totalAmount amountPaid balanceDue paymentSchedule vendorId weddingId holdExpiresAt createdAt')
      .populate('vendorId', 'businessName slug logo osCategory phone whatsappNumber')
      .sort({ 'events.0.date': 1 })
      .lean();
  }
}
