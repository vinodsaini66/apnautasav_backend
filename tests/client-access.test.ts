import request from 'supertest';
import { useTestDatabase } from './helpers/db';
import { buildApp, bearer, createUser } from './helpers/app';
import { twoAgencies } from './helpers/org-fixtures';
import { Task } from '../src/models/task.model';
import { Vendor } from '../src/models/vendor.model';
import { SharedNote } from '../src/models/sharedNote.model';
import { Budget } from '../src/models/budget.model';
import { WeddingEvent } from '../src/models/event.model';
import { Organization } from '../src/models/org/organization.model';
import { Wedding } from '../src/models/wedding.model';

useTestDatabase();
const app = buildApp();
const api = (path: string) => `/api/v1${path}`;

/** Agency A's wedding A1 with one public and one team-only item of every kind. */
const scenario = async () => {
  const s = await twoAgencies();
  const weddingId = s.weddingA1._id;
  const by = s.users.ownerA._id;
  const [publicTask, internalTask] = await Task.create([
    { weddingId, title: 'Book mehendi artist', category: 'decoration', createdBy: by },
    { weddingId, title: 'Negotiate decorator margin', category: 'decoration', createdBy: by, isInternal: true },
  ]);
  await Vendor.create([
    { weddingId, vendorName: 'Lens & Light', category: 'photographer', phoneNumber: '9999999999', addedBy: by, estimatedCost: 150000, paymentTerms: '50% advance', notes: 'Owes us a favour' },
    { weddingId, vendorName: 'Secret Florist', category: 'decorator', phoneNumber: '8888888888', addedBy: by, isInternal: true },
  ]);
  const [publicNote, internalNote] = await SharedNote.create([
    { weddingId, title: 'Family notes', content: 'Grandma needs a wheelchair', createdBy: by },
    { weddingId, title: 'Margins', content: 'We mark up catering 12%', createdBy: by, isInternal: true },
  ]);
  await Budget.create([
    { weddingId, category: 'catering', description: 'Dinner', estimatedCost: 400000, actualCost: 380000, addedBy: by },
    { weddingId, category: 'others', description: 'Planner fee', estimatedCost: 90000, addedBy: by, isInternal: true },
  ]);
  await WeddingEvent.create({ weddingId, title: 'Sangeet night', eventType: 'sangeet', createdBy: by, estimatedBudget: 300000 });
  return { ...s, weddingId: String(weddingId), publicTask, internalTask, publicNote, internalNote };
};

const get = (u: any, path: string) => request(app).get(api(path)).set(bearer(u));

