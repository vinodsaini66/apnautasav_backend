import { z } from 'zod';
import {
  BOOKING_SLOTS,
  BUDGET_BANDS,
  LEAD_LOST_REASONS,
  LEAD_SOURCES,
  LEAD_STATUSES,
  MESSAGE_LANGUAGES,
  MESSAGE_TEMPLATE_TYPES,
  PAYMENT_MODES,
  PRICING_BASES,
  RESOURCE_TYPES,
  VENDOR_OS_PLANS,
  BOOKING_STATUSES,
  QUOTE_STATUSES,
  NOTIFICATION_CATEGORIES,
} from '../constants/vendorOs';

// Request validation for every Vendor OS route (routes/vendor-os/*).

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use YYYY-MM-DD');
const isoDateTime = z.string().refine((v) => !isNaN(Date.parse(v)), 'Invalid date/time');
const phone = z.string().trim().regex(/^\+?[\d\s-]{10,15}$/, 'Invalid phone number');
const money = z.number().min(0).max(1_000_000_000);
const shortText = (max = 200) => z.string().trim().max(max);
const url = z.string().trim().url().max(2000);
const idParam = (name: string) => z.object({ [name]: objectId });

// ---------------------------------------------------------------------------
// Auth & onboarding
// ---------------------------------------------------------------------------

export const sendOtpSchema = z.object({ body: z.object({ phone }) });

export const verifyOtpSchema = z.object({
  body: z.object({
    phone,
    otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
    name: shortText(100).optional(),
    fcmToken: shortText(500).optional(),
  }),
});

export const refreshSchema = z.object({ body: z.object({ refreshToken: z.string().min(10) }) });

export const updateMeSchema = z.object({
  body: z.object({
    name: shortText(100).optional(),
    language: z.enum(['en', 'hi']).optional(),
    fcmToken: shortText(500).optional(),
    notificationPrefs: z
      .record(z.enum(NOTIFICATION_CATEGORIES), z.object({ push: z.boolean().optional(), whatsapp: z.boolean().optional() }))
      .optional(),
  }),
});

const email = z.string().trim().email('Enter a valid email address').max(200);
const password = z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password is too long');
const token64 = z.string().regex(/^[a-f\d]{64}$/i, 'Invalid or expired link');

