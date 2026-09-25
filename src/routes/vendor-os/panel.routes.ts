import { Router } from 'express';
import { vendorAuth, requireVendor, requireVendorRole, requireBasicProfile, requireVerifiedAccount } from '../../middleware/vendor-auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { documentUpload, imageUpload, videoUpload } from '../../middleware/upload.middleware';
import { VendorOsProfileController as Profile } from '../../controllers/vendor-os/profile.controller';
import { VendorOsCalendarController as Calendar } from '../../controllers/vendor-os/calendar.controller';
import { VendorOsCrmController as Crm } from '../../controllers/vendor-os/crm.controller';
import { VendorOsQuoteController as Quote } from '../../controllers/vendor-os/quote.controller';
import { VendorOsBookingController as Booking } from '../../controllers/vendor-os/booking.controller';
import { VendorOsWorkspaceController as Workspace } from '../../controllers/vendor-os/workspace.controller';
import { VendorOsCrewController as Crew } from '../../controllers/vendor-os/crew.controller';
import * as v from '../../validators/vendor-os.validator';

// The Vendor OS panel API (/vendor-os/*), behind the vendor's own session.
// Permissions follow spec section 8:
//   owner   — everything
//   manager — everything except team management
//   staff   — leads, clients, calendar, quotes, bookings (no money)
//   crew    — own calendar assignments only
const router: Router = Router();

const ownerOnly = requireVendorRole('owner');
const managers = requireVendorRole('owner', 'manager');
const office = requireVendorRole('owner', 'manager', 'staff');
const everyone = requireVendorRole('owner', 'manager', 'staff', 'crew');

/**
 * @swagger
 * tags:
 *   - name: Vendor OS
 *     description: >
 *       Vendor panel API (bearer = Vendor OS token from /vendor-os/auth/verify-otp, NOT the family-app token).
 *       Sections: profile & packages & portfolio (M1), resources & calendar (M2), bookings & payments (M3),
 *       quotes (M4), leads & clients (M5), WhatsApp (M6), dashboard/reports/export/team/notifications (M7).
 */

router.use(vendorAuth, requireVendor);

// ---------------------------------------------------------------------------
// Profile page — reachable BEFORE the basic profile is complete (it's where
// the frontend sends the vendor until onboarding.nextStep === 'dashboard').
// ---------------------------------------------------------------------------
router.get('/profile', office, Profile.getProfile);
router.patch('/profile', managers, validate(v.updateProfileSchema), Profile.updateProfile);
router.get('/profile/completeness', office, Profile.completeness);
router.post('/uploads/image', office, imageUpload.single('file'), Profile.uploadImage);
router.post('/uploads/document', office, documentUpload.single('file'), Profile.uploadDocument);
router.post('/uploads/video', office, videoUpload.single('file'), Profile.uploadVideo);

// Everything below needs the basic profile (onboarding.service.ts).
router.use(requireBasicProfile);

// ---------------------------------------------------------------------------
// M1 — Go-live, packages, portfolio
// ---------------------------------------------------------------------------
router.get('/profile/preview', office, Profile.preview);
router.post('/profile/submit', managers, Profile.submit);
router.post('/profile/unpublish', managers, Profile.unpublish);
router.get('/plan', managers, Profile.plan);

router.get('/packages', office, Profile.listPackages);
router.post('/packages', managers, validate(v.createPackageSchema), Profile.createPackage);
router.patch('/packages/:packageId', managers, validate(v.updatePackageSchema), Profile.updatePackage);
router.delete('/packages/:packageId', managers, Profile.deletePackage);

router.get('/portfolio/albums', office, Profile.listAlbums);
router.post('/portfolio/albums', office, validate(v.createAlbumSchema), Profile.createAlbum);
router.get('/portfolio/albums/:albumId', office, Profile.getAlbum);
router.patch('/portfolio/albums/:albumId', office, validate(v.updateAlbumSchema), Profile.updateAlbum);
router.delete('/portfolio/albums/:albumId', managers, Profile.deleteAlbum);
router.get('/portfolio/media', office, Profile.listMedia);
router.post('/portfolio/media', office, validate(v.addMediaSchema), Profile.addMedia);
router.patch('/portfolio/media/:mediaId', office, validate(v.updateMediaSchema), Profile.updateMedia);
router.delete('/portfolio/media/:mediaId', office, Profile.deleteMedia);