describe('client family on an agency wedding — default ("collaborate")', () => {
  it('never sees team-only items, and money detail is hidden', async () => {
    const s = await scenario();
    const c = s.users.clientA;
    const w = s.weddingId;

    const tasks = await get(c, `/weddings/${w}/tasks`);
    expect(tasks.status).toBe(200);
    expect(tasks.body.data.map((t: any) => t.title)).toEqual(['Book mehendi artist']);

    const vendors = await get(c, `/weddings/${w}/vendors`);
    expect(vendors.body.data).toHaveLength(1);
    expect(vendors.body.data[0]).toMatchObject({ vendorName: 'Lens & Light', estimatedCost: 0 });
    expect(vendors.body.data[0].notes).toBeUndefined();
    expect(vendors.body.data[0].paymentTerms).toBeNull();

    const notes = await get(c, `/weddings/${w}/notes`);
    expect(notes.body.data.map((n: any) => n.title)).toEqual(['Family notes']);

    expect((await get(c, `/weddings/${w}/budget`)).status).toBe(403);
    expect((await get(c, `/weddings/${w}/activities`)).status).toBe(403);
    expect((await get(c, `/weddings/${w}/vendors/export`)).status).toBe(403);

    const stats = await get(c, `/weddings/${w}/stats`);
    expect(stats.body.data.tasks.total).toBe(1);
    expect(stats.body.data.budget).toMatchObject({ total: 0, spent: 0 });

    const wedding = await get(c, `/weddings/${w}`);
    expect(wedding.body.data.totalBudget).toBe(0);

    const events = await get(c, `/weddings/${w}/events`);
    expect(JSON.stringify(events.body.data)).not.toContain('300000');

    const search = await get(c, `/weddings/${w}/search?q=a`);
    const titles = search.body.data.map((r: any) => r.title);
    expect(titles).not.toContain('Negotiate decorator margin');
    expect(titles).not.toContain('Secret Florist');
    expect(titles).not.toContain('Margins');
    expect(search.body.data.some((r: any) => r.type === 'budget')).toBe(false);
  });

  it('staff still see everything', async () => {
    const s = await scenario();
    const tasks = await get(s.users.ownerA, `/weddings/${s.weddingId}/tasks`);
    expect(tasks.body.data).toHaveLength(2);
    const vendors = await get(s.users.ownerA, `/weddings/${s.weddingId}/vendors`);
    expect(vendors.body.data.find((v: any) => v.vendorName === 'Lens & Light')).toMatchObject({ estimatedCost: 150000, notes: 'Owes us a favour' });
  });

  it('can edit guests and complete visible tasks, but nothing else', async () => {
    const s = await scenario();
    const c = s.users.clientA;
    const w = s.weddingId;

    const guest = await request(app).post(api(`/weddings/${w}/guests`)).set(bearer(c)).send({ name: 'Mama ji', category: 'family' });
    expect(guest.status).toBe(201);

    expect((await request(app).post(api(`/weddings/${w}/tasks`)).set(bearer(c)).send({})).status).toBe(403);
    expect((await request(app).post(api(`/weddings/${w}/vendors`)).set(bearer(c)).send({})).status).toBe(403);
    expect((await request(app).put(api(`/weddings/${w}`)).set(bearer(c)).send({})).status).toBe(403);

    expect((await request(app).post(api(`/weddings/${w}/tasks/${s.publicTask._id}/complete`)).set(bearer(c)).send({})).status).toBe(200);
    expect((await request(app).post(api(`/weddings/${w}/tasks/${s.internalTask._id}/complete`)).set(bearer(c)).send({})).status).toBe(404);
    expect((await Task.findById(s.internalTask._id))!.status).not.toBe('completed');

    // Internal notes can't be edited or deleted by id either.
    expect((await request(app).put(api(`/weddings/${w}/notes/${s.internalNote._id}`)).set(bearer(c)).send({ title: 'x' })).status).toBe(404);
    expect((await request(app).delete(api(`/weddings/${w}/notes/${s.internalNote._id}`)).set(bearer(c))).status).toBe(404);
  });

  it('only agency staff can mark things team-only', async () => {
    const s = await scenario();
    const w = s.weddingId;
    const byClient = await request(app).post(api(`/weddings/${w}/notes`)).set(bearer(s.users.clientA)).send({ title: 'Ours', content: 'x', isInternal: true });
    expect(byClient.body.data.isInternal).toBe(false);
    const byStaff = await request(app).post(api(`/weddings/${w}/notes`)).set(bearer(s.users.coordA)).send({ title: 'Team', content: 'x', isInternal: true });
    expect(byStaff.body.data.isInternal).toBe(true);
  });
});

describe('planner changes what the family sees', () => {
  it('opens budget and vendor detail, then resets to the agency default', async () => {
    const s = await scenario();
    const w = s.weddingId;
    const c = s.users.clientA;

    const set = await request(app)
      .patch(api(`/weddings/${w}/client-access`))
      .set(bearer(s.users.ownerA))
      .send({ preset: 'custom', sections: { budget: 'full', vendors: 'full', activity: 'view' } });
    expect(set.status).toBe(200);
    expect(set.body.data.clientAccess.sections).toMatchObject({ budget: 'full', vendors: 'full', activity: 'view', guests: 'edit' });

    const budget = await get(c, `/weddings/${w}/budget`);
    expect(budget.status).toBe(200);
    expect(budget.body.data.map((b: any) => b.description)).toEqual(['Dinner']);
    expect(budget.body.data[0].actualCost).toBe(380000);
    expect((await get(c, `/weddings/${w}/activities`)).status).toBe(200);
    const vendors = await get(c, `/weddings/${w}/vendors`);
    expect(vendors.body.data[0]).toMatchObject({ estimatedCost: 150000, notes: 'Owes us a favour' });

    // Client-visible totals leave out the team-only planner fee.
    const stats = await get(c, `/weddings/${w}/stats`);
    expect(stats.body.data.budget.items).toBe(1);

    await request(app).patch(api(`/weddings/${w}/client-access`)).set(bearer(s.users.ownerA)).send({ reset: true });
    expect((await get(c, `/weddings/${w}/budget`)).status).toBe(403);
  });

  it('hidden sections are closed; view-only stops edits', async () => {
    const s = await scenario();
    const w = s.weddingId;
    await request(app)
      .patch(api(`/weddings/${w}/client-access`))
      .set(bearer(s.users.ownerA))
      .send({ preset: 'custom', sections: { guests: 'hidden' } });
    expect((await get(s.users.clientA, `/weddings/${w}/guests`)).status).toBe(403);

    await request(app).patch(api(`/weddings/${w}/client-access`)).set(bearer(s.users.ownerA)).send({ preset: 'view_only' });
    expect((await get(s.users.clientA, `/weddings/${w}/guests`)).status).toBe(200);
    expect((await request(app).post(api(`/weddings/${w}/guests`)).set(bearer(s.users.clientA)).send({ name: 'X Y', category: 'family' })).status).toBe(403);
  });

  it('only staff with client.manage can change it', async () => {
    const s = await scenario();
    const w = s.weddingId;
    expect((await request(app).patch(api(`/weddings/${w}/client-access`)).set(bearer(s.users.clientA)).send({ preset: 'collaborate' })).status).toBe(403);
    expect((await request(app).patch(api(`/weddings/${w}/client-access`)).set(bearer(s.users.coordA)).send({ preset: 'collaborate' })).status).toBe(403);
    expect((await request(app).patch(api(`/weddings/${w}/client-access`)).set(bearer(s.users.managerA)).send({ preset: 'collaborate' })).status).toBe(200);
  });

  it('the agency default applies to weddings without their own setting', async () => {
    const s = await scenario();
    const res = await request(app).patch(api(`/orgs/${s.orgA._id}`)).set(bearer(s.users.ownerA)).send({ defaultClientAccess: { preset: 'view_only' } });
    expect(res.status).toBe(200);
    expect(res.body.data.defaultClientAccess.preset).toBe('view_only');
    const access = await get(s.users.clientA, `/weddings/${s.weddingId}/access`);
    expect(access.body.data.clientAccess.preset).toBe('view_only');
    expect(access.body.data.permissions).not.toContain('guests.manage');
  });
});

