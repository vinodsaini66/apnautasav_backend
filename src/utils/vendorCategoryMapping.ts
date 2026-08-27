// Shared between VendorController#addFromMarketplace and
// WeddingController#getRecommendedVendors — both need to translate a
// free-text public VendorCategory name (e.g. "Wedding Photographers",
// "Banquet Halls") into the closest wedding-scoped Vendor.category enum
// value. Kept in one place so the keyword list can't drift between the two
// call sites.

// Wedding-scoped Vendor.category enum values, in priority order for
// keyword matching below.
export const WEDDING_VENDOR_CATEGORIES = [
  'catering',
  'photography',
  'decoration',
  'music',
  'venue',
  'invitations',
  'logistics',
  'others'
] as const;

export type WeddingVendorCategory = (typeof WEDDING_VENDOR_CATEGORIES)[number];

// Falls back to 'others' when nothing matches confidently — callers can
// always override with an explicit `category` where one is available.
export const mapMarketplaceCategoryToVendorCategory = (categoryName?: string): WeddingVendorCategory => {
  if (!categoryName) return 'others';

  const name = categoryName.toLowerCase();

  const keywordMap: Record<WeddingVendorCategory, string[]> = {
    catering: ['catering', 'caterer', 'food'],
    photography: ['photo', 'video', 'cinemat'],
    decoration: ['decor', 'florist', 'flower', 'mandap'],
    music: ['music', 'dj', 'band', 'sangeet', 'orchestra'],
    venue: ['venue', 'banquet', 'hall', 'hotel', 'resort', 'lawn', 'farmhouse'],
    invitations: ['invit', 'card', 'stationery'],
    logistics: ['transport', 'logistic', 'cab', 'car rental'],
    others: []
  };

  for (const category of WEDDING_VENDOR_CATEGORIES) {
    if (category === 'others') continue;
    if (keywordMap[category].some((keyword) => name.includes(keyword))) {
      return category;
    }
  }

  return 'others';
};