export const signupSchema = z.object({
  body: z.object({
    businessName: z.string().trim().min(2, 'Business name must be at least 2 characters').max(150),
    email,
    password,
    name: shortText(100).optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({ email, password: z.string().min(1, 'Password is required').max(128), fcmToken: shortText(500).optional() }),
});

export const emailOnlySchema = z.object({ body: z.object({ email }) });

export const tokenSchema = z.object({ body: z.object({ token: token64, fcmToken: shortText(500).optional() }) });

export const resetPasswordSchema = z.object({ body: z.object({ token: token64, password }) });

export const changePasswordSchema = z.object({
  body: z.object({ currentPassword: z.string().max(128).optional(), newPassword: password }),
});

export const phoneLinkSchema = z.object({ body: z.object({ phone }) });
export const phoneLinkVerifySchema = z.object({ body: z.object({ otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits') }) });

// The basic profile gate (onboarding.service.ts). Everything is optional in
// the request because each field may already be known (business name from
// email sign-up, phone from OTP login); the service reports what's missing.
export const basicProfileSchema = z.object({
  body: z.object({
    businessName: z.string().trim().min(2).max(150).optional(),
    osCategory: z.string().trim().min(2).max(50).optional(),
    city: z.string().trim().min(2).max(100).optional(),
    state: shortText(100).optional(),
    contactPerson: z.string().trim().min(2).max(100).optional(),
    phone: phone.optional(),
    whatsappNumber: phone.optional(),
    email: email.optional(),
    subTags: z.array(shortText(60)).max(20).optional(),
  }),
});

// Old single-step onboarding body — still accepted by /auth/onboarding.
export const onboardingSchema = basicProfileSchema;

// ---------------------------------------------------------------------------
// Profile, packages, portfolio
// ---------------------------------------------------------------------------

const locationSchema = z.object({
  address: shortText(300).optional(),
  area: shortText(100).optional(),
  city: shortText(100).optional(),
  state: shortText(100).optional(),
  pincode: shortText(10).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  googlePlaceId: shortText(200).optional(),
});

export const updateProfileSchema = z.object({
  body: z
    .object({
      businessName: z.string().trim().min(2).max(150),
      displayName: shortText(150),
      tagline: shortText(160),
      description: shortText(5000),
      shortDescription: shortText(500),
      logo: url.or(z.literal('')),
      coverImages: z.array(url).max(8),
      contactPerson: shortText(100),
      email: z.string().email(),
      phone,
      alternatePhone: phone,
      whatsappNumber: phone,
      website: url.or(z.literal('')),
      location: locationSchema,
      locations: z.array(locationSchema.extend({ label: shortText(100).optional(), phone: phone.optional(), whatsappNumber: phone.optional() })).max(10),
      serviceCities: z.array(shortText(100)).max(50),
      languages: z.array(shortText(50)).max(20),
      subTags: z.array(shortText(60)).max(20),
      travelPolicy: shortText(500),
      yearEstablished: z.number().int().min(1900).max(2100),
      experienceYears: z.number().int().min(0).max(100),
      teamSize: z.number().int().min(1).max(10000),
      gstNumber: z.string().trim().regex(/^[0-9A-Z]{15}$/i, 'GSTIN must be 15 characters').or(z.literal('')),
      upiId: z.string().trim().regex(/^[\w.-]+@[\w.-]+$/, 'Invalid UPI ID').or(z.literal('')),
      brochureUrl: url,
      socialLinks: z.object({
        instagram: url.or(z.literal('')).optional(),
        facebook: url.or(z.literal('')).optional(),
        youtube: url.or(z.literal('')).optional(),
        pinterest: url.or(z.literal('')).optional(),
        googleBusiness: url.or(z.literal('')).optional(),
      }),
      documents: z
        .array(z.object({ key: z.string().trim().min(1).max(40), label: shortText(120), url, name: shortText(200).optional() }))
        .max(30),
      messageLanguage: z.enum(MESSAGE_LANGUAGES),
      showExactAddress: z.boolean(),
      policies: z.object({
        advancePercent: z.number().min(0).max(100).optional(),
        advance: shortText(1000).optional(),
        cancellation: shortText(1000).optional(),
        schedule: z
          .array(z.object({ label: shortText(80), when: shortText(80).optional(), percent: z.number().min(0).max(100) }))
          .max(6)
          .refine((rows) => rows.reduce((s, r) => s + r.percent, 0) <= 100, 'Schedule adds up to more than 100%')
          .optional(),
        nonRefundableAdvance: z.boolean().optional(),
        allowDateChange: z.boolean().optional(),
      }),
      profileDetails: z.object({
        services: z.array(shortText(100)).max(50).optional(),
        workingStyle: shortText(500).optional(),
        paymentTerms: shortText(500).optional(),
        travelCost: shortText(300).optional(),
        deliveryTime: shortText(300).optional(),
      }),
      awards: z.array(shortText(200)).max(20),
      categoryProfile: z.record(z.any()),
    })
    .partial(),
});

const packageBody = z.object({
  kind: z.enum(['package', 'addon']).optional(),
  name: z.string().trim().min(1).max(120),
  description: shortText(2000).optional(),
  includes: z.array(shortText(200)).max(50).optional(),
  excludes: z.array(shortText(200)).max(50).optional(),
  price: money,
  pricingBasis: z.enum(PRICING_BASES).optional(),
  unit: shortText(50).optional(),
  duration: shortText(100).optional(),
  taxPercent: z.number().min(0).max(28).optional(),
  isPopular: z.boolean().optional(),
  addonIds: z.array(objectId).max(30).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export const createPackageSchema = z.object({ body: packageBody });
export const updatePackageSchema = z.object({ params: idParam('packageId'), body: packageBody.partial() });

const albumBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: shortText(1000).optional(),
  coverImage: url.optional(),
  functionTag: shortText(50).optional(),
  themeTags: z.array(shortText(50)).max(20).optional(),
  venue: shortText(200).optional(),
  city: shortText(100).optional(),
  season: shortText(50).optional(),
  sortOrder: z.number().int().optional(),
});
export const createAlbumSchema = z.object({ body: albumBody });
export const updateAlbumSchema = z.object({ params: idParam('albumId'), body: albumBody.partial() });

const mediaItem = z.object({
  type: z.enum(['image', 'video', 'embed']),
  url,
  thumbnailUrl: url.optional(),
  title: shortText(200).optional(),
  description: shortText(1000).optional(),
  albumId: objectId.optional(),
  sortOrder: z.number().int().optional(),
  isFeatured: z.boolean().optional(),
});
export const addMediaSchema = z.object({ body: z.object({ items: z.array(mediaItem).min(1).max(50) }) });
export const updateMediaSchema = z.object({
  params: idParam('mediaId'),
  body: mediaItem.omit({ type: true, url: true }).partial(),
});

// ---------------------------------------------------------------------------
// Calendar & resources
// ---------------------------------------------------------------------------

const resourceBody = z.object({
  type: z.enum(RESOURCE_TYPES).optional(),
  name: z.string().trim().min(1).max(100),
  description: shortText(500).optional(),
  capacity: z.number().int().min(1).max(100000).optional(),
  memberId: objectId.nullable().optional(),
  color: shortText(20).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export const createResourceSchema = z.object({ body: resourceBody });
export const updateResourceSchema = z.object({ params: idParam('resourceId'), body: resourceBody.partial() });

export const calendarQuerySchema = z.object({
  query: z.object({ from: dateStr.optional(), to: dateStr.optional(), resourceId: objectId.optional() }),
});

export const availabilityQuerySchema = z.object({
  query: z.object({ dates: z.string().min(10) }),
});

export const manualBlockSchema = z.object({
  body: z
    .object({
      resourceIds: z.array(objectId).max(50).optional(),
      dates: z.array(dateStr).max(90).optional(),
      from: dateStr.optional(),
      to: dateStr.optional(),
      slot: z.enum(BOOKING_SLOTS).default('full_day'),
      reason: shortText(200).optional(),
      soft: z.boolean().optional(),
    })
    .refine((b) => (b.dates && b.dates.length) || (b.from && b.to), 'Provide dates or a from/to range'),
});

const allocation = z.object({ resourceId: objectId, units: z.number().int().min(1).max(100000).optional() });
const bookingEvent = z.object({
  _id: objectId.optional(),
  functionType: z.string().trim().min(1).max(60),
  date: dateStr,
  slot: z.enum(BOOKING_SLOTS).optional(),
  startTime: shortText(10).optional(),
  endTime: shortText(10).optional(),
  venue: shortText(200).optional(),
  city: shortText(100).optional(),
  guestCount: z.number().int().min(0).max(100000).optional(),
  notes: shortText(1000).optional(),
  resourceAllocations: z.array(allocation).max(20).optional(),
});

export const conflictCheckSchema = z.object({
  body: z.object({ events: z.array(bookingEvent).min(1).max(30), excludeBookingId: objectId.optional() }),
});

// ---------------------------------------------------------------------------
// Leads & clients
// ---------------------------------------------------------------------------

const leadBody = z.object({
  name: z.string().trim().min(1).max(120),
  phone,
  email: z.string().email().optional(),
  source: z.enum(LEAD_SOURCES),
  eventType: shortText(60).optional(),
  weddingDates: z.array(dateStr).max(15).optional(),
  functions: z.array(shortText(60)).max(15).optional(),
  city: shortText(100).optional(),
  venue: shortText(200).optional(),
  budgetBand: z.enum(BUDGET_BANDS).optional(),
  budgetAmount: money.optional(),
  guestCount: z.number().int().min(0).max(100000).optional(),
  message: shortText(2000).optional(),
  notes: shortText(5000).optional(),
  assignedTo: objectId.optional(),
  nextFollowUpAt: isoDateTime.optional(),
});
// `force: true` skips the duplicate check (an open lead with the same phone).
export const createLeadSchema = z.object({ body: leadBody.extend({ force: z.boolean().optional() }) });

export const listLeadsSchema = z.object({
  query: z
    .object({
      page: z.string().regex(/^\d+$/).optional(),
      limit: z.string().regex(/^\d+$/).optional(),
      search: z.string().max(100).optional(),
      status: z.string().max(100).optional(),
      source: z.string().max(200).optional(),
      followUp: z.enum(['overdue', 'today', 'upcoming']).optional(),
      sort: z.enum(['newest', 'oldest', 'wedding', 'followUp', 'activity']).optional(),
      weddingFrom: dateStr.optional(),
      weddingTo: dateStr.optional(),
      assignedTo: objectId.optional(),
    })
    .passthrough(),
});
export const updateLeadSchema = z.object({
  params: idParam('leadId'),
  body: leadBody.omit({ phone: true, nextFollowUpAt: true }).partial().extend({ assignedTo: objectId.nullable().optional() }),
});
export const leadStatusSchema = z.object({
  params: idParam('leadId'),
  body: z.object({ status: z.enum(LEAD_STATUSES), lostReason: z.enum(LEAD_LOST_REASONS).optional(), lostNote: shortText(500).optional() }),
});
export const leadNoteSchema = z.object({
  params: idParam('leadId'),
  body: z.object({ type: z.enum(['note', 'call', 'meeting']).default('note'), text: z.string().trim().min(1).max(5000) }),
});
export const leadFollowUpSchema = z.object({
  params: idParam('leadId'),
  body: z.object({ at: isoDateTime.nullable(), note: shortText(500).optional() }),
});

const clientBody = z.object({
  name: z.string().trim().min(1).max(120),
  contactPerson: shortText(120).optional(),
  phone,
  email: z.string().trim().email().or(z.literal('')).optional(),
  city: shortText(100).optional(),
  address: shortText(500).optional(),
  notes: shortText(2000).optional(),
  tags: z.array(shortText(50)).max(20).optional(),
});
export const listClientsSchema = z.object({
  query: z
    .object({
      page: z.string().regex(/^\d+$/).optional(),
      limit: z.string().regex(/^\d+$/).optional(),
      search: z.string().trim().max(100).optional(),
      tag: shortText(50).optional(),
      sort: z.enum(['recent', 'name', 'value', 'bookings', 'newest']).optional(),
    })
    .passthrough(),
});
export const clientNoteSchema = z.object({
  params: idParam('clientId'),
  body: z.object({ type: z.enum(['note', 'call', 'meeting']).default('note'), text: z.string().trim().min(1).max(5000) }),
});
export const createClientSchema = z.object({ body: clientBody });
export const updateClientSchema = z.object({ params: idParam('clientId'), body: clientBody.partial() });

// ---------------------------------------------------------------------------
// Quotes & templates
// ---------------------------------------------------------------------------

const quoteItem = z.object({
  name: z.string().trim().min(1).max(200),
  description: shortText(1000).optional(),
  qty: z.number().min(0).max(1_000_000).optional(),
  unit: shortText(30).optional(),
  rate: money.optional(),
  taxPercent: z.number().min(0).max(28).optional(),
  packageId: objectId.optional(),
});
const scheduleRow = z.object({
  label: z.string().trim().min(1).max(120),
  percent: z.number().min(0).max(100).optional(),
  amount: money.optional(),
  dueDate: dateStr.optional(),
});
const quoteEvent = z.object({
  functionType: z.string().trim().min(1).max(60),
  date: dateStr,
  slot: z.enum(BOOKING_SLOTS).optional(),
  venue: shortText(200).optional(),
  guestCount: z.number().int().min(0).max(100000).optional(),
});
const clientInline = z.object({ name: z.string().trim().min(1).max(120), phone, email: z.string().email().optional() });

const quoteContent = z.object({
  title: shortText(200).optional(),
  items: z.array(quoteItem).max(100).optional(),
  discount: z.object({ type: z.enum(['flat', 'percent']), value: z.number().min(0) }).optional(),
  gstEnabled: z.boolean().optional(),
  validTill: dateStr.optional(),
  terms: shortText(5000).optional(),
  deliverables: z.array(shortText(300)).max(50).optional(),
  notes: shortText(2000).optional(),
  paymentSchedule: z.array(scheduleRow).max(12).optional(),
  events: z.array(quoteEvent).max(30).optional(),
});
export const createQuoteSchema = z.object({
  body: quoteContent.extend({
    leadId: objectId.optional(),
    clientId: objectId.optional(),
    client: clientInline.optional(),
    templateId: objectId.optional(),
    packageIds: z.array(objectId).max(20).optional(),
  }),
});
export const updateQuoteSchema = z.object({ params: idParam('quoteId'), body: quoteContent });
export const listQuotesSchema = z.object({
  query: z
    .object({
      page: z.string().regex(/^\d+$/).optional(),
      limit: z.string().regex(/^\d+$/).optional(),
      search: z.string().trim().max(100).optional(),
      status: z
        .string()
        .refine((v) => v.split(',').every((s) => (QUOTE_STATUSES as readonly string[]).includes(s)), 'Unknown quote status')
        .optional(),
      leadId: objectId.optional(),
      clientId: objectId.optional(),
      sort: z.enum(['newest', 'oldest', 'eventDate', 'validTill', 'total']).optional(),
    })
    .passthrough(),
});
export const quoteStatusSchema = z.object({
  params: idParam('quoteId'),
  body: z.object({ status: z.enum(['accepted', 'declined']), reason: shortText(500).optional() }),
});
export const sendQuoteSchema = z.object({
  params: idParam('quoteId'),
  body: z.object({ language: z.enum(MESSAGE_LANGUAGES).optional() }).optional().default({}),
});
export const saveAsTemplateSchema = z.object({ params: idParam('quoteId'), body: z.object({ name: z.string().trim().min(1).max(120) }) });

const quoteTemplateBody = z.object({
  name: z.string().trim().min(1).max(120),
  title: shortText(200).optional(),
  items: z.array(quoteItem).max(100).optional(),
  gstEnabled: z.boolean().optional(),
  validityDays: z.number().int().min(1).max(365).optional(),
  terms: shortText(5000).optional(),
  deliverables: z.array(shortText(300)).max(50).optional(),
  paymentSchedule: z
    .array(z.object({ label: z.string().trim().min(1).max(120), percent: z.number().min(0).max(100), dueOffsetDays: z.number().int().optional() }))
    .max(12)
    .optional(),
});
export const createQuoteTemplateSchema = z.object({ body: quoteTemplateBody });
export const updateQuoteTemplateSchema = z.object({ params: idParam('templateId'), body: quoteTemplateBody.partial() });

// ---------------------------------------------------------------------------
// Bookings & payments
// ---------------------------------------------------------------------------

const milestone = z.object({ _id: objectId.optional(), label: z.string().trim().min(1).max(120), amount: money, dueDate: dateStr.optional() });

export const createBookingSchema = z.object({
  body: z.object({
    leadId: objectId.optional(),
    clientId: objectId.optional(),
    client: clientInline.optional(),
    title: shortText(200).optional(),
    status: z.enum(['hold', 'tentative', 'confirmed']).optional(),
    holdExpiresAt: isoDateTime.optional(),
    events: z.array(bookingEvent).min(1).max(30),
    totalAmount: money.optional(),
    paymentSchedule: z.array(milestone).max(12).optional(),
    autoReminders: z.boolean().optional(),
    autoAllocate: z.boolean().optional(),
    notes: shortText(5000).optional(),
  }),
});
export const listBookingsSchema = z.object({
  query: z
    .object({
      page: z.string().regex(/^\d+$/).optional(),
      limit: z.string().regex(/^\d+$/).optional(),
      search: z.string().trim().max(100).optional(),
      status: z
        .string()
        .refine((v) => v.split(',').every((s) => (BOOKING_STATUSES as readonly string[]).includes(s)), 'Unknown booking status')
        .optional(),
      from: dateStr.optional(),
      to: dateStr.optional(),
      clientId: objectId.optional(),
      when: z.enum(['upcoming', 'past']).optional(),
      balance: z.enum(['due', 'cleared']).optional(),
      sort: z.enum(['eventDate', 'eventDateDesc', 'newest', 'oldest']).optional(),
    })
    .passthrough(),
});
export const updateBookingSchema = z.object({
  params: idParam('bookingId'),
  body: z.object({
    title: shortText(200).optional(),
    notes: shortText(5000).optional(),
    events: z.array(bookingEvent).min(1).max(30).optional(),
    totalAmount: money.optional(),
    paymentSchedule: z.array(milestone).max(12).optional(),
    autoReminders: z.boolean().optional(),
    holdExpiresAt: isoDateTime.nullable().optional(),
  }),
});
export const bookingStatusSchema = z.object({
  params: idParam('bookingId'),
  body: z.object({ status: z.enum(BOOKING_STATUSES), reason: shortText(500).optional(), holdExpiresAt: isoDateTime.optional() }),
});
export const recordPaymentSchema = z.object({
  params: idParam('bookingId'),
  body: z.object({
    amount: z.number().positive().max(1_000_000_000),
    mode: z.enum(PAYMENT_MODES),
    reference: shortText(200).optional(),
    proofUrl: url.optional(),
    receivedAt: isoDateTime.optional(),
    milestoneId: objectId.optional(),
    notes: shortText(1000).optional(),
  }),
});
export const listPaymentsSchema = z.object({
  query: z
    .object({
      page: z.string().regex(/^\d+$/).optional(),
      limit: z.string().regex(/^\d+$/).optional(),
      from: dateStr.optional(),
      to: dateStr.optional(),
      mode: z
        .string()
        .refine((v) => v.split(',').every((m) => (PAYMENT_MODES as readonly string[]).includes(m)), 'Unknown payment mode')
        .optional(),
      bookingId: objectId.optional(),
      search: z.string().trim().max(100).optional(),
      includeVoided: z.enum(['true', 'false']).optional(),
    })
    .passthrough(),
});
export const paymentDuesSchema = z.object({
  query: z.object({ bucket: z.enum(['week', 'overdue', 'today', 'upcoming']).optional() }).passthrough(),
});
export const voidPaymentSchema = z.object({ params: idParam('paymentId'), body: z.object({ reason: z.string().trim().min(1).max(500) }) });
export const reminderSchema = z.object({
  params: idParam('bookingId'),
  body: z.object({ milestoneId: objectId.optional(), language: z.enum(MESSAGE_LANGUAGES).optional() }).optional().default({}),
});

// ---------------------------------------------------------------------------
// WhatsApp & message templates
// ---------------------------------------------------------------------------

export const composeSchema = z.object({
  body: z
    .object({
      templateId: objectId.optional(),
      templateKey: shortText(60).optional(),
      language: z.enum(MESSAGE_LANGUAGES).optional(),
      body: shortText(4000).optional(),
      leadId: objectId.optional(),
      bookingId: objectId.optional(),
      quoteId: objectId.optional(),
      paymentId: objectId.optional(),
      milestoneId: objectId.optional(),
      clientId: objectId.optional(),
      phone: phone.optional(),
      variables: z.record(z.string().max(1000)).optional(),
      log: z.boolean().optional(),
    })
    .refine((b) => b.templateId || b.templateKey || b.body, 'Provide templateId, templateKey or body'),
});

const messageTemplateBody = z.object({
  key: z.string().trim().regex(/^[a-z0-9_]{2,60}$/, 'key: lowercase letters, digits, underscore').optional(),
  name: z.string().trim().min(1).max(120),
  type: z.enum(MESSAGE_TEMPLATE_TYPES),
  language: z.enum(MESSAGE_LANGUAGES).optional(),
  body: z.string().trim().min(1).max(4000),
  isActive: z.boolean().optional(),
});
export const createMessageTemplateSchema = z.object({ body: messageTemplateBody });
export const updateMessageTemplateSchema = z.object({
  params: idParam('templateId'),
  body: messageTemplateBody.pick({ name: true, body: true, isActive: true }).partial(),
});

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

export const inviteMemberSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(100),
    phone,
    email: z.string().trim().email().or(z.literal('')).optional(),
    role: z.enum(['manager', 'staff', 'crew']),
    crew: z.object({ defaultResourceId: objectId.nullable().optional(), role: shortText(80).optional() }).optional(),
  }),
});
export const updateMemberSchema = z.object({
  params: idParam('memberId'),
  body: z.object({
    name: shortText(100).optional(),
    role: z.enum(['manager', 'staff', 'crew']).optional(),
    status: z.enum(['active', 'disabled']).optional(),
  }),
});

// ---------------------------------------------------------------------------
// Public & family
// ---------------------------------------------------------------------------

export const publicAvailabilitySchema = z.object({
  query: z.object({ from: dateStr.optional(), to: dateStr.optional() }),
});
export const whatsappClickSchema = z.object({
  body: z.object({
    name: shortText(120).optional(),
    phone: phone.optional(),
    message: shortText(1000).optional(),
    weddingDate: dateStr.optional(),
  }),
});
export const publicQuoteActionSchema = z.object({
  params: z.object({ token: z.string().regex(/^[a-f\d]{32}$/i) }),
  body: z.object({ reason: shortText(500).optional() }).optional().default({}),
});
export const familyBulkEnquirySchema = z.object({
  body: z.object({
    vendorIds: z.array(objectId).min(1).max(10),
    weddingId: objectId.optional(),
    fullName: z.string().trim().min(1).max(120),
    phone,
    email: z.string().email().optional(),
    functionDate: dateStr.optional(),
    functionType: shortText(60).optional(),
    guestCount: z.number().int().min(0).max(100000).optional(),
    message: shortText(1000).optional(),
  }),
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const adminRejectSchema = z.object({ params: idParam('vendorId'), body: z.object({ reason: z.string().trim().min(1).max(1000) }) });
export const adminSuspendSchema = z.object({
  params: idParam('vendorId'),
  body: z.object({ suspended: z.boolean(), reason: shortText(1000).optional() }),
});
export const adminVerificationSchema = z.object({
  params: idParam('vendorId'),
  body: z.object({ phone: z.boolean().optional(), gst: z.boolean().optional(), identity: z.boolean().optional(), visited: z.boolean().optional() }),
});
export const adminPlanSchema = z.object({ params: idParam('vendorId'), body: z.object({ plan: z.enum(VENDOR_OS_PLANS) }) });
export const adminAssignOwnerSchema = z.object({
  params: idParam('vendorId'),
  body: z.object({ phone, name: shortText(100).optional(), osCategory: z.string().trim().min(2).max(50) }),
});

const categoryConfigBody = z.object({
  key: z.string().trim().regex(/^[a-z0-9_-]{2,50}$/),
  name: z.string().trim().min(1).max(100),
  icon: shortText(10).optional(),
  description: shortText(1000).optional(),
  pricingBasis: z.enum(PRICING_BASES),
  resourceType: z.enum(RESOURCE_TYPES),
  defaultResourceName: shortText(100).optional(),
  defaultResourceCapacity: z.number().int().min(1).optional(),
  softBlockDayBefore: z.boolean().optional(),
  marketplaceCategorySlug: shortText(100).optional(),
  subTagOptions: z.array(shortText(60)).max(50).optional(),
  profileSchema: z
    .array(
      z.object({
        key: z.string().regex(/^[a-zA-Z0-9_]{1,50}$/),
        label: shortText(100),
        type: z.enum(['text', 'textarea', 'number', 'boolean', 'select', 'multiselect', 'tags']),
        options: z.array(shortText(100)).optional(),
        required: z.boolean().optional(),
        group: shortText(60).optional(),
        unit: shortText(20).optional(),
      })
    )
    .max(80)
    .optional(),
  defaultQuoteItems: z
    .array(z.object({ name: shortText(200), unit: shortText(30).optional(), rate: money.optional(), qty: z.number().min(0).optional(), taxPercent: z.number().min(0).max(28).optional() }))
    .max(50)
    .optional(),
  defaultDeliverables: z.array(shortText(300)).max(50).optional(),
  defaultTerms: shortText(5000).optional(),
  defaultFaqs: z.array(shortText(300)).max(50).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export const createCategoryConfigSchema = z.object({ body: categoryConfigBody });
export const updateCategoryConfigSchema = z.object({ params: z.object({ key: z.string() }), body: categoryConfigBody.omit({ key: true }).partial() });

export const listQuerySchema = z.object({
  query: z
    .object({
      page: z.string().regex(/^\d+$/).optional(),
      limit: z.string().regex(/^\d+$/).optional(),
      status: z.string().optional(),
    })
    .passthrough(),
});

// ---------------------------------------------------------------------------
// Crew, call sheets & run sheets (Phase 2)
// ---------------------------------------------------------------------------

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24h)');

const crewMemberBody = z.object({
  name: z.string().trim().min(1).max(120),
  phone,
  role: shortText(80).optional(),
  skills: z.array(shortText(60)).max(20).optional(),
  type: z.enum(['staff', 'freelancer']).optional(),
  defaultRate: money.optional(),
  defaultResourceId: objectId.nullable().optional(),
  notes: shortText(1000).optional(),
  isActive: z.boolean().optional(),
});
export const createCrewMemberSchema = z.object({ body: crewMemberBody });
export const updateCrewMemberSchema = z.object({ params: idParam('memberId'), body: crewMemberBody.partial() });

export const crewUnavailabilitySchema = z.object({
  params: idParam('memberId'),
  body: z
    .object({
      dates: z.array(dateStr).max(90).optional(),
      from: dateStr.optional(),
      to: dateStr.optional(),
      slot: z.enum(BOOKING_SLOTS).default('full_day'),
      reason: shortText(200).optional(),
    })
    .refine((b) => (b.dates && b.dates.length) || (b.from && b.to), 'Provide dates or a from/to range'),
});

export const crewAvailabilitySchema = z.object({
  query: z.object({ date: dateStr, slot: z.enum(BOOKING_SLOTS).optional(), skill: z.string().optional() }),
});

const eventParams = z.object({ bookingId: objectId, eventId: objectId });

export const assignCrewSchema = z.object({
  params: eventParams,
  body: z.object({
    assignments: z
      .array(
        z.object({
          crewMemberId: objectId,
          role: shortText(80).optional(),
          callTime: hhmm.optional(),
          reportingLocation: shortText(300).optional(),
          fee: money.optional(),
          notes: shortText(1000).optional(),
        })
      )
      .min(1)
      .max(50),
  }),
});

export const updateAssignmentSchema = z.object({
  params: idParam('assignmentId'),
  body: z.object({
    role: shortText(80).optional(),
    callTime: hhmm.optional(),
    reportingLocation: shortText(300).optional(),
    fee: money.optional(),
    notes: shortText(1000).optional(),
  }),
});

export const respondAssignmentSchema = z.object({
  params: idParam('assignmentId'),
  body: z.object({ response: z.enum(['confirm', 'decline']), reason: shortText(500).optional() }),
});

export const markPayoutSchema = z.object({
  body: z.object({
    assignmentIds: z.array(objectId).min(1).max(200),
    paid: z.boolean().optional(),
    mode: z.enum(['cash', 'upi', 'bank', 'cheque', 'other']).optional(),
    reference: shortText(200).optional(),
  }),
});

const runSheetItem = z.object({
  _id: objectId.optional(),
  time: hhmm,
  endTime: hhmm.optional(),
  title: z.string().trim().min(1).max(200),
  description: shortText(1000).optional(),
  location: shortText(200).optional(),
  crewMemberIds: z.array(objectId).max(50).optional(),
  status: z.enum(['pending', 'in_progress', 'done', 'skipped']).optional(),
});

export const saveRunSheetSchema = z.object({
  params: eventParams,
  body: z.object({ items: z.array(runSheetItem).max(100).optional(), notes: shortText(3000).optional(), useTemplate: z.boolean().optional() }),
});

export const runSheetItemStatusSchema = z.object({
  params: eventParams.extend({ itemId: objectId }),
  body: z.object({ status: z.enum(['pending', 'in_progress', 'done', 'skipped']) }),
});

export const shareCallSheetSchema = z.object({
  params: eventParams,
  body: z
    .object({ crewMemberIds: z.array(objectId).max(50).optional(), language: z.enum(MESSAGE_LANGUAGES).optional() })
    .optional()
    .default({}),
});

export const daySheetSchema = z.object({ query: z.object({ date: dateStr }) });
