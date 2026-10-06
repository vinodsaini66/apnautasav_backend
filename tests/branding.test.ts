import request from 'supertest';
import { useTestDatabase } from './helpers/db';
import { buildApp, bearer, createUser } from './helpers/app';
import { twoAgencies, createOrg, createOrgWedding } from './helpers/org-fixtures';
import { Organization } from '../src/models/org/organization.model';
import { Wedding } from '../src/models/wedding.model';
import { ORG_PLANS } from '../src/constants/org';
import { toPDF } from '../src/services/export.service';

useTestDatabase();
const app = buildApp();
const api = (path: string) => `/api/v1${path}`;
const DAY = 24 * 60 * 60 * 1000;

describe('off-season pause', () => {
  it('owner pauses (read-only) and resumes; the paid period moves back by the paused time', async () => {
    const s = await twoAgencies();
    const o = s.orgA._id;
    const before = (await Organization.findById(o).orFail()).currentPeriodEnd!.getTime();

    expect((await request(app).post(api(`/orgs/${o}/billing/pause`)).set(bearer(s.users.managerA))).status).toBe(403);
    const paused = await request(app).post(api(`/orgs/${o}/billing/pause`)).set(bearer(s.users.ownerA));
    expect(paused.status).toBe(200);
    expect(paused.body.data).toMatchObject({ planStatus: 'paused', readOnly: 'paused' });

    // Read-only while paused: viewing works, changing doesn't.
    expect((await request(app).get(api(`/weddings/${s.weddingA1._id}/guests`)).set(bearer(s.users.coordA))).status).toBe(200);
    expect((await request(app).post(api(`/weddings/${s.weddingA1._id}/guests`)).set(bearer(s.users.coordA)).send({ name: 'Xy Z', category: 'family' })).status).toBe(403);
    expect((await request(app).post(api(`/orgs/${o}/billing/pause`)).set(bearer(s.users.ownerA))).status).toBe(400);

    // Pretend the pause started 10 days ago.
    await Organization.updateOne({ _id: o }, { pausedAt: new Date(Date.now() - 10 * DAY) });
    const resumed = await request(app).post(api(`/orgs/${o}/billing/resume`)).set(bearer(s.users.ownerA));
    expect(resumed.status).toBe(200);
    expect(resumed.body.data).toMatchObject({ planStatus: 'active', readOnly: null });
    const after = (await Organization.findById(o).orFail()).currentPeriodEnd!.getTime();
    expect(Math.round((after - before) / DAY)).toBe(10);

    expect((await request(app).post(api(`/weddings/${s.weddingA1._id}/guests`)).set(bearer(s.users.coordA)).send({ name: 'Xy Z', category: 'family' })).status).toBe(201);
  });

  it('can\'t pause a plan that has already lapsed', async () => {
    const owner = await createUser();
    const org = await createOrg(owner, { planStatus: 'active', currentPeriodEnd: new Date(Date.now() - 30 * DAY) });
    expect((await request(app).post(api(`/orgs/${org._id}/billing/pause`)).set(bearer(owner))).status).toBe(400);
  });
});

describe('white-label branding', () => {
  it('tells the workspace whether the agency\'s look applies', async () => {
    const s = await twoAgencies(); // agencies are on Growth (white-label)
    await Organization.updateOne({ _id: s.orgA._id }, { brandColor: '#1f4b4c', showPoweredBy: false });
    const access = await request(app).get(api(`/weddings/${s.weddingA1._id}/access`)).set(bearer(s.users.clientA));
    expect(access.body.data.org).toMatchObject({ whiteLabel: true, showPoweredBy: false, brandColor: '#1f4b4c' });

    // On a plan without white-label, "Powered by" always shows and the look doesn't apply.
    await Organization.updateOne({ _id: s.orgA._id }, { limitsSnapshot: ORG_PLANS.org_starter.limits });
    const starter = await request(app).get(api(`/weddings/${s.weddingA1._id}/access`)).set(bearer(s.users.clientA));
    expect(starter.body.data.org).toMatchObject({ whiteLabel: false, showPoweredBy: true });
  });

  it('only white-label plans may hide "Powered by ApnaUtsav"', async () => {
    const owner = await createUser();
    const org = await createOrg(owner, { limitsSnapshot: ORG_PLANS.org_starter.limits });
    const res = await request(app).patch(api(`/orgs/${org._id}`)).set(bearer(owner)).send({ showPoweredBy: false });
    expect(res.status).toBe(403);
    expect(res.body.errors).toMatchObject({ code: 'ORG_PLAN_FEATURE', feature: 'whiteLabel' });
    expect((await request(app).patch(api(`/orgs/${org._id}`)).set(bearer(owner)).send({ brandColor: '#123456' })).status).toBe(200);
  });

  it('signs the public wedding page for white-label agencies only', async () => {
    const s = await twoAgencies();
    await Wedding.updateOne({ _id: s.weddingA1._id }, { isPublic: true, publicSlug: 'asha-vikram' });
    const page = await request(app).get(api('/weddings/public/asha-vikram'));
    expect(page.body.data.planner).toMatchObject({ name: s.orgA.name, showPoweredBy: true });
    await Organization.updateOne({ _id: s.orgA._id }, { showPoweredBy: false });
    expect((await request(app).get(api('/weddings/public/asha-vikram'))).body.data.planner.showPoweredBy).toBe(false);

    await Organization.updateOne({ _id: s.orgA._id }, { limitsSnapshot: ORG_PLANS.org_starter.limits });
    const plain = await request(app).get(api('/weddings/public/asha-vikram'));
    expect(plain.body.data.planner).toBeNull();

    // Family weddings never carry one.
    const owner = await createUser();
    const family = await createOrgWedding(null as any, owner._id);
    await Wedding.updateOne({ _id: family._id }, { $unset: { organizationId: 1 }, isPublic: true, publicSlug: 'family-page' });
    expect((await request(app).get(api('/weddings/public/family-page'))).body.data.planner).toBeNull();
  });
});

describe('branded PDF exports', () => {
  it('exports a PDF from an agency wedding', async () => {
    const s = await twoAgencies();
    const branded = await request(app).get(api(`/weddings/${s.weddingA1._id}/guests/export?format=pdf`)).set(bearer(s.users.coordA)).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(branded.status).toBe(200);
    expect(branded.headers['content-type']).toContain('application/pdf');
    expect((branded.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('draws the agency header and footer only when branding is given', async () => {
    const cols = [{ key: 'name', label: 'Name' }];
    const rows = [{ name: 'Asha' }];
    const plain = await toPDF('Guest List', rows, cols);
    const withBrand = await toPDF('Guest List', rows, cols, { name: 'Meera Weddings', color: '#1f4b4c', showPoweredBy: true });
    expect(plain.subarray(0, 4).toString()).toBe('%PDF');
    expect(withBrand.length).toBeGreaterThan(plain.length);
  });
});