// Notifications stay open while waiting for approval ("Your profile is live").
router.get('/notifications', everyone, Workspace.listNotifications);
router.post('/notifications/read-all', everyone, Workspace.markAllNotificationsRead);
router.post('/notifications/:notificationId/read', everyone, Workspace.markNotificationRead);

// Everything below is the operational panel: needs a verified login and an
// ApnaUtsav-approved listing (onboarding.nextStep === 'dashboard').
router.use(requireVerifiedAccount);

// ---------------------------------------------------------------------------
// M2 — Resources & calendar (conflict engine)
// ---------------------------------------------------------------------------
router.get('/resources', everyone, Calendar.listResources);
router.post('/resources', managers, validate(v.createResourceSchema), Calendar.createResource);
router.patch('/resources/:resourceId', managers, validate(v.updateResourceSchema), Calendar.updateResource);
router.delete('/resources/:resourceId', managers, Calendar.deleteResource);

router.get('/calendar', everyone, validate(v.calendarQuerySchema), Calendar.calendar);
router.get('/calendar/availability', office, validate(v.availabilityQuerySchema), Calendar.availability);
router.post('/calendar/check', office, validate(v.conflictCheckSchema), Calendar.check);
router.post('/calendar/blocks', office, validate(v.manualBlockSchema), Calendar.createBlock);
router.delete('/calendar/blocks/:blockId', office, Calendar.deleteBlock);

// ---------------------------------------------------------------------------
// M3 — Bookings, payments, dues
/**
 * @swagger
 * tags:
 *   - name: Vendor OS Payments
 *     description: Payments received, dues, receipts and reminders (owner/manager only). Bearer = Vendor OS token.
 * /vendor-os/payments:
 *   get:
 *     summary: Payments received, newest first (meta.totalAmount = sum of non-voided)
 *     tags: [Vendor OS Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: search, schema: { type: string }, description: "Receipt no., reference, booking no., client name; client phone for numeric queries" }
 *       - { in: query, name: mode, schema: { type: string, example: "upi,cash" }, description: "Comma-separated: cash, upi, bank, cheque, card, other" }
 *       - { in: query, name: from, schema: { type: string, example: "2026-09-01" } }
 *       - { in: query, name: to, schema: { type: string, example: "2026-09-30" } }
 *       - { in: query, name: bookingId, schema: { type: string } }
 *       - { in: query, name: includeVoided, schema: { type: string, enum: ["true", "false"] } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 50 } }
 *     responses:
 *       200: { description: "Payments with bookingId {bookingNumber,title,client}, recordedBy {name}, milestoneLabel" }
 * /vendor-os/payments/summary:
 *   get:
 *     summary: Cards for the Payments screen — due this week, overdue, collected this month / last month
 *     tags: [Vendor OS Payments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ dueThisWeek, overdue, collectedThisMonth, collectedLastMonth } each { amount, count }" }
 * /vendor-os/payments/dues:
 *   get:
 *     summary: Unpaid milestones across live bookings
 *     tags: [Vendor OS Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: bucket, schema: { type: string, enum: [week, overdue, today, upcoming], default: week } }
 *     responses:
 *       200: { description: "{ items: [{ bookingId, bookingNumber, title, client, autoReminders, milestone, amountDue, daysOverdue }], totalDue }" }
 * /vendor-os/bookings/{bookingId}/payments:
 *   post:
 *     summary: Record a payment (issues receipt R-xxxx, returns a WhatsApp receipt link)
 *     tags: [Vendor OS Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: bookingId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, mode]
 *             properties:
 *               amount: { type: number, example: 45000 }
 *               mode: { type: string, enum: [cash, upi, bank, cheque, card, other] }
 *               reference: { type: string }
 *               receivedAt: { type: string, format: date-time }
 *               milestoneId: { type: string }
 *               notes: { type: string }
 *     responses:
 *       201: { description: Payment + receipt link }
 * /vendor-os/bookings/{bookingId}/reminders:
 *   post:
 *     summary: Build a WhatsApp payment reminder (stamps the milestone's lastReminderAt)
 *     tags: [Vendor OS Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: bookingId, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { milestoneId: { type: string }, language: { type: string, enum: [hinglish, en, hi] } } }
 *     responses:
 *       200: { description: "{ waLink, message }" }
 * /vendor-os/payments/{paymentId}/receipt:
 *   get:
 *     summary: Receipt PDF
 *     tags: [Vendor OS Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: paymentId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: PDF, content: { application/pdf: {} } }
 * /vendor-os/payments/{paymentId}/share:
 *   post:
 *     summary: WhatsApp link with the receipt
 *     tags: [Vendor OS Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: paymentId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: "{ waLink, message }" }
 * /vendor-os/payments/{paymentId}/void:
 *   post:
 *     summary: Void a payment (never deleted — keeps the receipt series gap-free) and restore the balance
 *     tags: [Vendor OS Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: paymentId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [reason], properties: { reason: { type: string, example: "Cheque bounced" } } }
 *     responses:
 *       200: { description: Voided payment }
 */
