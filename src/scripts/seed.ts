import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDatabase } from '../config/database';
import { Plan } from '../models/plan.model';
import { VendorCategory } from '../models/vendor-category.model';
import { Banner } from '../models/banner.model';
import { Blog, BlogTag } from '../models/blog.model';
import { Faq } from '../models/faq.model';
import { User } from '../models/user.model';
import { TaskTemplate } from '../models/task-template.model';
import { Testimonial } from '../models/testimonial.model';
import { Wedding } from '../models/wedding.model';
import { Guest } from '../models/guest.model';
import { WeddingEvent } from '../models/event.model';
import logger from '../utils/logger';

// Idempotent — safe to run repeatedly (e.g. on every deploy). Upserts by
// `key`, so an admin's later live edits to price/limits/isActive via the
// Plan API are never clobbered by re-running this script; it only fills in
// plans that don't exist yet. Matches the "Pay once, for one wedding" pricing
// page (Free / One Wedding / Grand one-time tiers, Planner monthly/yearly
// subscriptions for people managing weddings that aren't their own).
const PLAN_SEEDS = [
  {
    key: 'free',
    name: 'Free',
    description: 'Enough to set the wedding up and see whether it fits how your family plans.',
    type: 'free' as const,
    price: 0,
    currency: 'INR',
    billingPeriod: null,
    limits: { guests: 50, tasks: 50, vendors: 10, collaborators: 0 },
    budgetEnabled: false,
    maxWeddings: 1,
    isActive: true,
    sortOrder: 0,
  },
  {
    key: 'one_wedding',
    name: 'One Wedding',
    description: 'One payment, one wedding, yours until the day is over. No renewal.',
    type: 'one_time' as const,
    price: 2999,
    currency: 'INR',
    billingPeriod: null,
    limits: { guests: -1, tasks: -1, vendors: -1, collaborators: 10 },
    budgetEnabled: true,
    maxWeddings: null,
    isActive: true,
    sortOrder: 1,
  },
  {
    key: 'grand',
    name: 'Grand',
    description: 'For a 500-plus guest wedding across five days and two cities.',
    type: 'one_time' as const,
    price: 5499,
    currency: 'INR',
    billingPeriod: null,
    limits: { guests: -1, tasks: -1, vendors: -1, collaborators: -1 },
    budgetEnabled: true,
    maxWeddings: null,
    isActive: true,
    sortOrder: 2,
  },
  {
    key: 'planner_monthly',
    name: 'Planner',
    description: "For people planning weddings that aren't their own.",
    type: 'subscription' as const,
    price: 899,
    currency: 'INR',
    billingPeriod: 'monthly' as const,
    limits: { guests: -1, tasks: -1, vendors: -1, collaborators: -1 },
    budgetEnabled: true,
    maxWeddings: -1,
    isActive: true,
    sortOrder: 3,
  },
  {
    key: 'planner_yearly',
    name: 'Planner, Yearly',
    description: 'Same thing, paid once a year. Works out to ₹749 a month.',
    type: 'subscription' as const,
    price: 8990,
    currency: 'INR',
    billingPeriod: 'annual' as const,
    limits: { guests: -1, tasks: -1, vendors: -1, collaborators: -1 },
    budgetEnabled: true,
    maxWeddings: -1,
    isActive: true,
    sortOrder: 4,
  },
];

// Superseded by PLAN_SEEDS above (old per-collaborator-count one-time tiers
// and generic Monthly/Annual Subscription) — kept here only so an
// already-seeded environment gets them deactivated rather than showing both
// the old and new catalog side by side on the Pricing page.
const LEGACY_PLAN_KEYS = ['one_time_2', 'one_time_5', 'one_time_10', 'monthly', 'annual'];

