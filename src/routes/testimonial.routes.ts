import { Router } from 'express';
import { TestimonialController } from '../controllers/testimonial.controller';

const router: Router = Router();

/** GET /testimonials — public landing-page "What our couples say" content. */
router.get('/', TestimonialController.getTestimonials);

export default router;