// ---------------------------------------------------------------------------
router.get('/bookings', office, validate(v.listBookingsSchema), Booking.list);
router.post('/bookings', office, validate(v.createBookingSchema), Booking.create);
router.get('/bookings/:bookingId', office, Booking.get);
router.patch('/bookings/:bookingId', office, validate(v.updateBookingSchema), Booking.update);
router.post('/bookings/:bookingId/status', office, validate(v.bookingStatusSchema), Booking.changeStatus);
router.get('/bookings/:bookingId/payments', managers, Booking.listBookingPayments);
router.post('/bookings/:bookingId/payments', managers, validate(v.recordPaymentSchema), Booking.recordPayment);
router.post('/bookings/:bookingId/reminders', managers, validate(v.reminderSchema), Booking.sendReminder);

router.get('/payments', managers, validate(v.listPaymentsSchema), Booking.listPayments);
router.get('/payments/summary', managers, Booking.paymentSummary);
router.get('/payments/dues', managers, validate(v.paymentDuesSchema), Booking.dues);
router.get('/payments/:paymentId/receipt', managers, Booking.receiptPdf);
router.post('/payments/:paymentId/share', managers, Booking.shareReceipt);
router.post('/payments/:paymentId/void', managers, validate(v.voidPaymentSchema), Booking.voidPayment);

// ---------------------------------------------------------------------------
// M4 — Quotes & quote templates
// ---------------------------------------------------------------------------
router.get('/quote-templates', office, Quote.listTemplates);
router.post('/quote-templates', office, validate(v.createQuoteTemplateSchema), Quote.createTemplate);
router.patch('/quote-templates/:templateId', office, validate(v.updateQuoteTemplateSchema), Quote.updateTemplate);
router.delete('/quote-templates/:templateId', office, Quote.deleteTemplate);

router.get('/quotes', office, validate(v.listQuotesSchema), Quote.list);
router.post('/quotes', office, validate(v.createQuoteSchema), Quote.create);
router.get('/quotes/:quoteId', office, Quote.get);
router.patch('/quotes/:quoteId', office, validate(v.updateQuoteSchema), Quote.update);
router.delete('/quotes/:quoteId', office, Quote.remove);
router.post('/quotes/:quoteId/send', office, validate(v.sendQuoteSchema), Quote.send);
router.post('/quotes/:quoteId/duplicate', office, Quote.duplicate);
router.post('/quotes/:quoteId/status', office, validate(v.quoteStatusSchema), Quote.setStatus);
router.post('/quotes/:quoteId/save-as-template', office, validate(v.saveAsTemplateSchema), Quote.saveAsTemplate);
router.get('/quotes/:quoteId/pdf', office, Quote.pdf);
router.get('/quotes/:quoteId/link', office, Quote.link);

// ---------------------------------------------------------------------------
// M5 — Leads & clients
// ---------------------------------------------------------------------------
router.get('/leads', office, validate(v.listLeadsSchema), Crm.listLeads);
router.post('/leads', office, validate(v.createLeadSchema), Crm.createLead);
router.get('/leads/:leadId', office, Crm.getLead);
router.patch('/leads/:leadId', office, validate(v.updateLeadSchema), Crm.updateLead);
router.delete('/leads/:leadId', managers, Crm.deleteLead);
router.post('/leads/:leadId/status', office, validate(v.leadStatusSchema), Crm.changeLeadStatus);
router.post('/leads/:leadId/notes', office, validate(v.leadNoteSchema), Crm.addLeadNote);
router.post('/leads/:leadId/follow-up', office, validate(v.leadFollowUpSchema), Crm.setFollowUp);
router.get('/leads/:leadId/availability', office, Crm.leadAvailability);

