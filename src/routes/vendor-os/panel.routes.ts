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
// ---------------------------------------------------------------------------
router.get('/bookings', office, Booking.list);
router.post('/bookings', office, validate(v.createBookingSchema), Booking.create);
router.get('/bookings/:bookingId', office, Booking.get);
router.patch('/bookings/:bookingId', office, validate(v.updateBookingSchema), Booking.update);
router.post('/bookings/:bookingId/status', office, validate(v.bookingStatusSchema), Booking.changeStatus);
router.get('/bookings/:bookingId/payments', managers, Booking.listBookingPayments);
router.post('/bookings/:bookingId/payments', managers, validate(v.recordPaymentSchema), Booking.recordPayment);
router.post('/bookings/:bookingId/reminders', managers, validate(v.reminderSchema), Booking.sendReminder);

router.get('/payments', managers, Booking.listPayments);
router.get('/payments/dues', managers, Booking.dues);
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

router.get('/quotes', office, Quote.list);
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

router.get('/clients', office, Crm.listClients);
router.post('/clients', office, validate(v.createClientSchema), Crm.createClient);
router.get('/clients/:clientId', office, Crm.getClient);
router.patch('/clients/:clientId', office, validate(v.updateClientSchema), Crm.updateClient);

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


router.get('/team', managers, Workspace.listTeam);
router.post('/team', ownerOnly, validate(v.inviteMemberSchema), Workspace.inviteMember);
router.patch('/team/:memberId', ownerOnly, validate(v.updateMemberSchema), Workspace.updateMember);
router.delete('/team/:memberId', ownerOnly, Workspace.removeMember);

// ---------------------------------------------------------------------------
// Phase 2 — Wedding-day team: crew roster, assignments, call sheets, run sheets
// ---------------------------------------------------------------------------
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
