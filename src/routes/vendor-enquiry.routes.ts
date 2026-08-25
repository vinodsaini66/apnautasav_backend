import { Router } from 'express';
import { VendorEnquiryController } from '../controllers/vendor-enquiry.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/authorization.middleware';
import { validate } from '../middleware/validation.middleware';
import { createVendorEnquirySchema, updateVendorEnquiryStatusSchema } from '../validators/vendor-enquiry.validator';

const router: Router = Router();

/**
 * POST /vendor-enquiries
 * Public — submitted by prospective vendors from the landing page's
 * "Partner With Us" form, who are not app users and have no account/token.
 */
router.post('/', validate(createVendorEnquirySchema), VendorEnquiryController.createEnquiry);

// Everything below is for our own team to review/triage submitted enquiries.
router.use(authMiddleware);
router.use(requireAdmin);

router.get('/', VendorEnquiryController.getEnquiries);
router.patch('/:id/status', validate(updateVendorEnquiryStatusSchema), VendorEnquiryController.updateStatus);

export default router;
