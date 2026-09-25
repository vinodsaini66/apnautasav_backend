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
