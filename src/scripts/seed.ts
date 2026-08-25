import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDatabase } from '../config/database';
import { Plan } from '../models/plan.model';
import { VendorCategory } from '../models/vendor-category.model';
import logger from '../utils/logger';

// Idempotent — safe to run repeatedly (e.g. on every deploy). Upserts by
// `key`, so an admin's later live edits to price/limits/isActive via the
// Plan API are never clobbered by re-running this script; it only fills in
// plans that don't exist yet.
const PLAN_SEEDS = [
  {
    key: 'free',
    name: 'Free',
    description: 'Get started planning one wedding, on us.',
    type: 'free' as const,
    price: 0,
    currency: 'INR',
    billingPeriod: null,
    limits: { guests: 50, tasks: 50, vendors: 5, collaborators: 0 },
    budgetEnabled: false,
    maxWeddings: 1,
    isActive: true,
    sortOrder: 0,
  },
  {
    key: 'one_time_2',
    name: '2 Collaborators',
    description: 'One-time purchase for a single wedding — unlocks Budget and 2 collaborators.',
    type: 'one_time' as const,
    price: 99,
    currency: 'INR',
    billingPeriod: null,
    limits: { guests: 50, tasks: 50, vendors: 5, collaborators: 2 },
    budgetEnabled: true,
    maxWeddings: null,
    isActive: true,
    sortOrder: 1,
  },
  {
    key: 'one_time_5',
    name: '5 Collaborators',
    description: 'One-time purchase for a single wedding — unlocks Budget and 5 collaborators.',
    type: 'one_time' as const,
    price: 199,
    currency: 'INR',
    billingPeriod: null,
    limits: { guests: 50, tasks: 50, vendors: 5, collaborators: 5 },
    budgetEnabled: true,
    maxWeddings: null,
    isActive: true,
    sortOrder: 2,
  },
  {
    key: 'one_time_10',
    name: '10 Collaborators',
    description: 'One-time purchase for a single wedding — unlocks Budget and 10 collaborators.',
    type: 'one_time' as const,
    price: 499,
    currency: 'INR',
    billingPeriod: null,
    limits: { guests: 50, tasks: 50, vendors: 5, collaborators: 10 },
    budgetEnabled: true,
    maxWeddings: null,
    isActive: true,
    sortOrder: 3,
  },
  {
    key: 'monthly',
    name: 'Monthly Subscription',
    description: 'Account-wide paid features, billed every month.',
    type: 'subscription' as const,
    price: 1499,
    currency: 'INR',
    billingPeriod: 'monthly' as const,
    limits: { guests: -1, tasks: -1, vendors: -1, collaborators: -1 },
    budgetEnabled: true,
    maxWeddings: -1,
    isActive: true,
    sortOrder: 4,
  },
  {
    key: 'annual',
    name: 'Annual Subscription',
    description: 'Account-wide paid features, billed every year.',
    type: 'subscription' as const,
    price: 15000,
    currency: 'INR',
    billingPeriod: 'annual' as const,
    limits: { guests: -1, tasks: -1, vendors: -1, collaborators: -1 },
    budgetEnabled: true,
    maxWeddings: -1,
    isActive: true,
    sortOrder: 5,
  },
];

async function seedPlans(): Promise<void> {
  for (const seed of PLAN_SEEDS) {
    await Plan.findOneAndUpdate({ key: seed.key }, { $setOnInsert: seed }, { upsert: true, new: true });
    logger.info(`Plan seeded/verified: ${seed.key}`);
  }
}

// --- Vendor categories -----------------------------------------------------
// Two-level taxonomy (top-level category -> sub-categories), sourced from
// the vendor directory's category list. `isActive`/`isDeleted` on every row
// let an admin later disable a category or soft-delete it via the
// VendorCategory admin API without a code change; `slug` is derived here
// once and is otherwise immutable going forward.

