import request from 'supertest';
import { useTestDatabase } from './helpers/db';
import { buildApp, bearer, createUser } from './helpers/app';
import { createWedding } from './helpers/fixtures';
import { twoAgencies } from './helpers/org-fixtures';
import { Vendor } from '../src/models/vendor.model';
import { Task } from '../src/models/task.model';
import { OrgVendorRoster } from '../src/models/org/org-vendor-roster.model';
import { OrgMember } from '../src/models/org/org-member.model';
import { Wedding } from '../src/models/wedding.model';

useTestDatabase();
const app = buildApp();
const api = (path: string) => `/api/v1${path}`;
const send = (u: any, method: 'get' | 'post' | 'patch' | 'delete', path: string, body?: object) => {
  const r = request(app)[method](api(path)).set(bearer(u));
  return body ? r.send(body) : r;
};

const roster = (orgId: unknown, by: unknown, over: Record<string, unknown> = {}) =>
  OrgVendorRoster.create({ organizationId: orgId, createdBy: by, name: 'Lens & Light', category: 'photographer', phone: '98290 00001', notes: 'Gives us 10%', ...over });

describe('vendor roster', () => {
  it('managers edit it, coordinators only use it, other agencies never see it', async () => {
    const s = await twoAgencies();
    const o = s.orgA._id;

    const created = await send(s.users.managerA, 'post', `/orgs/${o}/roster`, { name: 'Shubh Caterers', category: 'caterer', phone: '9000000001' });
    expect(created.status).toBe(201);
    expect((await send(s.users.managerA, 'post', `/orgs/${o}/roster`, { name: 'Copy', category: 'caterer', phone: '+91 90000 00001' })).status).toBe(409);
    expect((await send(s.users.coordA, 'post', `/orgs/${o}/roster`, { name: 'X', category: 'dj', phone: '9000000002' })).status).toBe(403);

    const list = await send(s.users.coordA, 'get', `/orgs/${o}/roster`);
    expect(list.body.data.map((r: any) => r.name)).toEqual(['Shubh Caterers']);
    expect((await send(s.users.ownerB, 'get', `/orgs/${o}/roster`)).status).toBe(404);
    expect((await send(s.users.ownerB, 'patch', `/orgs/${s.orgB._id}/roster/${created.body.data._id}`, { name: 'Hijack' })).status).toBe(404);
  });

  it('pushes into a client wedding once, without the agency\'s private notes', async () => {
    const s = await twoAgencies();
    const o = s.orgA._id;
    const a = await roster(o, s.users.ownerA._id);
    const b = await roster(o, s.users.ownerA._id, { name: 'Shubh Caterers', category: 'caterer', phone: '9000000001' });
    const w = String(s.weddingA1._id);

    const first = await send(s.users.coordA, 'post', `/orgs/${o}/roster/push`, { rosterIds: [String(a._id), String(b._id)], weddingId: w });
    expect(first.status).toBe(200);
    expect(first.body.data.added).toBe(2);
    const again = await send(s.users.ownerA, 'post', `/orgs/${o}/roster/push`, { rosterIds: [String(a._id)], weddingId: w });
    expect(again.body.data.added).toBe(0);
    expect(again.body.data.results[0].reason).toBe('Already on this wedding');

    const vendors = await Vendor.find({ weddingId: w }).lean();
    expect(vendors).toHaveLength(2);
    expect(vendors.every((v) => !v.notes)).toBe(true);

    // Not on the wedding / other agency's wedding.
    expect((await send(s.users.coord2A, 'post', `/orgs/${o}/roster/push`, { rosterIds: [String(a._id)], weddingId: w })).status).toBe(404);
    expect((await send(s.users.ownerA, 'post', `/orgs/${o}/roster/push`, { rosterIds: [String(a._id)], weddingId: String(s.weddingB1._id) })).status).toBe(404);
  });

  it('saves a wedding vendor to the roster, and imports a CSV with a dry run first', async () => {
    const s = await twoAgencies();
    const o = s.orgA._id;
    const v = await Vendor.create({ weddingId: s.weddingA1._id, vendorName: 'Rang Decor', category: 'decorator', phoneNumber: '9111111111', addedBy: s.users.ownerA._id });
    const saved = await send(s.users.managerA, 'post', `/orgs/${o}/roster/from-wedding-vendor`, { weddingId: String(s.weddingA1._id), vendorId: String(v._id) });
    expect(saved.status).toBe(201);
    expect(saved.body.data).toMatchObject({ name: 'Rang Decor', category: 'decorator' });

    const rows = [
      { name: 'Dhol Masters', category: 'Band', phone: '9222222222' },
      { name: 'No Phone', category: 'dj' },
      { name: 'Mystery', category: 'astrologer', phone: '9333333333' },
      { name: 'Rang Decor again', category: 'decor', phone: '9111111111' },
    ];
    const dry = await send(s.users.managerA, 'post', `/orgs/${o}/roster/import`, { rows, dryRun: true });
    expect(dry.body.data).toMatchObject({ dryRun: true, created: 0, valid: 1 });
    expect(dry.body.data.results.map((r: any) => r.ok)).toEqual([true, false, false, false]);
    expect(await OrgVendorRoster.countDocuments({ organizationId: o })).toBe(1);

    const real = await send(s.users.managerA, 'post', `/orgs/${o}/roster/import`, { rows });
    expect(real.body.data.created).toBe(1);
    expect((await OrgVendorRoster.findOne({ name: 'Dhol Masters' }))!.category).toBe('band');

    // Coordinators lack roster.manage/import.
    expect((await send(s.users.coordA, 'post', `/orgs/${o}/roster/import`, { rows })).status).toBe(403);
  });
});

