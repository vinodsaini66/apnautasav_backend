import { Request, Response } from 'express';
import { VendorEnquiryService, EnquiryValidationError } from '../services/vendor-enquiry.service';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';

export class VendorEnquiryController {
  /** POST /vendor-enquiries — public, no login required (submitted by prospective vendors, not app users). */
  static async createEnquiry(req: Request, res: Response): Promise<void> {
    try {
      const enquiry = await VendorEnquiryService.createEnquiry(req.body);
      ApiResponse.success(res, 201, {
        message: "Thanks! We've received your enquiry and will connect with you soon.",
        data: enquiry,
      });
    } catch (error: any) {
      logger.error('Create vendor enquiry error:', error);
      if (error instanceof EnquiryValidationError) {
        ApiResponse.error(res, 400, error.message);
        return;
      }
      ApiResponse.error(res, 500, error.message || 'Failed to submit enquiry');
    }
  }

  /** GET /vendor-enquiries — admin listing. */
  static async getEnquiries(req: Request, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 20, status } = req.query;
      const result = await VendorEnquiryService.getEnquiries(Number(page), Number(limit), status as string);
      ApiResponse.paginated(res, result.enquiries, result.page, result.limit, result.total);
    } catch (error: any) {
      logger.error('Get vendor enquiries error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch enquiries');
    }
  }

  /** PATCH /vendor-enquiries/:id/status — admin marks an enquiry contacted/closed. */
  static async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const enquiry = await VendorEnquiryService.updateStatus(req.params.id, req.body.status);
      if (!enquiry) {
        ApiResponse.error(res, 404, 'Enquiry not found');
        return;
      }
      ApiResponse.success(res, 200, { message: 'Enquiry status updated', data: enquiry });
    } catch (error: any) {
      logger.error('Update vendor enquiry status error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to update enquiry status');
    }
  }
}