/**
 * @swagger
 * tags:
 *   - name: Vendor OS Clients
 *     description: The vendor's client directory (families). Owner / manager / staff; money fields hidden from staff.
 * /vendor-os/clients:
 *   get:
 *     summary: Clients with stats — bookedValue, bookingCount, balanceDue, leadCount, openLeadCount, nextEventDate, lastContactAt (meta.tagCounts)
 *     tags: [Vendor OS Clients]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: search, schema: { type: string }, description: "Name, contact person, email, city, tag; phone for numeric queries" }
 *       - { in: query, name: tag, schema: { type: string, example: "VIP" } }
 *       - { in: query, name: sort, schema: { type: string, enum: [recent, name, value, bookings, newest], default: recent } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *     responses:
 *       200: { description: Clients }
 *   post:
 *     summary: Add a client (409 DUPLICATE_CLIENT {clientId, name} if the phone exists)
 *     tags: [Vendor OS Clients]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, phone]
 *             properties:
 *               name: { type: string, example: "Kapoor Family" }
 *               contactPerson: { type: string, example: "Neha Kapoor" }
 *               phone: { type: string, example: "9876543210" }
 *               email: { type: string }
 *               city: { type: string }
 *               address: { type: string }
 *               notes: { type: string }
 *               tags: { type: array, items: { type: string }, example: ["Wedding", "VIP"] }
 *     responses:
 *       201: { description: Created }
 *       409: { description: Duplicate phone }
 * /vendor-os/clients/{clientId}:
 *   get:
 *     summary: Client detail — leads, bookings, quotes, payments (money roles), timeline, stats
 *     tags: [Vendor OS Clients]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: clientId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Client }
 *   patch:
 *     summary: Update a client (same fields as create, all optional; email "" clears it)
 *     tags: [Vendor OS Clients]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: clientId, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: Updated }
 * /vendor-os/clients/{clientId}/notes:
 *   post:
 *     summary: Log a note / call / meeting on the client's timeline
 *     tags: [Vendor OS Clients]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: clientId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [text], properties: { type: { type: string, enum: [note, call, meeting] }, text: { type: string } } }
 *     responses:
 *       201: { description: Added }
 */
router.get('/clients', office, validate(v.listClientsSchema), Crm.listClients);
router.post('/clients', office, validate(v.createClientSchema), Crm.createClient);
router.get('/clients/:clientId', office, Crm.getClient);
router.patch('/clients/:clientId', office, validate(v.updateClientSchema), Crm.updateClient);
router.post('/clients/:clientId/notes', office, validate(v.clientNoteSchema), Crm.addClientNote);

// ---------------------------------------------------------------------------
// M6 — WhatsApp (deep links) & message templates
// ---------------------------------------------------------------------------
router.post('/whatsapp/compose', office, validate(v.composeSchema), Workspace.compose);
router.get('/message-templates', office, Workspace.listMessageTemplates);
router.post('/message-templates', managers, validate(v.createMessageTemplateSchema), Workspace.createMessageTemplate);
router.patch('/message-templates/:templateId', managers, validate(v.updateMessageTemplateSchema), Workspace.updateMessageTemplate);
router.delete('/message-templates/:templateId', managers, Workspace.deleteMessageTemplate);

// ---------------------------------------------------------------------------
// M7 — Dashboard, reports, export, notifications, team
// ---------------------------------------------------------------------------
router.get('/dashboard', office, Workspace.dashboard);
router.get('/reports/source-conversion', office, Workspace.sourceConversion);
router.get('/export/:entity', managers, Workspace.exportCsv);


