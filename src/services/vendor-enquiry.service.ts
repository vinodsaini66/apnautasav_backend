import { VendorEnquiry, IVendorEnquiry } from '../models/vendor-enquiry.model';
import { VendorCategory } from '../models/vendor-category.model';
import logger from '../utils/logger';

interface CreateEnquiryInput {
  name: string;
  businessName: string;
  email: string;
  phoneNumber: string;
  categoryId: string;
  city?: string;
  message: string;
}

export class EnquiryValidationError extends Error {}

export class VendorEnquiryService {
  /**
   * Save a vendor's "Partner With Us" enquiry. This must always succeed
   * independently of email — the acknowledgement email is intentionally
   * NOT sent here yet (see the comment below), and even once it is enabled
   * it must never be awaited in a way that can fail the request: fire it
   * off after the enquiry is already saved, and let EmailService's own
   * internal try/catch (it never throws, only returns false) absorb any
   * failure.
   */
  static async createEnquiry(data: CreateEnquiryInput): Promise<IVendorEnquiry> {
    const category = await VendorCategory.findOne({ _id: data.categoryId, isDeleted: false });
    if (!category) {
      throw new EnquiryValidationError('Selected business category was not found');
    }

    const enquiry = await VendorEnquiry.create({
      name: data.name,
      businessName: data.businessName,
      email: data.email,
      phoneNumber: data.phoneNumber,
      categoryId: category._id,
      categoryName: category.name,
      city: data.city,
      message: data.message,
      status: 'new',
      source: 'landing_page',
      acknowledgementEmailStatus: 'not_sent',
    });

    logger.info(`Vendor enquiry received: ${enquiry._id} (${enquiry.businessName})`);

    // --- Acknowledgement email — built, but deliberately not enabled yet ---
    // SMTP credentials aren't configured in production yet. Once they are,
    // enable this by uncommenting the block below. It's written so a
    // failure here can NEVER affect the enquiry we already saved above:
    // it runs after `create()`, isn't awaited into the response, and
    // EmailService.sendVendorEnquiryAcknowledgement() itself never throws.
    //
    // EmailService.sendVendorEnquiryAcknowledgement(enquiry)
    //   .then((sent) =>
    //     VendorEnquiry.findByIdAndUpdate(enquiry._id, {
    //       acknowledgementEmailStatus: sent ? 'sent' : 'failed',
    //     }).catch((err) => logger.error('Failed to record ack-email status:', err))
    //   )
    //   .catch((err) => logger.error('Unexpected error sending vendor ack email:', err));

    return enquiry;
  }

  static async getEnquiries(page: number = 1, limit: number = 20, status?: string) {
    const skip = (page - 1) * limit;
    const query: Record<string, unknown> = {};
    if (status) query.status = status;

    const [enquiries, total] = await Promise.all([
      VendorEnquiry.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      VendorEnquiry.countDocuments(query),
    ]);

    return { enquiries, page, limit, total };
  }

  static async updateStatus(id: string, status: 'new' | 'contacted' | 'closed'): Promise<IVendorEnquiry | null> {
    return VendorEnquiry.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean() as unknown as Promise<IVendorEnquiry | null>;
  }
}
