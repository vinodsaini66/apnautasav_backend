import { Router } from 'express';
import { VendorOsPublicController as C } from '../../controllers/vendor-os/public.controller';
import { VendorOsProfileController as Profile } from '../../controllers/vendor-os/profile.controller';
import { authMiddleware, optionalAuth } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { familyBulkEnquirySchema, publicAvailabilitySchema, publicQuoteActionSchema, whatsappClickSchema } from '../../validators/vendor-os.validator';

/**
 * @swagger
 * tags:
 *   - name: Vendor OS Public
 *     description: Family-facing endpoints — live availability, quote/receipt links, my quotes/bookings
 * /vendor-os/public/vendors/{vendorId}/availability:
 *   get:
 *     summary: Available / Booked / On request per date, computed from the vendor's real calendar
 *     tags: [Vendor OS Public]
 *     parameters:
 *       - { in: path, name: vendorId, required: true, schema: { type: string }, description: WeddingVendor id or slug }
 *       - { in: query, name: from, schema: { type: string, example: "2026-11-01" } }
 *       - { in: query, name: to, schema: { type: string, example: "2026-11-30" } }
 *     responses:
 *       200: { description: Per-day status }
 * /vendor-os/public/quotes/{token}:
 *   get:
 *     summary: Public quote view (marks the quote "viewed" on first open; ?preview=1 to skip)
 *     tags: [Vendor OS Public]
 *     parameters:
 *       - { in: path, name: token, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Quote }
 */

// Public: no login needed (links are shared on WhatsApp).
export const publicRouter: Router = Router();

publicRouter.get('/categories', Profile.listCategories);
publicRouter.get('/categories/:key', Profile.getCategory);

publicRouter.get('/vendors/:vendorId/availability', validate(publicAvailabilitySchema), C.availability);
publicRouter.get('/vendors/:vendorId/packages', C.packages);
publicRouter.post('/vendors/:vendorId/whatsapp', optionalAuth, validate(whatsappClickSchema), C.whatsappClick);

publicRouter.get('/quotes/:token', C.getQuote);
publicRouter.get('/quotes/:token/pdf', C.quotePdf);
publicRouter.post('/quotes/:token/accept', optionalAuth, validate(publicQuoteActionSchema), C.acceptQuote);
publicRouter.post('/quotes/:token/decline', optionalAuth, validate(publicQuoteActionSchema), C.declineQuote);

publicRouter.get('/receipts/:token', C.getReceipt);
publicRouter.get('/receipts/:token/pdf', C.receiptPdf);
publicRouter.get('/run-sheets/:token', C.runSheet);

// Family app (existing family JWT — authMiddleware, not vendorAuth).
export const familyRouter: Router = Router();
familyRouter.use(authMiddleware);
familyRouter.get('/quotes', C.familyQuotes);
familyRouter.get('/bookings', C.familyBookings);
familyRouter.get('/run-sheets', C.familyRunSheets);
familyRouter.post('/enquiries', validate(familyBulkEnquirySchema), C.bulkEnquiry);
