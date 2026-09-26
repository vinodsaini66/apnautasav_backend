// Enums shared by Vendor OS models, validators and services — single source
// of truth so the Mongoose enum and the Zod enum can't drift apart.

export const VENDOR_USER_ROLES = ['owner', 'manager', 'staff', 'crew'] as const;
export type VendorUserRole = (typeof VENDOR_USER_ROLES)[number];

export const RESOURCE_TYPES = ['space_slot', 'crew', 'capacity', 'artist_slot', 'inventory', 'production_date'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const PRICING_BASES = [
  'per_day',
  'per_plate',
  'per_function',
  'per_face',
  'per_card',
  'per_vehicle',
  'per_hour',
  'per_event',
  'flat',
] as const;
export type PricingBasis = (typeof PRICING_BASES)[number];

// Legacy WeddingVendor.pricing.priceUnit values (the public listing's
// display string) — Vendor OS keeps it in sync from the package basis.
export const PRICING_BASIS_TO_PRICE_UNIT: Record<PricingBasis, string> = {
  per_day: 'per day',
  per_plate: 'per plate',
  per_function: 'per function',
  per_face: 'starting from',
  per_card: 'starting from',
  per_vehicle: 'per day',
  per_hour: 'starting from',
  per_event: 'per event',
  flat: 'starting from',
};

// A day has two bookable halves; "full_day" occupies both. Blocks are
// always stored per half so a unique index can enforce exclusivity.
export const BOOKING_SLOTS = ['morning', 'evening', 'full_day'] as const;
export type BookingSlot = (typeof BOOKING_SLOTS)[number];
export const ATOMIC_SLOTS = ['morning', 'evening'] as const;
export type AtomicSlot = (typeof ATOMIC_SLOTS)[number];
export const expandSlot = (slot: BookingSlot): AtomicSlot[] => (slot === 'full_day' ? ['morning', 'evening'] : [slot]);

export const LEAD_SOURCES = [
  'apnautsav',
  'whatsapp',
  'call',
  'instagram',
  'wedmegood',
  'referral',
  'walk_in',
  'website',
  'other',
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_STATUSES = ['new', 'contacted', 'quoted', 'booked', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_LOST_REASONS = ['price', 'date_unavailable', 'chose_other', 'no_response', 'other'] as const;

export const BUDGET_BANDS = ['under_1l', '1l_3l', '3l_5l', '5l_10l', '10l_25l', 'above_25l'] as const;

export const QUOTE_STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const BOOKING_STATUSES = ['hold', 'tentative', 'confirmed', 'completed', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
// Statuses whose events occupy the calendar.
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ['hold', 'tentative', 'confirmed'];

export const PAYMENT_MODES = ['cash', 'upi', 'bank', 'cheque', 'card', 'other'] as const;

export const MESSAGE_TEMPLATE_TYPES = [
  'quote',
  'payment_reminder',
  'schedule',
  'receipt',
  'thank_you',
  'follow_up',
  'call_sheet',
  'run_sheet',
  'general',
] as const;
export type MessageTemplateType = (typeof MESSAGE_TEMPLATE_TYPES)[number];

export const MESSAGE_LANGUAGES = ['en', 'hi', 'hinglish'] as const;

// Every {{variable}} a message template can use, grouped by what has to be
// attached for it to fill in (whatsapp.service.ts#buildContext, plus the
// call-sheet / run-sheet `variables`). `sample` drives the template preview.
export const MESSAGE_VARIABLE_GROUPS = ['business', 'client', 'quote', 'booking', 'receipt', 'crew'] as const;
export type MessageVariableGroup = (typeof MESSAGE_VARIABLE_GROUPS)[number];
export const MESSAGE_VARIABLES: { key: string; label: string; group: MessageVariableGroup; sample: string }[] = [
  { key: 'businessName', label: 'Business name', group: 'business', sample: 'Kesar Studios' },
  { key: 'vendorPhone', label: 'Your WhatsApp number', group: 'business', sample: '98765 43210' },
  { key: 'upiId', label: 'UPI ID', group: 'business', sample: 'kesarstudios@okhdfc' },
  { key: 'profileLink', label: 'Profile link', group: 'business', sample: 'apnautsav.in/vendors/kesar-studios' },
  { key: 'brochureLine', label: 'Brochure line', group: 'business', sample: 'Brochure: apnautsav.in/b/kesar.pdf' },
  { key: 'clientName', label: 'Client name', group: 'client', sample: 'Riya' },
  { key: 'weddingDate', label: 'Wedding date', group: 'client', sample: '14 Nov 2026' },
  { key: 'weddingDateLine', label: 'Wedding date sentence', group: 'client', sample: 'Aapki 14 Nov 2026 ki shaadi ke baare mein. ' },
  { key: 'quoteNumber', label: 'Quote number', group: 'quote', sample: 'Q-0119' },
  { key: 'quoteTotal', label: 'Quote total', group: 'quote', sample: '₹4,34,948' },
  { key: 'validTill', label: 'Valid till', group: 'quote', sample: '5 Oct 2026' },
  { key: 'quoteLink', label: 'Quote link', group: 'quote', sample: 'apnautsav.in/q/119' },
  { key: 'bookingNumber', label: 'Booking number', group: 'booking', sample: 'B-0042' },
  { key: 'eventDate', label: 'Event date', group: 'booking', sample: '13 Nov 2026' },
  { key: 'eventSummary', label: 'Event list', group: 'booking', sample: '• Sangeet — 13 Nov 2026 18:00, Rambagh Palace\n• Wedding — 14 Nov 2026, Rambagh Palace' },
  { key: 'amount', label: 'Amount due', group: 'booking', sample: '₹64,000' },
  { key: 'milestoneLabel', label: 'Instalment name', group: 'booking', sample: 'second instalment' },
  { key: 'dueDate', label: 'Due date', group: 'booking', sample: '26 Sep 2026' },
  { key: 'balance', label: 'Total balance', group: 'booking', sample: '₹1,05,000' },
  { key: 'upiLine', label: 'UPI pay line', group: 'booking', sample: 'UPI: kesarstudios@okhdfc\nPay now: upi://pay?pa=kesarstudios@okhdfc' },
  { key: 'receiptNo', label: 'Receipt number', group: 'receipt', sample: 'R-2231' },
  { key: 'paidAmount', label: 'Amount paid', group: 'receipt', sample: '₹45,000' },
  { key: 'receiptLink', label: 'Receipt link', group: 'receipt', sample: 'apnautsav.in/r/2231' },
  { key: 'crewName', label: 'Crew name', group: 'crew', sample: 'Vikas' },
  { key: 'crewRole', label: 'Crew role', group: 'crew', sample: 'Lead photographer' },
  { key: 'callTime', label: 'Call time', group: 'crew', sample: '17:00' },
  { key: 'functionType', label: 'Function', group: 'crew', sample: 'Sangeet' },
  { key: 'venue', label: 'Venue', group: 'crew', sample: 'Rambagh Palace, Jaipur' },
  { key: 'runSheetLink', label: 'Run sheet link', group: 'crew', sample: 'apnautsav.in/run/7f3k' },
  { key: 'runSheetSummary', label: 'Run sheet list', group: 'crew', sample: '• 17:00 — Team arrives\n• 19:30 — Couple entry' },
  { key: 'managerPhone', label: 'Manager phone', group: 'crew', sample: '98870 22119' },
];

// Settings → Notifications: per-user switches, keyed by category. A
// notification type not listed here (profile approved / rejected) always goes out.
export const NOTIFICATION_CATEGORIES = ['leads', 'followUps', 'quotes', 'payments', 'bookings', 'crew'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export const NOTIFICATION_CATEGORY_OF: Record<string, NotificationCategory> = {
  new_lead: 'leads',
  follow_up_due: 'followUps',
  quote_viewed: 'quotes',
  quote_accepted: 'quotes',
  quote_declined: 'quotes',
  payment_due: 'payments',
  payment_overdue: 'payments',
  hold_expired: 'bookings',
  crew_assigned: 'crew',
  crew_declined: 'crew',
  crew_needs_reassign: 'crew',
};

export const FUNCTION_TYPES = [
  'roka',
  'engagement',
  'haldi',
  'mehendi',
  'sangeet',
  'cocktail',
  'baraat',
  'pheras',
  'wedding',
  'reception',
  'pre_wedding',
  'other',
] as const;

export const VENDOR_OS_PLANS = ['free', 'pro', 'business'] as const;
export type VendorOsPlan = (typeof VENDOR_OS_PLANS)[number];

// From the spec's pricing proposal (section 10). Free has no stated user
// count — it's set to 2 so the "owner adds a manager" MVP story works on
// every plan. Change here; enforced in services/vendor-os/plan-limits.ts.
export const VENDOR_OS_PLAN_LIMITS: Record<
  VendorOsPlan,
  { resources: number; quotesPerMonth: number; photos: number; users: number }
> = {
  free: { resources: 1, quotesPerMonth: 10, photos: 20, users: 2 },
  pro: { resources: Infinity, quotesPerMonth: Infinity, photos: Infinity, users: 3 },
  business: { resources: Infinity, quotesPerMonth: Infinity, photos: Infinity, users: 10 },
};

export const MAX_COVER_IMAGES = 8;
export const MAX_PACKAGES = 6;
