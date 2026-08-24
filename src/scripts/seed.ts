import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDatabase } from '../config/database';
import { Plan } from '../models/plan.model';
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

async function main(): Promise<void> {
  await connectDatabase();
  await seedPlans();
  logger.info('Seeding complete');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  logger.error('Seed script failed:', error);
  process.exit(1);
});