describe('join by code on agency weddings', () => {
  it('is off by default and works once the planner allows it', async () => {
    const s = await scenario();
    const wedding = await Wedding.findById(s.weddingId).orFail();
    const someone = await createUser();

    const blocked = await request(app).post(api('/weddings/join')).set(bearer(someone)).send({ weddingCode: wedding.weddingCode });
    expect(blocked.status).toBe(403);

    await request(app).patch(api(`/weddings/${s.weddingId}/client-access`)).set(bearer(s.users.ownerA)).send({ preset: 'collaborate', allowJoinByCode: true });
    const ok = await request(app).post(api('/weddings/join')).set(bearer(someone)).send({ weddingCode: wedding.weddingCode });
    expect(ok.status).toBe(200);
    const access = await get(someone, `/weddings/${s.weddingId}/access`);
    expect(access.body.data).toMatchObject({ kind: 'client', role: 'viewer' });
  });
});

describe('planning team on the wedding', () => {
  it('is listed with the collaborators and can be assigned tasks', async () => {
    const s = await scenario();
    const w = s.weddingId;
    const list = await get(s.users.clientA, `/weddings/${w}/collaborators`);
    const staff = list.body.data.filter((c: any) => c.isStaff);
    expect(staff.map((c: any) => c.staffRole).sort()).toEqual(['coordinator', 'owner']);

    const assign = await request(app)
      .post(api(`/weddings/${w}/tasks/${s.publicTask._id}/assign`))
      .set(bearer(s.users.ownerA))
      .send({ assignedTo: [String(s.users.coordA._id), String(s.users.clientA._id)] });
    expect(assign.status).toBe(200);

    // Someone on the team but not on this wedding can't be.
    const notOnIt = await request(app)
      .post(api(`/weddings/${w}/tasks/${s.publicTask._id}/assign`))
      .set(bearer(s.users.ownerA))
      .send({ assignedTo: [String(s.users.coord2A._id)] });
    expect(notOnIt.status).toBe(400);
  });
});

describe('read-only agencies', () => {
  it('keep read access for staff and clients', async () => {
    const s = await scenario();
    await Organization.updateOne({ _id: s.orgA._id }, { planStatus: 'paused' });
    expect((await get(s.users.coordA, `/weddings/${s.weddingId}/tasks`)).status).toBe(200);
    expect((await get(s.users.clientA, `/weddings/${s.weddingId}/tasks`)).status).toBe(200);
    expect((await request(app).post(api(`/weddings/${s.weddingId}/guests`)).set(bearer(s.users.clientA)).send({ name: 'X Y', category: 'family' })).status).toBe(403);
  });
});

describe('dashboard list for a client', () => {
  it('hides budget totals on the agency wedding card', async () => {
    const s = await scenario();
    const res = await get(s.users.clientA, '/weddings?include=summary');
    const card = res.body.data.find((w: any) => w._id === s.weddingId);
    expect(card.totalBudget).toBe(0);
    expect(card.summary.budget.spent).toBe(0);
    expect(card.summary.tasks.total).toBe(1);
  });
});

