import { Router } from 'express';
import { FaqController } from '../controllers/faq.controller';

const router: Router = Router();

/** GET /faqs — public landing-page FAQ accordion content. */
router.get('/', FaqController.getFaqs);

export default router;