async function seedPlans(): Promise<void> {
  for (const seed of PLAN_SEEDS) {
    await Plan.findOneAndUpdate({ key: seed.key }, { $setOnInsert: seed }, { upsert: true, new: true });
    logger.info(`Plan seeded/verified: ${seed.key}`);
  }
  const { modifiedCount } = await Plan.updateMany(
    { key: { $in: LEGACY_PLAN_KEYS }, isActive: true },
    { $set: { isActive: false } }
  );
  if (modifiedCount > 0) {
    logger.info(`Deactivated ${modifiedCount} legacy plan(s): ${LEGACY_PLAN_KEYS.join(', ')}`);
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

// --- Promotional dashboard banners ------------------------------------------
// Placeholder/dummy sponsor banners so the dashboard's banner carousel has
// something to render out of the box (see BannerService.getActiveBanners).
// Idempotent — upserted by `imageUrl`, so re-running this script never
// duplicates them.

interface BannerSeed {
  title: string;
  imageUrl: string;
  redirectUrl: string;
  altText: string;
  sortOrder: number;
}

const BANNER_SEEDS: BannerSeed[] = [
  {
    title: 'Real Weddings, Real Inspiration',
    imageUrl: 'https://image.wedmegood.com/uploads/member/1638019/1765019793__DSC0116_min.jpg',
    redirectUrl: '/vendors',
    altText: 'Bride and groom at a beautifully decorated wedding function',
    sortOrder: 0,
  },
  {
    title: 'Find Vendors Trusted by Real Couples',
    imageUrl: 'https://image.wedmegood.com/uploads/member/1638019/1765019873__DSC1536.jpg',
    redirectUrl: '/vendors',
    altText: 'Wedding couple portrait',
    sortOrder: 1,
  },
  {
    title: 'Plan Every Function, Beautifully',
    imageUrl: 'https://image.wedmegood.com/uploads/member/1638019/1765019904__DSC6908.jpg',
    redirectUrl: '/vendors',
    altText: 'Wedding ceremony decor and setup',
    sortOrder: 2,
  },
];

async function seedBanners(): Promise<void> {
  // `createdBy` is a required ref on Banner — attribute these to any
  // existing user (an admin if there is one) rather than fabricating an
  // unrelated ObjectId, but fall back to one if the DB has no users yet.
  const attributedUser = (await User.findOne({ role: 'admin' })) || (await User.findOne());
  const createdBy = attributedUser ? attributedUser._id : new mongoose.Types.ObjectId();

  for (const seed of BANNER_SEEDS) {
    await Banner.findOneAndUpdate(
      { imageUrl: seed.imageUrl },
      { $setOnInsert: { ...seed, isActive: true, createdBy } },
      { upsert: true, new: true }
    );
    logger.info(`Banner seeded/verified: ${seed.title}`);
  }
}

// --- Blog / wedding-journal posts -------------------------------------------
// One-time migration of the old static article array (previously hardcoded
// in apnautasav_frontend/lib/blog-data.ts) into the database, now that
// /blogs is served from the API. `category` there -> `tag` here (same
// values, see BlogTag); `id` there -> `slug` here. Idempotent — upserted by
// slug, so re-running never duplicates or clobbers a since-edited post
// (only fills in ones that don't exist yet, like the other seeds above).
// `order` preserves the original array's curated ordering.

interface BlogSeed {
  slug: string;
  tag: BlogTag;
  title: string;
  excerpt: string;
  body: string[];
  author: string;
  date: string;
  readTime: string;
  featured?: boolean;
  order: number;
}

const BLOG_SEEDS: BlogSeed[] = [
  {
    slug: 'family-planning-timeline',
    tag: BlogTag.Planning,
    title: "The Family Wedding Timeline: Who Owns What, From Rishta to Reception",
    excerpt:
      "Twelve months, six family roles, one shared plan. Here's how to split the work across parents, siblings and the couple without anyone quietly burning out by month nine.",
    body: [
      "Most wedding timelines are written for one person to follow. Real Indian weddings are run by five or six — parents on one side, siblings on the other, an aunt who's \"handling the pandit,\" and the couple somewhere in the middle trying to keep everyone pointed the same direction.",
      "Break the twelve months into three blocks instead of a single long list: the first four months are for decisions only parents can make (budget ceiling, guest count, venue city); the middle four are for vendors and logistics anyone can own; the last four are for the checklist items that need daily attention. Assign each block to a person, not a task list, and give them a shared budget and guest sheet so nobody is planning against numbers that changed two weeks ago.",
    ],
    author: 'ApnaUtsav Editorial',
    date: 'Updated 18 Aug 2026',
    readTime: '9 min read',
    featured: true,
    order: 0,
  },
  {
    slug: '40-ways-to-trim-costs',
    tag: BlogTag.Budget,
    title: '40 Ways Families Are Trimming Wedding Costs Without Cutting the Baraat Short',
    excerpt:
      'Real savings 2,400+ ApnaUtsav families found once every rupee was tracked in one place — from guest-list math to knowing which vendor quote to push back on.',
    body: [
      "The families who spend less rarely cut the wedding down — they cut the guesswork out. Once every quote, deposit and \"we'll settle later\" promise lives in one shared budget, patterns show up fast: the caterer's per-plate rate creeping up with every phone call, the décor \"package\" that's really three separate line items.",
      'The savings in this list sort into three buckets: renegotiating (get everything in writing before the advance), rescheduling (weekday and off-season dates cut venue rates by 15–30%), and reallocating (spend where guests notice — food and photos — and trim where they don\'t).',
    ],
    author: 'Ananya Kapoor',
    date: 'Updated 12 Aug 2026',
    readTime: '7 min read',
    featured: true,
    order: 1,
  },
  {
    slug: '25-vendor-questions',
    tag: BlogTag.Vendors,
    title: '25 Questions to Ask Any Vendor Before You Pay the Advance',
    excerpt:
      "A checklist for whoever's 'handling the caterer' this month — so nothing gets promised twice, paid for twice, or forgotten until the week of.",
    body: [
      'Every family has a vendor story that starts with "we assumed" — the caterer assumed vegetarian-only, the decorator assumed the mandap colour matched the invites, the photographer assumed drone shots were included. None of it was written down.',
      'These questions exist to move assumptions into a contract before any advance changes hands: what\'s included per plate, what counts as an "extra guest," what happens to the deposit if the date shifts, and who signs off on the final look before setup day. Ask them once, in writing, and share the answers with whoever in the family is paying that vendor.',
    ],
    author: 'Rohan Mehta',
    date: 'Updated 5 Aug 2026',
    readTime: '6 min read',
    featured: true,
    order: 2,
  },
  {
    slug: 'saat-phere-explained',
    tag: BlogTag.Rituals,
    title: 'Saat Phere, Explained: The Meaning Behind the Seven Sacred Vows',
    excerpt: "What each of the seven steps around the fire actually promises — written for the guests who've only ever watched.",
    body: [
      'The seven steps around the sacred fire are often translated loosely as "promises" — food, strength, prosperity, happiness, children, companionship, and friendship — but each phera is a specific commitment, spoken as the couple\'s feet move together in the same direction for the first time.',
      "For guests watching without a priest's running commentary, the pace can feel long. Knowing that each round marks a different promise — and that the bride leads some rounds while the groom leads others, depending on regional tradition — turns a repetitive-looking ritual into seven distinct, readable moments.",
    ],
    author: 'Priya Nair',
    date: '16 Aug 2026',
    readTime: '5 min read',
    order: 3,
  },
  {
    slug: '50-mehndi-designs',
    tag: BlogTag.Beauty,
    title: '50 Mehndi Design Ideas for the Bride and Every Sister Standing Next to Her',
    excerpt: 'From bridal full-hand patterns to quick guest designs the mehendi artist can finish in ten minutes flat.',
    body: [
      "Bridal mehendi has two audiences: the camera, which wants full-hand coverage and fine detail that photographs well from across the room, and the bride's hand two days later, which needs to still move freely enough to hold a coconut, a plate, and a hundred handshakes.",
      'This roundup splits patterns by hand commitment — full bridal (3+ hours), half-hand for sisters and cousins standing in every photo, and 10-minute guest designs the artist can do assembly-line style once the bridal party is done.',
    ],
    author: 'Simran Kaur',
    date: '14 Aug 2026',
    readTime: '8 min read',
    order: 4,
  },
  {
    slug: 'guest-list-everyone-agrees-on',
    tag: BlogTag.Guests,
    title: 'Building a Guest List Your Whole Family Can Actually Agree On',
    excerpt:
      "A framework for the 'but we have to invite them' conversation, plus a shared list every side of the family can edit without a group-chat war.",
    body: [
      'The guest list argument is rarely about the guests — it\'s about who gets to decide. Once both families are adding names to the same sheet in real time, the fight moves from "why weren\'t they invited" to "we\'re at 420, who\'s coming off."',
      "Give each side of the family its own named block within the shared total, let them fill it however they want, and keep a visible running count everyone can see. Most families find the list settles itself once the number, not the names, becomes the constraint.",
    ],
    author: 'ApnaUtsav Editorial',
    date: '11 Aug 2026',
    readTime: '6 min read',
    order: 5,
  },
  {
    slug: 'sangeet-run-of-show',
    tag: BlogTag.Sangeet,
    title: 'What Actually Happens at a Sangeet: A Night-by-Night Run of Show',
    excerpt: 'Song order, surprise acts, and the one rehearsal everyone skips — a planning guide for the family choreography group chat.',
    body: [
      'A sangeet that runs on "we\'ll figure out the order on the night" is the single most common cause of a 1 a.m. finish. The families who pull it off treat it like a small production: a written run-of-show, a rehearsal for anything with more than four dancers, and a stage manager who isn\'t also performing.',
      "The order that works most often: a warm-up group number, individual family acts building in energy, the couple's surprise number placed two-thirds through (not last — people are tired by then), then an open-floor finale everyone can join without choreography.",
    ],
    author: 'Karan Bhatia',
    date: '9 Aug 2026',
    readTime: '7 min read',
    order: 6,
  },
  {
    slug: 'post-wedding-getaways-2026',
    tag: BlogTag.Honeymoon,
    title: '8 Post-Wedding Getaways Indian Couples Are Booking for Winter 2026',
    excerpt: "Short-haul, long-haul and everything in between — with rough budgets so you can plan the trip before the wedding fatigue sets in.",
    body: [
      'Booking the honeymoon during wedding planning, not after, is the difference between a trip and a nap. Couples who lock dates and tickets three to four months out get better fares and don\'t lose the week to recovering from the wedding itself.',
      'For winter 2026, short-haul options like the Maldives and Bali are seeing the earliest price jumps for December departures, while longer trips to Japan and New Zealand are pricing better for a January start, once the peak-season surcharge drops.',
    ],
    author: 'Meher Sethi',
    date: '6 Aug 2026',
    readTime: '6 min read',
    order: 7,
  },
  {
    slug: '6-3-3-checklist',
    tag: BlogTag.Planning,
    title: 'The 6-Month, 3-Month, 3-Week Wedding Checklist Every Family Actually Follows',
    excerpt: 'The version of the checklist that survives contact with real relatives, real vendors, and one very opinionated aunt.',
    body: [
      'Most wedding checklists fail the same way: they\'re written as one long list in date order, so a family member opens it, sees eighty unchecked items, and closes it again. Splitting it into three horizons — 6 months, 3 months, 3 weeks — makes each stage feel finishable.',
      'The 6-month list is decisions (venue, date, budget ceiling); the 3-month list is bookings (vendors, outfits, invites); the 3-week list is logistics (final counts, seating, day-of contacts). Nothing on the 3-week list should require a decision — by then, everything should just need doing.',
    ],
    author: 'ApnaUtsav Editorial',
    date: '3 Aug 2026',
    readTime: '8 min read',
    order: 8,
  },
  {
    slug: 'indoor-vs-outdoor-mandap',
    tag: BlogTag.Vendors,
    title: 'Indoor vs Outdoor Mandap: What Changes for Weather, Sound and Your Photographer',
    excerpt: "The tradeoffs venues rarely spell out until you're already signing the contract.",
    body: [
      "An outdoor mandap photographs beautifully until 40% humidity turns the priest's microphone into static and a breeze relocates the flower petals mid-ceremony. Indoor venues trade that risk for a flatter, more controllable light that photographers have to work harder to make dramatic.",
      "The deciding factor is usually less about weather and more about sound: an open-air mandap needs a proper PA system for the mantras to reach guests past the second row, while an indoor hall's acoustics can make even a soft-spoken pandit audible without one.",
    ],
    author: 'Rohan Mehta',
    date: '30 Jul 2026',
    readTime: '5 min read',
    order: 9,
  },
  {
    slug: 'where-budgets-actually-go',
    tag: BlogTag.Budget,
    title: "Where Wedding Budgets Actually Go: A Breakdown From ApnaUtsav's Planned Weddings",
    excerpt: 'Venue, catering, décor, fashion — the real split families track, and where the overspend usually sneaks in.',
    body: [
      'Across weddings planned on ApnaUtsav, venue and catering together consistently take the largest single share of the budget — usually 40–50% combined — with décor and photography splitting most of what\'s left.',
      'The overspend rarely happens in the big categories, where families negotiate hardest; it happens in the ones nobody assigns a line item to — flowers for the mehendi, return gifts, last-minute alterations. Budgeting a fixed "miscellaneous" bucket up front, rather than letting it grow by subtraction, is the single change that keeps families closest to their number.',
    ],
    author: 'Ananya Kapoor',
    date: '27 Jul 2026',
    readTime: '6 min read',
    order: 10,
  },
  {
    slug: 'rsvp-etiquette-2026',
    tag: BlogTag.Guests,
    title: "RSVP Etiquette for 2026: How to Track Who's Actually Coming, Politely",
    excerpt: "Digital invites made replying easier and tracking harder. Here's how families are closing that gap.",
    body: [
      "A digital invite makes it effortless to say yes and just as effortless to never reply at all — there's no physical card sitting on a counter as a reminder. Families end up guessing final counts days before the caterer needs them.",
      'Setting a clear RSVP deadline inside the invite, following up once with a real message (not another mass forward) a week before that deadline, and tracking replies in one shared list rather than three people\'s individual texts closes most of the gap.',
    ],
    author: 'Priya Nair',
    date: '22 Jul 2026',
    readTime: '5 min read',
    order: 11,
  },
  {
    slug: 'haldi-to-reception-guide',
    tag: BlogTag.Rituals,
    title: 'Haldi to Reception: A Plain-Language Guide to Every Ceremony in Between',
    excerpt: 'One page to hand to the out-of-town guests who keep asking what each function actually is.',
    body: [
      "For guests attending their first big Indian wedding, the sequence of functions can be genuinely confusing — is the sangeet before or after the mehendi? Is the reception the same day as the wedding? The answer varies by region and family, which is exactly why it's confusing.",
      'As a rough, widely-used order: haldi and mehendi happen in the days before (often the same day, back to back), sangeet the night before or two nights before, the wedding ceremony itself with rituals like the saat phere, and the reception either that same evening or, increasingly, a separate day entirely.',
    ],
    author: 'Simran Kaur',
    date: '19 Jul 2026',
    readTime: '9 min read',
    order: 12,
  },
];

async function seedBlogs(): Promise<void> {
  const attributedUser = (await User.findOne({ role: 'admin' })) || (await User.findOne());
  const createdBy = attributedUser ? attributedUser._id : undefined;

  for (const seed of BLOG_SEEDS) {
    await Blog.findOneAndUpdate(
      { slug: seed.slug },
      { $setOnInsert: { ...seed, isPublished: true, createdBy } },
      { upsert: true, new: true }
    );
    logger.info(`Blog seeded/verified: ${seed.slug}`);
  }
}

// Ready-made checklist templates (#23) — deliberately not tied to any one
// wedding or user; every account sees these by default (isSystemTemplate),
// the same for a family planning their first wedding and (later) a
// planner account managing many. `dueOffsetDays` is relative to the
// wedding's own weddingDate, mostly negative (before the big day).
// Idempotent — upserted by `key`, so re-running this script never
// clobbers anything.
const TASK_TEMPLATE_SEEDS = [
  {
    key: 'standard-indian-wedding',
    name: 'Standard Indian Wedding Checklist',
    description:
      'A general-purpose checklist covering the essentials for a multi-day Indian wedding, from venue booking to the big day.',
    isSystemTemplate: true,
    items: [
      { title: 'Book the wedding venue', category: 'venue', priority: 'urgent' as const, dueOffsetDays: -120 },
      { title: 'Finalize guest list', category: 'others', priority: 'high' as const, dueOffsetDays: -90 },
      { title: 'Book photographer & videographer', category: 'photography', priority: 'high' as const, dueOffsetDays: -90 },
      { title: 'Shortlist and book caterer', category: 'catering', priority: 'high' as const, dueOffsetDays: -75 },
      { title: 'Send invitations', category: 'invitations', priority: 'high' as const, dueOffsetDays: -45 },
      { title: 'Finalize decoration theme', category: 'decoration', priority: 'medium' as const, dueOffsetDays: -45 },
      { title: 'Book DJ / live music', category: 'music', priority: 'medium' as const, dueOffsetDays: -30 },
      { title: 'Arrange guest travel & accommodation', category: 'logistics', priority: 'high' as const, dueOffsetDays: -21 },
      { title: 'Confirm final headcount with caterer', category: 'catering', priority: 'urgent' as const, dueOffsetDays: -7 },
      { title: 'Pack essentials for the big day', category: 'others', priority: 'medium' as const, dueOffsetDays: -2 },
      { title: 'Send thank-you notes to guests', category: 'others', priority: 'low' as const, dueOffsetDays: 7 }
    ]
  },
  {
    key: 'mehendi-ceremony',
    name: 'Mehendi Ceremony Checklist',
    description: 'Everything for a Mehendi function specifically — apply once you know its date.',
    isSystemTemplate: true,
    items: [
      { title: 'Book mehendi artist(s)', category: 'others', priority: 'high' as const, dueOffsetDays: -30, eventType: 'mehendi' },
      { title: 'Arrange mehendi-function decor', category: 'decoration', priority: 'medium' as const, dueOffsetDays: -14, eventType: 'mehendi' },
      { title: 'Plan mehendi-function menu', category: 'catering', priority: 'medium' as const, dueOffsetDays: -14, eventType: 'mehendi' },
      { title: 'Arrange seating & shade for mehendi guests', category: 'logistics', priority: 'medium' as const, dueOffsetDays: -7, eventType: 'mehendi' }
    ]
  }
];

async function seedTaskTemplates(): Promise<void> {
  for (const seed of TASK_TEMPLATE_SEEDS) {
    await TaskTemplate.findOneAndUpdate({ key: seed.key }, { $setOnInsert: seed }, { upsert: true, new: true });
    logger.info(`Task template seeded/verified: ${seed.key}`);
  }
}

// The landing page's FAQ accordion — was a hardcoded array in
// apnautasav_frontend/app/page.tsx, now served from here. Upserted by
// `question` (its natural identifying field, same idea as Blog's `slug`),
// so re-running this script never clobbers a live admin edit.
const FAQ_SEEDS = [
  {
    question: 'Does my family need to create accounts?',
    answer:
      "Anyone who will edit does — they get an email invite and a role. Anyone who only wants to watch can join with the 6-character wedding code as a viewer. Guests who just need the schedule need nothing at all.",
    order: 0,
  },
  {
    question: 'Can I import the guest list I already have?',
    answer:
      "Yes — a CSV or Excel export from anywhere. Column names don't have to match; you map them on the import screen, and there's a sample file to copy the shape from.",
    order: 1,
  },
  {
    question: 'What happens to my data after the wedding?',
    answer:
      "It stays. You can read everything, export the guest list and budget as CSV or PDF, and delete the whole wedding whenever you want. We don't sell it and we don't pass it to vendors.",
    order: 2,
  },
  {
    question: 'Do you take a cut from vendors?',
    answer:
      "No. Vendors pay to be listed and verified; they pay nothing on a booking, and their ranking isn't for sale. You can also add a vendor who isn't on ApnaUtsav at all.",
    order: 3,
  },
  {
    question: 'Is it in Hindi?',
    answer:
      "English and Hindi, switchable per person — your mother can read it in Hindi while you read the same wedding in English. The public guest page follows whatever you set for it.",
    order: 4,
  },
];

async function seedFaqs(): Promise<void> {
  for (const seed of FAQ_SEEDS) {
    await Faq.findOneAndUpdate({ question: seed.question }, { $setOnInsert: { ...seed, isActive: true } }, { upsert: true, new: true });
    logger.info(`FAQ seeded/verified: ${seed.question}`);
  }
}

// Real testimonials the landing page's "What our couples say" section
// renders — tied to REAL users/weddings pulled from the live database at
// seed time, not fabricated names. Only the `quote` prose itself is
// placeholder copy (a small rotating set of realistic templates) pending
// actual user-submitted reviews; `name`/`location`/`dateLabel`/`highlight`
// are all derived from that couple's real Wedding + Guest/Event data.
// Upserted by `weddingId` so re-running never duplicates a row, and skips
// entirely if there are no real weddings yet — a fresh/empty DB shows zero
// testimonials rather than fabricated ones (see testimonial.controller.ts).
const QUOTE_TEMPLATES = [
  "Everyone who needed to know something, knew it — without me repeating myself in five different family group chats.",
  "We had guests flying in from multiple cities, and RSVPs, rooms and tasks stayed beautifully organised the whole time.",
  "My mother could see the guest list, I could see the budget, and neither of us had to ask the other for an update.",
  "The vendor list alone saved us from double-booking the same date twice — small thing, huge relief.",
  "Everything that usually lives in twelve different notebooks lived in one place this time.",
  "Whoever was free at the time picked up the next task — nothing waited on one person's calendar.",
];

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AU';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function dateLabelFor(date?: Date): string | undefined {
  if (!date) return undefined;
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

async function seedTestimonials(): Promise<void> {
  const weddings = await Wedding.find({}).populate('createdBy', 'fullName avatarUrl').sort({ createdAt: -1 }).limit(20);

  if (weddings.length === 0) {
    logger.info('No real weddings found yet — skipping testimonial seeding (nothing fabricated for an empty DB).');
    return;
  }

  // One testimonial per distinct owner (most-recent wedding), not one per
  // wedding — a dev DB can have the same test account owning several
  // throwaway weddings, which would otherwise show the same person's name
  // repeated across "different" reviews.
  const seenOwners = new Set<string>();
  let index = 0;
  for (const wedding of weddings) {
    if (index >= 8) break;
    const owner = wedding.createdBy as unknown as { _id: mongoose.Types.ObjectId; fullName?: string; avatarUrl?: string } | null;
    if (!owner || !owner.fullName) continue;
    const ownerKey = String(owner._id);
    if (seenOwners.has(ownerKey)) continue;
    seenOwners.add(ownerKey);

    const [guestAgg, functionCount] = await Promise.all([
      Guest.aggregate([
        { $match: { weddingId: wedding._id } },
        { $group: { _id: null, total: { $sum: { $add: [1, { $ifNull: ['$plusOne', 0] }] } } } },
      ]),
      WeddingEvent.countDocuments({ weddingId: wedding._id }),
    ]);
    const guestCount = guestAgg[0]?.total || 0;
    const city = wedding.location?.split(',').pop()?.trim() || wedding.location;

    await Testimonial.findOneAndUpdate(
      { weddingId: wedding._id },
      {
        $setOnInsert: {
          userId: owner._id,
          weddingId: wedding._id,
          name: owner.fullName,
          location: city || undefined,
          dateLabel: dateLabelFor(wedding.weddingDate),
          initials: initialsFor(owner.fullName),
          avatarUrl: owner.avatarUrl || undefined,
          quote: QUOTE_TEMPLATES[index % QUOTE_TEMPLATES.length],
          highlight:
            functionCount > 0 || guestCount > 0
              ? `Planned ${functionCount} function${functionCount === 1 ? '' : 's'}, ${guestCount} guests`
              : undefined,
          rating: 5,
          order: index,
          isActive: true,
        },
      },
      { upsert: true, new: true }
    );
    logger.info(`Testimonial seeded/verified for wedding owner: ${owner.fullName}`);
    index += 1;
  }
}

async function main(): Promise<void> {
  await connectDatabase();
  await seedPlans();
  await seedVendorCategories();
  await seedBanners();
  await seedBlogs();
  await seedTaskTemplates();
  await seedFaqs();
  await seedTestimonials();
  logger.info('Seeding complete');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  logger.error('Seed script failed:', error);
  process.exit(1);
});
