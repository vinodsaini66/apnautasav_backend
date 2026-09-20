import { Request, Response } from 'express';
import { Faq } from '../models/faq.model';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';

export class FaqController {
  /** GET /faqs — public. Active FAQs only, in curated order. */
  static async getFaqs(_req: Request, res: Response): Promise<void> {
    try {
      const faqs = await Faq.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
      ApiResponse.success(res, 200, { data: faqs });
    } catch (error: any) {
      logger.error('Get FAQs error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch FAQs');
    }
  }
}