/**
 * @swagger
 * tags:
 *   - name: Vendor OS Profile & Team
 *     description: The vendor's own listing (what families see), team logins and roles. Bearer = Vendor OS token.
 * /vendor-os/profile:
 *   get:
 *     summary: Full listing (incl. private documents), category config and completeness
 *     tags: [Vendor OS Profile & Team]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: "{ vendor, categoryConfig, completeness }" } }
 *   patch:
 *     summary: Update the listing (owner / manager). Partial; location, policies and socialLinks merge.
 *     tags: [Vendor OS Profile & Team]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               businessName: { type: string }
 *               tagline: { type: string }
 *               description: { type: string }
 *               logo: { type: string }
 *               coverImages: { type: array, items: { type: string }, maxItems: 8 }
 *               contactPerson: { type: string }
 *               phone: { type: string }
 *               whatsappNumber: { type: string }
 *               email: { type: string }
 *               website: { type: string }
 *               location: { type: object, properties: { address: { type: string }, area: { type: string }, city: { type: string }, state: { type: string }, pincode: { type: string }, latitude: { type: number }, longitude: { type: number } } }
 *               showExactAddress: { type: boolean, description: "Otherwise families see only area + city" }
 *               serviceCities: { type: array, items: { type: string } }
 *               languages: { type: array, items: { type: string } }
 *               travelPolicy: { type: string }
 *               experienceYears: { type: number }
 *               teamSize: { type: number }
 *               gstNumber: { type: string }
 *               upiId: { type: string }
 *               awards: { type: array, items: { type: string } }
 *               socialLinks: { type: object, properties: { instagram: { type: string }, youtube: { type: string }, facebook: { type: string }, googleBusiness: { type: string } } }
 *               policies: { type: object }
 *               categoryProfile: { type: object }
 *               documents: { type: array, items: { type: object, properties: { key: { type: string, example: "gst" }, label: { type: string }, url: { type: string }, name: { type: string } } }, description: "Private files; the 'brochure' key also sets brochureUrl" }
 *               messageLanguage: { type: string, enum: [hinglish, en, hi], description: "Default WhatsApp template language" }
 *     responses: { 200: { description: Updated profile } }
 * /vendor-os/profile/completeness:
 *   get:
 *     summary: Profile score, checklist and nudges
 *     tags: [Vendor OS Profile & Team]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: "{ score, checks, nudges }" } }
 * /vendor-os/profile/preview:
 *   get:
 *     summary: The public page as families see it (packages, albums, media, 90-day availability)
 *     tags: [Vendor OS Profile & Team]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Preview } }
 * /vendor-os/profile/submit:
 *   post:
 *     summary: Go live (first time → ApnaUtsav review; needs 50% and one package)
 *     tags: [Vendor OS Profile & Team]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: "{ status, message }" }, 400: { description: "Not complete enough ({ score, nudges })" } }
 * /vendor-os/profile/unpublish:
 *   post:
 *     summary: Hide the listing from families
 *     tags: [Vendor OS Profile & Team]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: "{ status }" } }
 * /vendor-os/plan:
 *   get:
 *     summary: Plan with limits and usage
 *     tags: [Vendor OS Profile & Team]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: "{ plan, limits, usage }" } }
 * /vendor-os/team:
 *   get:
 *     summary: Team logins (owner first); crew logins include their roster entry
 *     tags: [Vendor OS Profile & Team]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Team } }
 *   post:
 *     summary: Invite a manager / staff / crew login by phone (owner only). Returns invite.waLink to send on WhatsApp.
 *     tags: [Vendor OS Profile & Team]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, phone, role]
 *             properties:
 *               name: { type: string, example: "Neha Saini" }
 *               phone: { type: string, example: "9876543210" }
 *               email: { type: string }
 *               role: { type: string, enum: [manager, staff, crew] }
 *               crew: { type: object, properties: { defaultResourceId: { type: string }, role: { type: string } }, description: "Crew logins: their team + usual role on the roster" }
 *     responses: { 201: { description: Invited } }
 * /vendor-os/team/{memberId}:
 *   patch:
 *     summary: Change name / role / access (owner only; not the owner or yourself)
 *     tags: [Vendor OS Profile & Team]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: memberId, required: true, schema: { type: string } }]
 *     requestBody: { content: { application/json: { schema: { type: object, properties: { name: { type: string }, role: { type: string, enum: [manager, staff, crew] }, status: { type: string, enum: [active, disabled] } } } } } }
 *     responses: { 200: { description: Updated } }
 *   delete:
 *     summary: Remove from the business (owner only)
 *     tags: [Vendor OS Profile & Team]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: memberId, required: true, schema: { type: string } }]
 *     responses: { 200: { description: Removed } }
 * /vendor-os/team/{memberId}/invite:
 *   post:
 *     summary: WhatsApp message to (re)send an invite
 *     tags: [Vendor OS Profile & Team]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: memberId, required: true, schema: { type: string } }]
 *     responses: { 200: { description: "{ message, waLink }" } }
 */
router.get('/team', managers, Workspace.listTeam);
router.post('/team', ownerOnly, validate(v.inviteMemberSchema), Workspace.inviteMember);
router.patch('/team/:memberId', ownerOnly, validate(v.updateMemberSchema), Workspace.updateMember);
router.delete('/team/:memberId', ownerOnly, Workspace.removeMember);
router.post('/team/:memberId/invite', ownerOnly, Workspace.reinviteMember);

