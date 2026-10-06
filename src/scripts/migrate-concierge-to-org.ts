/**
 * Move a concierge-pilot planner onto a Track C Organization.
 * See services/org/org-migration.service.ts for exactly what changes.
 *
 *   npx ts-node src/scripts/migrate-concierge-to-org.ts \
 *     --planner planner@agency.in --org "Sharma Events" \
 *     [--plan org_founding] [--staff a@x.in:coordinator,b@x.in:manager] [--dry-run]
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDatabase } from '../config/database';
import { migrateConciergePlanner } from '../services/org/org-migration.service';
import { ORG_PLAN_KEYS, OrgPlanKey } from '../constants/org';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const plannerEmail = arg('planner');
  const orgName = arg('org');
  const planKey = arg('plan') as OrgPlanKey | undefined;
  if (!plannerEmail || !orgName) throw new Error('Usage: --planner <email> --org "<name>" [--plan key] [--staff email:role,...] [--dry-run]');
  if (planKey && !ORG_PLAN_KEYS.includes(planKey)) throw new Error(`--plan must be one of ${ORG_PLAN_KEYS.join(', ')}`);

  const staff = (arg('staff') ?? '')
    .split(',')
    .filter(Boolean)
    .map((pair) => {
      const [email, role = 'coordinator'] = pair.split(':');
      if (role !== 'manager' && role !== 'coordinator') throw new Error(`Staff role must be manager or coordinator (${pair})`);
      return { email, role: role as 'manager' | 'coordinator' };
    });

  await connectDatabase();
  const result = await migrateConciergePlanner({ plannerEmail, orgName, planKey, staff, dryRun: process.argv.includes('--dry-run') });
  result.report.forEach((line) => console.log(line));
  console.log(`\nOrganization: ${result.orgId ?? '(not created)'} · weddings moved: ${result.weddingsMoved}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message || error);
  await mongoose.disconnect();
  process.exit(1);
});