describe('agency templates', () => {
  const items = [
    { title: 'Confirm venue', category: 'venue', dueOffsetDays: -60, assigneeRole: 'lead' },
    { title: 'Call decorator', category: 'decoration', dueOffsetDays: -30, assigneeRole: 'coordinator' },
    { title: 'Collect planner fee', category: 'others', dueOffsetDays: -7, isInternal: true },
  ];

  it('are shared with the agency, editable only with templates.manage, invisible to others', async () => {
    const s = await twoAgencies();
    const created = await send(s.users.managerA, 'post', '/task-templates', { name: 'Udaipur destination', items, organizationId: String(s.orgA._id) });
    expect(created.status).toBe(201);
    expect((await send(s.users.coordA, 'post', '/task-templates', { name: 'Mine for agency', items, organizationId: String(s.orgA._id) })).status).toBe(403);

    const coordList = await send(s.users.coordA, 'get', '/task-templates');
    const shared = coordList.body.data.find((t: any) => t.name === 'Udaipur destination');
    expect(shared).toMatchObject({ canEdit: false, organization: { id: String(s.orgA._id) } });
    expect((await send(s.users.coordA, 'patch', `/task-templates/${created.body.data._id}`, { name: 'x' })).status).toBe(404);
    expect((await request(app).put(api(`/task-templates/${created.body.data._id}`)).set(bearer(s.users.coordA)).send({ name: 'Renamed' })).status).toBe(404);
    expect((await request(app).put(api(`/task-templates/${created.body.data._id}`)).set(bearer(s.users.ownerA)).send({ name: 'Renamed' })).status).toBe(200);

    const otherList = await send(s.users.ownerB, 'get', '/task-templates');
    expect(otherList.body.data.some((t: any) => t._id === created.body.data._id)).toBe(false);
  });

  it('apply onto the agency\'s weddings with the right assignees and team-only flags', async () => {
    const s = await twoAgencies();
    const t = await send(s.users.ownerA, 'post', '/task-templates', { name: 'Standard', items, organizationId: String(s.orgA._id) });
    const tid = t.body.data._id;

    const applied = await send(s.users.coordA, 'post', `/weddings/${s.weddingA1._id}/tasks/apply-template/${tid}`);
    expect(applied.status).toBe(201);
    const tasks = await Task.find({ weddingId: s.weddingA1._id }).lean();
    const byTitle = Object.fromEntries(tasks.map((x) => [x.title, x]));
    expect(byTitle['Confirm venue'].assignedTo.map(String)).toEqual([String(s.users.ownerA._id)]);
    expect(byTitle['Call decorator'].assignedTo.map(String)).toEqual([String(s.users.coordA._id)]);
    expect(byTitle['Collect planner fee'].isInternal).toBe(true);

    // The client family never sees the team-only one.
    const clientTasks = await send(s.users.clientA, 'get', `/weddings/${s.weddingA1._id}/tasks`);
    expect(clientTasks.body.data.map((x: any) => x.title)).not.toContain('Collect planner fee');

    // Not on a personal wedding, not by another agency.
    const personal = await createWedding(s.users.ownerA._id);
    expect((await send(s.users.ownerA, 'post', `/weddings/${personal._id}/tasks/apply-template/${tid}`)).status).toBe(403);
    expect((await send(s.users.ownerB, 'post', `/weddings/${s.weddingB1._id}/tasks/apply-template/${tid}`)).status).toBe(404);
  });

  it('personal templates still work as before', async () => {
    const user = await createUser();
    const other = await createUser();
    const mine = await send(user, 'post', '/task-templates', { name: 'My checklist', items: [{ title: 'Book pandit', category: 'others', dueOffsetDays: -20 }] });
    expect(mine.status).toBe(201);
    expect((await send(user, 'get', '/task-templates')).body.data.find((t: any) => t._id === mine.body.data._id)).toMatchObject({ canEdit: true, organization: null });
    expect((await send(other, 'get', '/task-templates')).body.data.some((t: any) => t._id === mine.body.data._id)).toBe(false);

    const wedding = await createWedding(user._id);
    expect((await send(user, 'post', `/weddings/${wedding._id}/tasks/apply-template/${mine.body.data._id}`)).status).toBe(201);
  });

  it('saves an existing wedding as a template, offsets from the wedding date', async () => {
    const s = await twoAgencies();
    const wedding = await Wedding.findById(s.weddingA1._id).orFail();
    const day = 24 * 60 * 60 * 1000;
    await Task.create([
      { weddingId: wedding._id, title: 'Book band', category: 'music', createdBy: s.users.ownerA._id, dueDate: new Date(wedding.weddingDate.getTime() - 45 * day) },
      { weddingId: wedding._id, title: 'Our margin', category: 'others', createdBy: s.users.ownerA._id, isInternal: true },
      { weddingId: wedding._id, title: 'Dropped', category: 'others', createdBy: s.users.ownerA._id, status: 'cancelled' },
    ]);
    const res = await send(s.users.ownerA, 'post', `/orgs/${s.orgA._id}/templates/from-wedding/${wedding._id}`, { name: 'From Mehta wedding' });
    expect(res.status).toBe(201);
    const its = res.body.data.items;
    expect(its.map((i: any) => i.title)).toEqual(['Book band', 'Our margin']);
    expect(its[0].dueOffsetDays).toBe(-45);
    expect(its[1]).toMatchObject({ isInternal: true, dueOffsetDays: 0 });

    expect((await send(s.users.coordA, 'post', `/orgs/${s.orgA._id}/templates/from-wedding/${wedding._id}`, { name: 'Nope' })).status).toBe(403);
  });
});