// ---------------------------------------------------------------------------
// Phase 2 — Wedding-day team: crew roster, assignments, call sheets, run sheets
// ---------------------------------------------------------------------------
/**
 * @swagger
 * tags:
 *   - name: Vendor OS Crew
 *     description: Wedding-day team — crew roster, availability, per-function assignments (double-booking safe), call sheets, run sheets, payouts and the event-day board. Bearer = Vendor OS token.
 * /vendor-os/crew/members:
 *   get:
 *     summary: Crew roster with upcomingCount, pendingCount, nextDate, hasLogin (defaultRate hidden from staff)
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: active, schema: { type: string, enum: ["true", "false", "all"], default: "true" } }
 *       - { in: query, name: skill, schema: { type: string } }
 *       - { in: query, name: resourceId, schema: { type: string }, description: Default team }
 *     responses:
 *       200: { description: Crew members }
 *   post:
 *     summary: Add a crew member (409 DUPLICATE_CREW if the phone exists). Links to a crew panel login with the same phone.
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, phone]
 *             properties:
 *               name: { type: string, example: "Arjun Mehra" }
 *               phone: { type: string, example: "9876501234" }
 *               role: { type: string, example: "Candid photographer" }
 *               skills: { type: array, items: { type: string }, example: ["Candid", "Drone"] }
 *               type: { type: string, enum: [staff, freelancer] }
 *               defaultRate: { type: number, example: 8000 }
 *               defaultResourceId: { type: string, description: "The team (VendorResource) they usually work in" }
 *               notes: { type: string }
 *     responses:
 *       201: { description: Created }
 *       409: { description: Duplicate phone }
 * /vendor-os/crew/members/{memberId}:
 *   get:
 *     summary: Crew member with upcoming assignments and payout totals (money roles)
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: memberId, required: true, schema: { type: string } }]
 *     responses: { 200: { description: Crew member } }
 *   patch:
 *     summary: Update a crew member (isActive false needs no upcoming work)
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: memberId, required: true, schema: { type: string } }]
 *     requestBody: { content: { application/json: { schema: { type: object } } } }
 *     responses: { 200: { description: Updated } }
 *   delete:
 *     summary: Deactivate a crew member (refused while they have upcoming work)
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: memberId, required: true, schema: { type: string } }]
 *     responses: { 200: { description: Deactivated } }
 * /vendor-os/crew/members/{memberId}/unavailability:
 *   post:
 *     summary: Mark a crew member unavailable (leave, other work) — blocks assignment on those days
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: memberId, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { dates: { type: array, items: { type: string } }, from: { type: string }, to: { type: string }, slot: { type: string, enum: [morning, evening, full_day] }, reason: { type: string } } }
 *     responses: { 201: { description: Entries created }, 409: { description: Already assigned on a day } }
 * /vendor-os/crew/unavailability/{entryId}:
 *   delete:
 *     summary: Remove an unavailability entry
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: entryId, required: true, schema: { type: string } }]
 *     responses: { 200: { description: Removed } }
 * /vendor-os/crew/availability:
 *   get:
 *     summary: Who is free / busy / unavailable on a date and slot
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: date, required: true, schema: { type: string, example: "2026-11-14" } }
 *       - { in: query, name: slot, schema: { type: string, enum: [morning, evening, full_day] } }
 *       - { in: query, name: skill, schema: { type: string } }
 *     responses: { 200: { description: Members with status and busyWith } }
 * /vendor-os/bookings/{bookingId}/events/{eventId}/crew:
 *   get:
 *     summary: Crew assigned to one function
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: bookingId, required: true, schema: { type: string } }
 *       - { in: path, name: eventId, required: true, schema: { type: string } }
 *     responses: { 200: { description: Assignments } }
 *   post:
 *     summary: Assign crew to a function (409 CREW_CONFLICT with conflicts[] if anyone is busy)
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: bookingId, required: true, schema: { type: string } }
 *       - { in: path, name: eventId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               assignments:
 *                 type: array
 *                 items: { type: object, required: [crewMemberId], properties: { crewMemberId: { type: string }, role: { type: string }, callTime: { type: string, example: "17:00" }, reportingLocation: { type: string }, fee: { type: number }, notes: { type: string } } }
 *     responses: { 201: { description: Assigned }, 409: { description: Crew conflict } }
 * /vendor-os/bookings/{bookingId}/events/{eventId}/crew/default-team:
 *   post:
 *     summary: Assign every member whose default team is allocated to this function (returns assigned + skipped)
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: bookingId, required: true, schema: { type: string } }
 *       - { in: path, name: eventId, required: true, schema: { type: string } }
 *     responses: { 201: { description: "{ assigned, skipped }" } }
 * /vendor-os/crew/assignments/{assignmentId}:
 *   patch:
 *     summary: Edit role / call time / reporting location / fee / notes
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: assignmentId, required: true, schema: { type: string } }]
 *     requestBody: { content: { application/json: { schema: { type: object } } } }
 *     responses: { 200: { description: Updated } }
 *   delete:
 *     summary: Remove a crew member from the function (frees the slot)
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: assignmentId, required: true, schema: { type: string } }]
 *     responses: { 200: { description: Removed } }
 * /vendor-os/crew/assignments/{assignmentId}/respond:
 *   post:
 *     summary: Confirm or decline an assignment (the crew member themselves, or the office on their behalf)
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: assignmentId, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, required: [response], properties: { response: { type: string, enum: [confirm, decline] }, reason: { type: string } } } } }
 *     responses: { 200: { description: Updated } }
 * /vendor-os/crew/me/assignments:
 *   get:
 *     summary: The logged-in crew member's own schedule (role crew)
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: from, schema: { type: string } }
 *       - { in: query, name: to, schema: { type: string } }
 *     responses: { 200: { description: "{ member, assignments }" } }
 * /vendor-os/crew/payouts:
 *   get:
 *     summary: Crew fees per assignment with per-member summary and totals
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [paid, unpaid] } }
 *       - { in: query, name: crewMemberId, schema: { type: string } }
 *       - { in: query, name: from, schema: { type: string } }
 *       - { in: query, name: to, schema: { type: string } }
 *     responses: { 200: { description: "{ items, summary, totals }" } }
 * /vendor-os/crew/payouts/mark:
 *   post:
 *     summary: Mark assignments paid (or unpaid with paid false)
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, required: [assignmentIds], properties: { assignmentIds: { type: array, items: { type: string } }, paid: { type: boolean }, mode: { type: string, enum: [cash, upi, bank, cheque, other] }, reference: { type: string } } } } }
 *     responses: { 200: { description: "{ updated }" } }
 * /vendor-os/event-day:
 *   get:
 *     summary: Event-day board — every function on a date with crew and run sheet (crew see only their own)
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: query, name: date, required: true, schema: { type: string, example: "2026-11-14" } }]
 *     responses: { 200: { description: "{ date, events, totals }" } }
 * /vendor-os/run-sheet-templates/{functionType}:
 *   get:
 *     summary: Starting run sheet for a function type
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: functionType, required: true, schema: { type: string, example: "sangeet" } }]
 *     responses: { 200: { description: Items } }
 * /vendor-os/bookings/{bookingId}/events/{eventId}/call-sheet:
 *   get:
 *     summary: Call sheet (event, crew, contacts, run sheet)
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: bookingId, required: true, schema: { type: string } }
 *       - { in: path, name: eventId, required: true, schema: { type: string } }
 *     responses: { 200: { description: Call sheet } }
 * /vendor-os/bookings/{bookingId}/events/{eventId}/call-sheet/pdf:
 *   get:
 *     summary: Call sheet PDF
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: bookingId, required: true, schema: { type: string } }
 *       - { in: path, name: eventId, required: true, schema: { type: string } }
 *     responses: { 200: { description: PDF } }
 * /vendor-os/bookings/{bookingId}/events/{eventId}/call-sheet/share:
 *   post:
 *     summary: One WhatsApp link per crew member (role, call time, venue, run-sheet link); stamps notifiedAt
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: bookingId, required: true, schema: { type: string } }
 *       - { in: path, name: eventId, required: true, schema: { type: string } }
 *     requestBody: { content: { application/json: { schema: { type: object, properties: { crewMemberIds: { type: array, items: { type: string } }, language: { type: string, enum: [hinglish, en, hi] } } } } } }
 *     responses: { 200: { description: "{ messages: [{ name, phone, waLink }], runSheetUrl }" } }
 * /vendor-os/bookings/{bookingId}/events/{eventId}/run-sheet:
 *   get:
 *     summary: Run sheet for a function (null if none yet)
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: bookingId, required: true, schema: { type: string } }
 *       - { in: path, name: eventId, required: true, schema: { type: string } }
 *     responses: { 200: { description: Run sheet } }
 *   put:
 *     summary: Save the run sheet (useTemplate true starts from the function's template)
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: bookingId, required: true, schema: { type: string } }
 *       - { in: path, name: eventId, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { useTemplate: { type: boolean }, notes: { type: string }, items: { type: array, items: { type: object, required: [time, title], properties: { time: { type: string, example: "19:30" }, endTime: { type: string }, title: { type: string }, description: { type: string }, location: { type: string }, crewMemberIds: { type: array, items: { type: string } }, status: { type: string, enum: [pending, in_progress, done, skipped] } } } } } }
 *     responses: { 200: { description: Saved (with publicUrl) } }
 *   delete:
 *     summary: Delete the run sheet (owner / manager)
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: bookingId, required: true, schema: { type: string } }
 *       - { in: path, name: eventId, required: true, schema: { type: string } }
 *     responses: { 200: { description: Deleted } }
 * /vendor-os/bookings/{bookingId}/events/{eventId}/run-sheet/items/{itemId}:
 *   patch:
 *     summary: Set a run-sheet item's live status on the day
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: bookingId, required: true, schema: { type: string } }
 *       - { in: path, name: eventId, required: true, schema: { type: string } }
 *       - { in: path, name: itemId, required: true, schema: { type: string } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, properties: { status: { type: string, enum: [pending, in_progress, done, skipped] } } } } } }
 *     responses: { 200: { description: Updated } }
 * /vendor-os/bookings/{bookingId}/events/{eventId}/run-sheet/share:
 *   post:
 *     summary: Share the event-day schedule with the client (public link + WhatsApp)
 *     tags: [Vendor OS Crew]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: bookingId, required: true, schema: { type: string } }
 *       - { in: path, name: eventId, required: true, schema: { type: string } }
 *     responses: { 200: { description: "{ publicUrl, whatsapp }" } }
 */
