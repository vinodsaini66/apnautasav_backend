import request from 'supertest';
import { useTestDatabase } from './helpers/db';
import { buildApp, createUser } from './helpers/app';
import { createOrg } from './helpers/org-fixtures';
import { ORG_PLANS } from '../src/constants/org';

useTestDatabase();
const app = buildApp();

describe('public plan catalogue', () => {
  it('lists the self-serve plans without a login and hides admin-only ones', async () => {
    const res = await request(app).get('/api/v1/orgs/plans');
    expect(res.status).toBe(200);
    const keys = res.body.data.plans.map((p: { key: string }) => p.key);
    expect(keys).toEqual(['org_starter', 'org_growth', 'org_agency']);
    expect(res.body.data.plans[1]).toMatchObject({ priceMonthly: ORG_PLANS.org_growth.priceMonthly, limits: { whiteLabel: true } });
    expect(res.body.data).toMatchObject({ trialDays: 30, annualMonthsFree: 2 });
    expect(res.body.data.founding).toMatchObject({ priceMonthly: 999, compareAtMonthly: 2999, slots: 3, slotsLeft: 3 });
  });

  it('counts Founding Planner slots already taken', async () => {
    const owner = await createUser();
    await createOrg(owner, { planKey: 'org_founding' });
    const res = await request(app).get('/api/v1/orgs/plans');
    expect(res.body.data.founding.slotsLeft).toBe(2);
  });
});