describe('vendor CSV import into a wedding', () => {
  it('imports good rows, skips duplicates, reports bad ones', async () => {
    const owner = await createUser();
    const wedding = await createWedding(owner._id);
    await Vendor.create({ weddingId: wedding._id, vendorName: 'Existing DJ', category: 'dj', phoneNumber: '9444444444', addedBy: owner._id });
    const rows = [
      { name: 'Shubh Caterers', category: 'catering', phone: '9000000001', price: '₹4,00,000' },
      { name: 'Existing DJ', category: 'dj', phone: '9444444444' },
      { name: 'Bad', category: 'unknown thing', phone: '9555555555' },
    ];
    const res = await send(owner, 'post', `/weddings/${wedding._id}/vendors/bulk-import`, { rows });
    expect(res.status).toBe(201);
    expect(res.body.data.created).toBe(1);
    expect(res.body.data.results.map((r: any) => [r.ok, !!r.skipped])).toEqual([[true, false], [false, true], [false, false]]);
    expect((await Vendor.findOne({ vendorName: 'Shubh Caterers' }))!.estimatedCost).toBe(400000);
  });

  it('agency staff need the import permission', async () => {
    const s = await twoAgencies();
    const rows = [{ name: 'X Band', category: 'band', phone: '9666666666' }];
    expect((await send(s.users.coordA, 'post', `/weddings/${s.weddingA1._id}/vendors/bulk-import`, { rows })).status).toBe(403);
    await OrgMember.updateOne({ organizationId: s.orgA._id, userId: s.users.coordA._id }, { permissionOverrides: { grant: ['import'], revoke: [] } });
    expect((await send(s.users.coordA, 'post', `/weddings/${s.weddingA1._id}/vendors/bulk-import`, { rows })).status).toBe(201);
  });
});
