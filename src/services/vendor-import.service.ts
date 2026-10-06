import { VENDOR_CATEGORIES, VendorCategory } from '../models/vendor.model';

/**
 * Shared by the two vendor CSV imports (a wedding's vendor tracker, and an
 * agency's vendor roster). The frontend parses the CSV and posts plain rows;
 * each row is checked here and reported back individually so one bad line
 * never sinks the whole file.
 */
export interface VendorImportRow {
  name?: string;
  category?: string;
  phone?: string;
  contactPerson?: string;
  email?: string;
  city?: string;
  website?: string;
  notes?: string;
  price?: string | number;
}

export interface CleanVendorRow {
  name: string;
  category: VendorCategory;
  phone: string;
  contactPerson?: string;
  email?: string;
  city?: string;
  website?: string;
  notes?: string;
  price?: number;
}

export interface ImportRowResult {
  row: number;
  name: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export const MAX_IMPORT_ROWS = 500;

// Common spellings people use in spreadsheets → our category slugs.
const CATEGORY_ALIASES: Record<string, VendorCategory> = {
  photographer: 'photographer',
  photography: 'photographer',
  photo: 'photographer',
  videographer: 'videographer',
  video: 'videographer',
  videography: 'videographer',
  caterer: 'caterer',
  catering: 'caterer',
  food: 'caterer',
  decorator: 'decorator',
  decor: 'decorator',
  decoration: 'decorator',
  dj: 'dj',
  band: 'band',
  music: 'band',
  makeup: 'makeup-artist',
  'makeup artist': 'makeup-artist',
  mua: 'makeup-artist',
  mehendi: 'mehendi-artist',
  mehndi: 'mehendi-artist',
  'mehendi artist': 'mehendi-artist',
  florist: 'florist',
  flowers: 'florist',
  choreographer: 'choreographer',
  invitation: 'invitation',
  invitations: 'invitation',
  cards: 'invitation',
  transport: 'transport',
  cars: 'transport',
  security: 'security',
  hospitality: 'hospitality',
  hotel: 'hospitality',
  'light & sound': 'light-sound',
  'light and sound': 'light-sound',
  lights: 'light-sound',
  sound: 'light-sound',
  furniture: 'furniture',
  tent: 'tent',
  tenthouse: 'tent',
  artist: 'artist',
  entertainer: 'artist',
  pandit: 'priest-pandit',
  priest: 'priest-pandit',
  panditji: 'priest-pandit',
};

export const normaliseVendorCategory = (raw?: string): VendorCategory | null => {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if ((VENDOR_CATEGORIES as readonly string[]).includes(key)) return key as VendorCategory;
  const slug = key.replace(/\s+/g, '-');
  if ((VENDOR_CATEGORIES as readonly string[]).includes(slug)) return slug as VendorCategory;
  return CATEGORY_ALIASES[key] ?? null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates one row; returns the cleaned row or a reason it can't be imported. */
export const cleanVendorRow = (raw: VendorImportRow): { row?: CleanVendorRow; error?: string } => {
  const name = String(raw.name ?? '').trim();
  const phone = String(raw.phone ?? '').trim();
  if (!name) return { error: 'Missing name' };
  if (!phone) return { error: 'Missing phone number' };
  const category = normaliseVendorCategory(raw.category);
  if (!category) return { error: `Unknown category "${raw.category ?? ''}"` };
  const email = raw.email ? String(raw.email).trim().toLowerCase() : undefined;
  if (email && !EMAIL.test(email)) return { error: `Invalid email "${email}"` };
  const priceNum = raw.price !== undefined && raw.price !== '' ? Number(String(raw.price).replace(/[^\d.]/g, '')) : undefined;
  return {
    row: {
      name: name.slice(0, 150),
      category,
      phone: phone.slice(0, 20),
      contactPerson: raw.contactPerson ? String(raw.contactPerson).trim().slice(0, 100) : undefined,
      email,
      city: raw.city ? String(raw.city).trim().slice(0, 100) : undefined,
      website: raw.website ? String(raw.website).trim().slice(0, 300) : undefined,
      notes: raw.notes ? String(raw.notes).trim().slice(0, 2000) : undefined,
      price: priceNum !== undefined && Number.isFinite(priceNum) ? priceNum : undefined,
    },
  };
};

/** Same vendor if the phone matches (digits only), or the name matches exactly. */
export const vendorKey = (name: string, phone: string) => ({
  name: name.trim().toLowerCase(),
  phone: phone.replace(/\D/g, '').slice(-10),
});
