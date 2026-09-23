import { Request, Response } from 'express';
import { Testimonial } from '../models/testimonial.model';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';

export class TestimonialController {
  /** GET /testimonials — public. Active testimonials only, in curated order. */
  static async getTestimonials(_req: Request, res: Response): Promise<void> {
    try {
      const testimonials = await Testimonial.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
      ApiResponse.success(res, 200, { data: testimonials });
    } catch (error: any) {
      logger.error('Get testimonials error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch testimonials');
    }
  }
}