interface VendorCategorySeed {
  name: string;
  icon: string;
  subCategories: string[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const VENDOR_CATEGORY_SEEDS: VendorCategorySeed[] = [
  {
    name: 'Venue',
    icon: '🏛️',
    subCategories: [
      'Banquet Halls',
      'Marriage Garden / Lawns',
      'Wedding Resorts',
      'Small Function / Party Halls',
      'Destination Wedding Venues',
      'Kalyana Mandapams',
      '4 Star & Above Hotels',
      '5 Star Luxury Hotels',
      'Wedding Farmhouses',
    ],
  },
  { name: 'Photographers', icon: '📷', subCategories: ['Photographers'] },
  {
    name: 'Makeup',
    icon: '💄',
    subCategories: ['Bridal Makeup Artists', 'Family Makeup'],
  },
  {
    name: 'Planning & Decor',
    icon: '🎨',
    subCategories: ['Wedding Planners', 'Decorators'],
  },
  { name: 'Virtual Planning', icon: '💻', subCategories: ['Virtual Planning'] },
  { name: 'Mehndi', icon: '🌿', subCategories: ['Mehendi Artists'] },
  {
    name: 'Music & Dance',
    icon: '🎵',
    subCategories: ['DJs', 'Sangeet Choreographer', 'Wedding Entertainment'],
  },
  {
    name: 'Invites & Gifts',
    icon: '💌',
    subCategories: ['Invitations', 'Favours', 'Trousseau Packers', 'Invitation Gifts', 'Mehndi Favours'],
  },
  {
    name: 'Food',
    icon: '🍽️',
    subCategories: ['Catering Services', 'Cake', 'Chaat & Food Stalls', 'Bartenders'],
  },
  {
    name: 'Pre Wedding Shoot',
    icon: '📸',
    subCategories: ['Pre Wedding Shoot Locations', 'Pre Wedding Photographers'],
  },
  {
    name: 'Bridal Wear',
    icon: '👗',
    subCategories: [
      'Bridal Lehengas',
      'Kanjeevaram / Silk Sarees',
      'Cocktail Gowns',
      'Trousseau Sarees',
      'Bridal Lehenga on Rent',
    ],
  },
  {
    name: 'Groom Wear',
    icon: '🤵',
    subCategories: ['Sherwani', 'Wedding Suits / Tuxes', 'Sherwani On Rent'],
  },
  {
    name: 'Jewellery & Accessories',
    icon: '💍',
    subCategories: ['Jewellery', 'Flower Jewellery', 'Bridal Jewellery on Rent', 'Accessories'],
  },
  { name: 'Pandits', icon: '🕉️', subCategories: ['Wedding Pandits'] },
  { name: 'Bridal Grooming', icon: '💅', subCategories: ['Beauty and Wellness'] },
];

async function seedVendorCategories(): Promise<void> {
  let parentSortOrder = 0;

  for (const category of VENDOR_CATEGORY_SEEDS) {
    const parentSlug = slugify(category.name);

    const parent = await VendorCategory.findOneAndUpdate(
      { slug: parentSlug },
      {
        $setOnInsert: {
          name: category.name,
          slug: parentSlug,
          parentId: null,
          level: 0,
          icon: category.icon,
          sortOrder: parentSortOrder,
          isActive: true,
          isDeleted: false,
        },
      },
      { upsert: true, new: true }
    );
    parentSortOrder += 1;

    // A category whose only "sub-category" restates its own name (e.g.
    // Photographers -> ["Photographers"]) doesn't need a separate child row
    // — creating one would collide on the unique slug anyway.
    const subCategories = category.subCategories.filter((sub) => sub !== category.name);

    let childSortOrder = 0;
    for (const subName of subCategories) {
      const childSlug = slugify(subName);
      await VendorCategory.findOneAndUpdate(
        { slug: childSlug },
        {
          $setOnInsert: {
            name: subName,
            slug: childSlug,
            parentId: parent!._id,
            level: 1,
            icon: category.icon,
            sortOrder: childSortOrder,
            isActive: true,
            isDeleted: false,
          },
        },
        { upsert: true, new: true }
      );
      childSortOrder += 1;
    }

    logger.info(`Vendor category seeded/verified: ${category.name} (+${subCategories.length} sub-categories)`);
  }
}

async function main(): Promise<void> {
  await connectDatabase();
  await seedPlans();
  await seedVendorCategories();
  logger.info('Seeding complete');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  logger.error('Seed script failed:', error);
  process.exit(1);
});
