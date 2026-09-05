/**
 * One-off WedMeGood vendor import (LOW-VOLUME, MANUAL RUN ONLY).
 *
 * Scope, deliberately narrowed per explicit user decision on 2026-09-05:
 * WedMeGood's public list API started rejecting repeated requests with
 * `{errorCode: 498, errorMessage: "Not a valid token"}` (a real anti-bot /
 * rate-limit gate at their origin, confirmed via cache-busted MISS
 * requests — not a caching artifact). We do NOT attempt to work around
 * that gate (no token hunting, no retries/backoff loops, no request
 * rotation). Per the user's choice, this script only:
 *   - covers the category slugs listed in APPROVED_CATEGORY_SLUGS
 *   - for each category, fetches pages 1 through 5 in order (page 1 fully
 *     done — fetched, mapped, bulk-inserted — before page 2 is requested,
 *     and so on), 20 vendors per page, ONE attempt per page
 *   - if a page's request is blocked/errors, logs a warning and stops
 *     paging for that category (moves on to the next category) rather than
 *     retrying or skipping ahead to a later page
 *
 * Run manually: npx ts-node src/scripts/import-wedmegood-vendors.ts
 *
 * Uses the REAL compiled Mongoose models (not ad-hoc loose schemas) so
 * schema defaults (isDeleted, status, etc.) and type casting (ObjectId
 * fields) are applied correctly — see Vendor_Data_Schema_Audit.md §10 for
 * why an earlier ad-hoc script got this wrong.
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDatabase } from '../config/database';
import { WeddingVendor } from '../models/wedding-vendor.model';
import { VendorCategory } from '../models/vendor-category.model';
import { VendorCategoryMapping } from '../models/vendor-category-mapping.model';
import logger from '../utils/logger';

const CITY_SLUG = 'jaipur';

// How many list pages to fetch per category (20 vendors/page).
const PAGES_PER_CATEGORY = 5;

// Only these run this pass — see file header.
const APPROVED_CATEGORY_SLUGS = [
  // 'wedding-photographers',
  // 'wedding-venues',
  // "wedding-catering",
  // "wedding-decorators",
  "pre-wedding-shoot",

] as const;

// WedMeGood's own category slugs mapped onto our already-seeded taxonomy
// (see src/scripts/seed.ts's VENDOR_CATEGORY_SEEDS) — reusing existing
// categories where a sensible fit exists rather than creating near-duplicate
// ones. `parentSlug` is used only if the mapped category needs to be
// created (it shouldn't, for the two approved slugs — both already exist
// from seeding — this is a safety net, not the expected path).
const CATEGORY_SLUG_MAP: Record<
  string,
  { slug: string; name: string; icon: string; parentSlug?: string }
> = {
  'wedding-venues': { slug: 'venue', name: 'Venue', icon: '🏛️' },
  'wedding-photographers': { slug: 'photographers', name: 'Photographers', icon: '📷' },
  'wedding-catering': { slug: 'catering-services', name: 'Catering Services', icon: '🍽️', parentSlug: 'food' },
  djs: { slug: 'djs', name: 'DJs', icon: '🎵', parentSlug: 'music-and-dance' },
  'wedding-decorators': { slug: 'decorators', name: 'Decorators', icon: '🎨', parentSlug: 'planning-and-decor' },
  'pre-wedding-shoot': { slug: 'pre-wedding-shoot', name: 'Pre Wedding Shoot', icon: '📸' },
  'bridal-makeup': { slug: 'bridal-makeup-artists', name: 'Bridal Makeup Artists', icon: '💄', parentSlug: 'makeup' },
  'sangeet-choreographers': {
    slug: 'sangeet-choreographer',
    name: 'Sangeet Choreographer',
    icon: '🎵',
    parentSlug: 'music-and-dance',
  },
  'wedding-planners': { slug: 'wedding-planners', name: 'Wedding Planners', icon: '🎨', parentSlug: 'planning-and-decor' },
  'wedding-cards': { slug: 'invitations', name: 'Invitations', icon: '💌', parentSlug: 'invites-and-gifts' },
  'wedding-pandits-priests': { slug: 'wedding-pandits', name: 'Wedding Pandits', icon: '🕉️', parentSlug: 'pandits' },
  'wedding-jewellery': { slug: 'jewellery', name: 'Jewellery', icon: '💍', parentSlug: 'jewellery-and-accessories' },
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Category IDs resolved once per script run, keyed by WedMeGood category
// slug — avoids re-querying/re-creating for every vendor on the same page.
const categoryCache = new Map<string, { categoryId: string; parentCategoryId?: string }>();

async function resolveCategory(
  wedMeGoodCategorySlug: string
): Promise<{ categoryId: string; parentCategoryId?: string }> {
  const cached = categoryCache.get(wedMeGoodCategorySlug);
  if (cached) return cached;

  const mapped = CATEGORY_SLUG_MAP[wedMeGoodCategorySlug] ?? {
    slug: slugify(wedMeGoodCategorySlug),
    name: wedMeGoodCategorySlug,
    icon: '📦',
  };

  let category = await VendorCategory.findOne({ slug: mapped.slug, isDeleted: false });

  if (!category) {
    let parentId: mongoose.Types.ObjectId | null = null;
    if (mapped.parentSlug) {
      const parent = await VendorCategory.findOne({ slug: mapped.parentSlug, isDeleted: false });
      parentId = parent ? (parent._id as mongoose.Types.ObjectId) : null;
    }

    logger.warn(
      `[wedmegood-import] Category "${mapped.slug}" not found in VendorCategory — creating it (expected to already exist from seed.ts for the approved categories; verify this wasn't a typo).`
    );

    category = await VendorCategory.create({
      name: mapped.name,
      slug: mapped.slug,
      parentId,
      level: parentId ? 1 : 0,
      icon: mapped.icon,
      isActive: true,
      isDeleted: false,
    });
  }

  const result = {
    categoryId: String(category._id),
    parentCategoryId: category.parentId ? String(category.parentId) : undefined,
  };
  categoryCache.set(wedMeGoodCategorySlug, result);
  return result;
}

// WedMeGood's CDN URLs carry a `%%X` resize-template placeholder that isn't
// directly loadable, plus a `?crop=...` query tied to that placeholder —
// strip both, keeping the real underlying image URL.
function cleanImageUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return url.replace('/resized/%%X', '').split('?')[0];
}

// Source prices arrive as formatted strings ("1,500", "14.50 Lakh") or
// plain numbers — parse the numeric ones, leave free-text ones (handled
// separately as destinationPrice) alone.
function parsePrice(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

const VALID_PRICE_UNITS = ['per day', 'per function', 'per plate', 'per event', 'starting from'] as const;
function normalizePriceUnit(value?: string): (typeof VALID_PRICE_UNITS)[number] {
  const normalized = (value || '').trim().toLowerCase();
  return (VALID_PRICE_UNITS as readonly string[]).includes(normalized)
    ? (normalized as (typeof VALID_PRICE_UNITS)[number])
    : 'starting from';
}

interface RawVendor {
  id: string | number;
  member_id: string | number;
  name: string;
  category_slug: string;
  information?: string;
  profile_pic_url?: string;
  cover_images?: string[];
  address?: string;
  pincode?: string | number;
  city?: string;
  base_city?: string;
  primary_locality?: string;
  country?: string;
  vendor_rating?: string | number;
  reviews_count?: string | number;
  starting_price?: string | number;
  starting_price_new?: string | number;
  vendor_price?: string | number;
  vendor_price_subtext?: string;
  destination_price?: string;
  destination_price_unit?: string;
  vendor_verification_status?: boolean;
  // Venue-category-only fields (absent for every other category).
  num_guest_count?: { min_value?: string; max_value?: string }[];
  venue_type?: string[];
  veg_price?: string | number;
  non_veg_price?: string | number;
}

function mapVendorToWeddingVendor(raw: RawVendor, resolvedCategorySlug: string) {
  const slug = `${slugify(raw.name)}-${raw.member_id}`;

  const hasVenueFields =
    (Array.isArray(raw.num_guest_count) && raw.num_guest_count.length > 0) ||
    (Array.isArray(raw.venue_type) && raw.venue_type.length > 0);

  const doc: Record<string, unknown> = {
    businessName: raw.name,
    slug,
    shortDescription: raw.information || undefined,
    logo: cleanImageUrl(raw.profile_pic_url),
    coverImage: cleanImageUrl(raw.cover_images?.[0]),

    // Contact fields deliberately omitted — WedMeGood's public LIST endpoint
    // does not expose phone/email/whatsapp number, only availability flags.
    // Never fabricate these.

    location: {
      address: raw.address || undefined,
      area: raw.primary_locality || undefined,
      city: raw.city || raw.base_city || undefined,
      state: undefined,
      country: raw.country || 'India',
      pincode: raw.pincode !== undefined ? String(raw.pincode) : undefined,
    },

    categorySlug: resolvedCategorySlug,
    serviceCities: [raw.base_city || raw.city].filter(Boolean),
    languages: [],

    status: 'active',
    isVerified: Boolean(raw.vendor_verification_status),

    rating: Number(raw.vendor_rating) || 0,
    reviewCount: Number(raw.reviews_count) || 0,

    pricing: {
      startingPrice: parsePrice(raw.starting_price_new ?? raw.starting_price ?? raw.vendor_price) ?? 0,
      priceUnit: normalizePriceUnit(raw.vendor_price_subtext),
      destinationPrice: raw.destination_price || undefined,
      destinationPriceUnit: raw.destination_price_unit || undefined,
    },
  };

  if (hasVenueFields) {
    const guestCounts = raw.num_guest_count?.[0];
    doc.venueDetails = {
      guestCapacityMin: guestCounts?.min_value ? Number(guestCounts.min_value) : undefined,
      guestCapacityMax: guestCounts?.max_value ? Number(guestCounts.max_value) : undefined,
      venueTypes: raw.venue_type || [],
      vegPricePerPlate: parsePrice(raw.veg_price),
      nonVegPricePerPlate: parsePrice(raw.non_veg_price),
    };
  }

  return { slug, doc };
}

async function fetchVendorListPage(categorySlug: string, page: number): Promise<RawVendor[] | null> {
  const offset = (page - 1) * 20;
  const url =
    `https://www.wedmegood.com/node/v1/vendor/list?filter=0&seo=0&offset=${offset}` +
    `&city_slug=${CITY_SLUG}&category_slug=${categorySlug}&source=1` +
    `&filter_slug=${encodeURIComponent(`${CITY_SLUG}/${categorySlug}/`)}&device_type=1&page=${page}`;

  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const json = (await res.json()) as { data?: RawVendor[]; errorCode?: number; errorMessage?: string };

  if (json.errorCode || !json.data) {
    logger.warn(
      `[wedmegood-import] "${categorySlug}" page ${page}: request blocked/errored (${json.errorCode} ${json.errorMessage}) — stopping this category's paging, not retrying.`
    );
    return null;
  }

  return json.data;
}

async function importVendorPage(categorySlug: string, raw: RawVendor[], page: number): Promise<void> {
  const { categoryId, parentCategoryId } = await resolveCategory(categorySlug);

  const mapped = raw.map((v) => mapVendorToWeddingVendor(v, categorySlug));

  // Upsert by slug (idempotent — safe to re-run; $setOnInsert means an
  // existing vendor a human has since edited is never clobbered).
  await WeddingVendor.bulkWrite(
    mapped.map(({ slug, doc }) => ({
      updateOne: {
        filter: { slug },
        update: { $setOnInsert: doc },
        upsert: true,
      },
    }))
  );

  const vendors = await WeddingVendor.find({ slug: { $in: mapped.map((m) => m.slug) } }, { _id: 1, slug: 1 });

  await VendorCategoryMapping.bulkWrite(
    vendors.map((vendor) => ({
      updateOne: {
        filter: { vendorId: vendor._id, categoryId },
        update: {
          $setOnInsert: {
            vendorId: vendor._id,
            categoryId,
            parentCategoryId,
            isPrimary: true,
            isActive: true,
          },
        },
        upsert: true,
      },
    }))
  );

  logger.info(
    `[wedmegood-import] "${categorySlug}" page ${page}: imported/updated ${vendors.length} vendors, category ${categoryId}.`
  );
}

async function importCategory(categorySlug: string): Promise<void> {
  // Pages fetched strictly in order — page 1 fully processed before page 2
  // is requested, and so on — and paging stops for this category the moment
  // a page comes back blocked/empty (never retried, never skipped over).
  for (let page = 1; page <= PAGES_PER_CATEGORY; page += 1) {
    const raw = await fetchVendorListPage(categorySlug, page);

    if (!raw || raw.length === 0) {
      logger.info(`[wedmegood-import] "${categorySlug}" page ${page}: no vendors returned, stopping this category.`);
      break;
    }

    await importVendorPage(categorySlug, raw, page);
  }
}

async function main(): Promise<void> {
  await connectDatabase();

  for (const categorySlug of APPROVED_CATEGORY_SLUGS) {
    await importCategory(categorySlug);
  }

  logger.info('[wedmegood-import] Done.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  logger.error('[wedmegood-import] Script failed:', error);
  process.exit(1);
});
