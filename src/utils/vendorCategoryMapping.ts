// Shared between VendorController#addFromMarketplace and
// WeddingController#getRecommendedVendors — both need to translate a
// free-text public VendorCategory name (e.g. "Wedding Photographers",
// "Banquet Halls") into the closest wedding-scoped Vendor.category enum
// value. Kept in one place so the keyword list can't drift between the two
// call sites.
import { VENDOR_CATEGORIES, type VendorCategory } from '../models/vendor.model';

export type WeddingVendorCategory = VendorCategory;

// The tracker's category list (see models/vendor.model.ts) has no generic
// "venue"/"others" bucket — 'hospitality' is the closest fit for anything
// that doesn't match a more specific keyword below (venues, hotels, and
// resorts included), so it doubles as both a real category and the fallback.
const FALLBACK_CATEGORY: WeddingVendorCategory = 'hospitality';

const KEYWORD_MAP: Record<WeddingVendorCategory, string[]> = {
  photographer: ['photograph'],
  videographer: ['video', 'cinemat'],
  caterer: ['caterer', 'catering', 'food', 'chaat', 'bartend', 'cake'],
  decorator: ['decor'],
  dj: ['dj'],
  band: ['band', 'orchestra', 'entertainment'],
  'makeup-artist': ['makeup', 'grooming', 'beauty and wellness'],
  'mehendi-artist': ['mehendi', 'mehndi'],
  florist: ['florist', 'flower'],
  choreographer: ['choreograph'],
  invitation: ['invit', 'card', 'stationery'],
  transport: ['transport', 'cab', 'car rental'],
  security: ['security'],
  hospitality: ['venue', 'banquet', 'hall', 'hotel', 'resort', 'lawn', 'farmhouse', 'mandapam', 'hospitality'],
  'light-sound': ['light', 'sound', 'audio', 'led'],
  furniture: ['furniture', 'seating'],
  tent: ['tent', 'shamiana'],
  artist: ['artist', 'performer'],
  'priest-pandit': ['pandit', 'priest', 'purohit']
};

// Falls back to FALLBACK_CATEGORY when nothing matches confidently —
// callers can always override with an explicit `category` where one is
// available.
export const mapMarketplaceCategoryToVendorCategory = (categoryName?: string): WeddingVendorCategory => {
  if (!categoryName) return FALLBACK_CATEGORY;

  const name = categoryName.toLowerCase();

  for (const category of VENDOR_CATEGORIES) {
    if (KEYWORD_MAP[category].some((keyword) => name.includes(keyword))) {
      return category;
    }
  }

  return FALLBACK_CATEGORY;
};