const crewOnly = requireVendorRole('crew');

router.get('/crew/me/assignments', crewOnly, Crew.myAssignments);
router.get('/crew/members', office, Crew.listMembers);
router.post('/crew/members', managers, validate(v.createCrewMemberSchema), Crew.createMember);
router.get('/crew/members/:memberId', office, Crew.getMember);
router.patch('/crew/members/:memberId', managers, validate(v.updateCrewMemberSchema), Crew.updateMember);
router.delete('/crew/members/:memberId', managers, Crew.deactivateMember);
router.post('/crew/members/:memberId/unavailability', office, validate(v.crewUnavailabilitySchema), Crew.addUnavailability);
router.delete('/crew/unavailability/:entryId', office, Crew.removeUnavailability);
router.get('/crew/availability', office, validate(v.crewAvailabilitySchema), Crew.availability);

router.patch('/crew/assignments/:assignmentId', office, validate(v.updateAssignmentSchema), Crew.updateAssignment);
router.delete('/crew/assignments/:assignmentId', office, Crew.removeAssignment);
router.post('/crew/assignments/:assignmentId/respond', everyone, validate(v.respondAssignmentSchema), Crew.respond);
router.get('/crew/payouts', managers, Crew.payouts);
router.post('/crew/payouts/mark', managers, validate(v.markPayoutSchema), Crew.markPayouts);

router.get('/event-day', everyone, validate(v.daySheetSchema), Crew.daySheet);
router.get('/run-sheet-templates/:functionType', office, Crew.runSheetTemplate);

const eventPath = '/bookings/:bookingId/events/:eventId';
router.get(`${eventPath}/crew`, office, Crew.listForEvent);
router.post(`${eventPath}/crew`, office, validate(v.assignCrewSchema), Crew.assign);
router.post(`${eventPath}/crew/default-team`, office, Crew.assignDefaultTeam);
router.get(`${eventPath}/call-sheet`, office, Crew.callSheet);
router.get(`${eventPath}/call-sheet/pdf`, office, Crew.callSheetPdf);
router.post(`${eventPath}/call-sheet/share`, office, validate(v.shareCallSheetSchema), Crew.shareCallSheet);
router.get(`${eventPath}/run-sheet`, office, Crew.getRunSheet);
router.put(`${eventPath}/run-sheet`, office, validate(v.saveRunSheetSchema), Crew.saveRunSheet);
router.delete(`${eventPath}/run-sheet`, managers, Crew.deleteRunSheet);
router.patch(`${eventPath}/run-sheet/items/:itemId`, office, validate(v.runSheetItemStatusSchema), Crew.updateRunSheetItem);
router.post(`${eventPath}/run-sheet/share`, office, Crew.shareRunSheet);

export default router;
