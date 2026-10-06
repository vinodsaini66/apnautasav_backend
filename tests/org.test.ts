import request from 'supertest';
import { useTestDatabase } from './helpers/db';
import { buildApp, bearer, createUser } from './helpers/app';
import { createWedding, addCollaborator } from './helpers/fixtures';
import { twoAgencies, createOrg } from './helpers/org-fixtures';
import { Organization } from '../src/models/org/organization.model';
import { OrgMember } from '../src/models/org/org-member.model';
import { Wedding } from '../src/models/wedding.model';
import { Collaborator } from '../src/models/collaborator.model';
import { migrateConciergePlanner } from '../src/services/org/org-migration.service';
import { ORG_PLANS } from '../src/constants/org';

useTestDatabase();
const app = buildApp();
const api = (path: string) => `/api/v1${path}`;

const weddingBody = (extra: object = {}) => ({
  name: 'Client Wedding',
  brideName: 'Asha',
  groomName: 'Vikram',
  weddingDate: '2027-02-14',
  location: 'Udaipur',
  totalBudget: 2500000,
  ...extra,
});

describe('creating an organization', () => {
  it('makes the caller the owner on a trial, once', async () => {
    const user = await createUser();
    const res = await request(app).post(api('/orgs')).set(bearer(user)).send({ name: 'Sharma Events', city: 'Jaipur' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: 'Sharma Events', planKey: 'org_trial', planStatus: 'trial', me: { role: 'owner' } });

    const member = await OrgMember.findOne({ userId: user._id });
    expect(member).toMatchObject({ role: 'owner', status: 'active' });

    const again = await request(app).post(api('/orgs')).set(bearer(user)).send({ name: 'Second Agency' });
    expect(again.status).toBe(409);

    const mine = await request(app).get(api('/orgs/mine')).set(bearer(user));
    expect(mine.body.data).toHaveLength(1);
  });
});

describe('cross-tenant isolation (exit gate)', () => {
  it('agency B can\'t see or touch anything of agency A', async () => {
    const { orgA, weddingA1, users } = await twoAgencies();
    const b = bearer(users.ownerB);

    expect((await request(app).get(api(`/weddings/${weddingA1._id}`)).set(b)).status).toBe(403);
    expect((await request(app).post(api(`/weddings/${weddingA1._id}/guests`)).set(b).send({})).status).toBe(403);
    expect((await request(app).get(api(`/orgs/${orgA._id}`)).set(b)).status).toBe(404);
    expect((await request(app).get(api(`/orgs/${orgA._id}/weddings`)).set(b)).status).toBe(404);
    expect((await request(app).get(api(`/orgs/${orgA._id}/members`)).set(b)).status).toBe(404);
    expect((await request(app).get(api(`/orgs/${orgA._id}/billing`)).set(b)).status).toBe(404);
    expect((await request(app).patch(api(`/orgs/${orgA._id}/weddings/${weddingA1._id}/archive`)).set(b).send({ archived: true })).status).toBe(404);
    // …and can't create a wedding inside agency A either.
    expect((await request(app).post(api('/weddings')).set(b).send(weddingBody({ organizationId: String(orgA._id) }))).status).toBe(404);
  });

  it('can\'t act on agency B\'s wedding through agency A\'s routes', async () => {
    const { orgA, weddingB1, users } = await twoAgencies();
    const a = bearer(users.ownerA);
    expect((await request(app).patch(api(`/orgs/${orgA._id}/weddings/${weddingB1._id}/archive`)).set(a).send({ archived: true })).status).toBe(404);
    expect((await request(app).patch(api(`/orgs/${orgA._id}/weddings/${weddingB1._id}/assignees`)).set(a).send({ assignees: [] })).status).toBe(404);
  });

  it('owner and manager see every org wedding; a coordinator only assigned ones', async () => {
    const { orgA, weddingA1, weddingA2, users } = await twoAgencies();

    for (const u of [users.ownerA, users.managerA]) {
      expect((await request(app).get(api(`/weddings/${weddingA2._id}`)).set(bearer(u))).status).toBe(200);
    }
    expect((await request(app).get(api(`/weddings/${weddingA1._id}`)).set(bearer(users.coordA))).status).toBe(200);
    expect((await request(app).get(api(`/weddings/${weddingA2._id}`)).set(bearer(users.coordA))).status).toBe(403);
    expect((await request(app).get(api(`/weddings/${weddingA1._id}`)).set(bearer(users.coord2A))).status).toBe(403);

    const portfolio = await request(app).get(api(`/orgs/${orgA._id}/weddings`)).set(bearer(users.coordA));
    expect(portfolio.body.data.map((w: any) => w._id)).toEqual([String(weddingA1._id)]);

    const all = await request(app).get(api(`/orgs/${orgA._id}/weddings`)).set(bearer(users.managerA));
    expect(all.body.data).toHaveLength(2);
  });

  it('a disabled member loses access immediately, even to weddings they created', async () => {
    const { orgA, users } = await twoAgencies();
    const created = await request(app)
      .post(api('/weddings'))
      .set(bearer(users.managerA))
      .send(weddingBody({ organizationId: String(orgA._id) }));
    expect(created.status).toBe(201);
    const weddingId = created.body.data._id;
    expect((await request(app).get(api(`/weddings/${weddingId}`)).set(bearer(users.managerA))).status).toBe(200);

    await OrgMember.updateOne({ organizationId: orgA._id, userId: users.managerA._id }, { status: 'disabled' });
    expect((await request(app).get(api(`/weddings/${weddingId}`)).set(bearer(users.managerA))).status).toBe(403);
    expect((await request(app).get(api(`/orgs/${orgA._id}`)).set(bearer(users.managerA))).status).toBe(404);
  });

  it('a suspended agency locks its staff out', async () => {
    const { orgA, weddingA1, users } = await twoAgencies();
    await Organization.updateOne({ _id: orgA._id }, { status: 'suspended' });
    expect((await request(app).get(api(`/weddings/${weddingA1._id}`)).set(bearer(users.ownerA))).status).toBe(403);
    expect((await request(app).get(api(`/orgs/${orgA._id}`)).set(bearer(users.ownerA))).status).toBe(404);
  });
});

describe('org wedding permissions', () => {
  it('maps org roles onto wedding permissions', async () => {
    const { weddingA1, users } = await twoAgencies();

    const coord = await request(app).get(api(`/weddings/${weddingA1._id}/access`)).set(bearer(users.coordA));
    expect(coord.body.data.kind).toBe('org');
    expect(coord.body.data.org.role).toBe('coordinator');
    expect(coord.body.data.permissions).toEqual(expect.arrayContaining(['guests.manage', 'tasks.manage']));
    expect(coord.body.data.permissions).not.toContain('budget.manage');
    expect(coord.body.data.permissions).not.toContain('wedding.delete');
    expect(coord.body.data.permissions).not.toContain('collaborators.manage');

    // Gates follow: coordinator may add guests but not invite the family or delete the wedding.
    const guest = await request(app).post(api(`/weddings/${weddingA1._id}/guests`)).set(bearer(users.coordA)).send({});
    expect([401, 403]).not.toContain(guest.status);
    expect((await request(app).post(api(`/weddings/${weddingA1._id}/collaborators/invite`)).set(bearer(users.coordA)).send({})).status).toBe(403);
    expect((await request(app).delete(api(`/weddings/${weddingA1._id}`)).set(bearer(users.coordA))).status).toBe(403);
    // Managers can't delete weddings either; only the owner.
    expect((await request(app).delete(api(`/weddings/${weddingA1._id}`)).set(bearer(users.managerA))).status).toBe(403);
  });

  it('per-staff overrides grant and revoke on top of the role', async () => {
    const { orgA, weddingA1, users } = await twoAgencies();
    await OrgMember.updateOne(
      { organizationId: orgA._id, userId: users.coordA._id },
      { permissionOverrides: { grant: ['budget.manage', 'budget.view'], revoke: ['guests.manage'] } }
    );
    const access = await request(app).get(api(`/weddings/${weddingA1._id}/access`)).set(bearer(users.coordA));
    expect(access.body.data.permissions).toContain('budget.manage');
    expect(access.body.data.permissions).not.toContain('guests.manage');
    expect((await request(app).post(api(`/weddings/${weddingA1._id}/guests`)).set(bearer(users.coordA)).send({})).status).toBe(403);

    const portfolio = await request(app).get(api(`/orgs/${orgA._id}/weddings`)).set(bearer(users.coordA));
    expect(portfolio.body.data[0].stats.budget).not.toBeNull();
  });

  it('hides budget numbers in the portfolio without budget.view', async () => {
    const { orgA, users } = await twoAgencies();
    const res = await request(app).get(api(`/orgs/${orgA._id}/weddings`)).set(bearer(users.coordA));
    expect(res.body.data[0].stats.budget).toBeNull();
  });
});

describe('client families on agency weddings', () => {
  it('reach the wedding as clients, and see it on their own dashboard with the agency name', async () => {
    const { orgA, weddingA1, users } = await twoAgencies();
    const access = await request(app).get(api(`/weddings/${weddingA1._id}/access`)).set(bearer(users.clientA));
    expect(access.body.data).toMatchObject({ kind: 'client', role: 'editor', org: { name: orgA.name } });

    const list = await request(app).get(api('/weddings')).set(bearer(users.clientA));
    const card = list.body.data.find((w: any) => w._id === String(weddingA1._id));
    expect(card.organization).toMatchObject({ name: orgA.name });

    // The client can't use any org route.
    expect((await request(app).get(api(`/orgs/${orgA._id}/weddings`)).set(bearer(users.clientA))).status).toBe(404);
  });

  it('org weddings stay out of the staff member\'s personal wedding list', async () => {
    const { weddingA1, users } = await twoAgencies();
    const personal = await createWedding(users.ownerA._id);
    const list = await request(app).get(api('/weddings')).set(bearer(users.ownerA));
    const ids = list.body.data.map((w: any) => w._id);
    expect(ids).toContain(String(personal._id));
    expect(ids).not.toContain(String(weddingA1._id));
  });
});

describe('creating client weddings', () => {
  it('stamps the org, defaults the creator as lead, and enforces the active-wedding limit', async () => {
    const owner = await createUser();
    const org = await createOrg(owner, { limitsSnapshot: { ...ORG_PLANS.org_trial.limits, activeWeddings: 1 } });

    const first = await request(app)
      .post(api('/weddings'))
      .set(bearer(owner))
      .send(weddingBody({ organizationId: String(org._id), clientContact: { name: 'Mrs Mehta', phone: '9999999999' } }));
    expect(first.status).toBe(201);
    const saved = await Wedding.findById(first.body.data._id).orFail();
    expect(String(saved.organizationId)).toBe(String(org._id));
    expect(saved.orgAssignees).toHaveLength(1);
    expect(saved.orgAssignees![0]).toMatchObject({ isLead: true });
    expect(saved.clientContact?.name).toBe('Mrs Mehta');

    const second = await request(app).post(api('/weddings')).set(bearer(owner)).send(weddingBody({ organizationId: String(org._id) }));
    expect(second.status).toBe(403);
    expect(second.body.errors).toMatchObject({ code: 'ORG_LIMIT', resource: 'activeWeddings' });

    // Archiving frees the slot.
    await request(app).patch(api(`/orgs/${org._id}/weddings/${saved._id}/archive`)).set(bearer(owner)).send({ archived: true });
    expect((await request(app).post(api('/weddings')).set(bearer(owner)).send(weddingBody({ organizationId: String(org._id) }))).status).toBe(201);
  });

  it('coordinators can\'t create weddings; assignees must be on the team', async () => {
    const { orgA, users } = await twoAgencies();
    expect(
      (await request(app).post(api('/weddings')).set(bearer(users.coordA)).send(weddingBody({ organizationId: String(orgA._id) }))).status
    ).toBe(403);

    const res = await request(app)
      .post(api('/weddings'))
      .set(bearer(users.ownerA))
      .send(weddingBody({ organizationId: String(orgA._id), assignees: [{ userId: String(users.ownerB._id), isLead: true }] }));
    expect(res.status).toBe(400);
  });
});

describe('team management', () => {
  it('invites by email; only the matching account can accept', async () => {
    const owner = await createUser();
    const org = await createOrg(owner);
    const invitee = await createUser({ email: 'newhire@agency.in' });
    const someoneElse = await createUser();

    const inv = await request(app)
      .post(api(`/orgs/${org._id}/members`))
      .set(bearer(owner))
      .send({ email: 'NewHire@agency.in', role: 'coordinator' });
    expect(inv.status).toBe(201);
    const token = inv.body.data.inviteLink.split('/').pop();

    const preview = await request(app).get(api(`/orgs/invites/token/${token}`)).set(bearer(someoneElse));
    expect(preview.body.data).toMatchObject({ email: 'newhire@agency.in', role: 'coordinator' });

    const wrong = await request(app).post(api(`/orgs/invites/token/${token}/accept`)).set(bearer(someoneElse));
    expect(wrong.status).toBe(403);

    const mine = await request(app).get(api('/orgs/invites/mine')).set(bearer(invitee));
    expect(mine.body.data).toHaveLength(1);

    const ok = await request(app).post(api(`/orgs/invites/token/${token}/accept`)).set(bearer(invitee));
    expect(ok.status).toBe(200);
    expect(await OrgMember.findOne({ organizationId: org._id, userId: invitee._id })).toMatchObject({ status: 'active', role: 'coordinator' });

    // Token is single-use.
    expect((await request(app).post(api(`/orgs/invites/token/${token}/accept`)).set(bearer(invitee))).status).toBe(404);
  });

  it('enforces the seat limit', async () => {
    const owner = await createUser();
    const org = await createOrg(owner, { limitsSnapshot: { ...ORG_PLANS.org_starter.limits, seats: 2 } });
    expect((await request(app).post(api(`/orgs/${org._id}/members`)).set(bearer(owner)).send({ email: 'a@x.in', role: 'coordinator' })).status).toBe(201);
    const full = await request(app).post(api(`/orgs/${org._id}/members`)).set(bearer(owner)).send({ email: 'b@x.in', role: 'coordinator' });
    expect(full.status).toBe(403);
    expect(full.body.errors).toMatchObject({ code: 'ORG_LIMIT', resource: 'seats' });
  });

  it('managers manage coordinators only, and can\'t grant what they don\'t have', async () => {
    const { orgA, users } = await twoAgencies();
    const m = bearer(users.managerA);

    expect((await request(app).post(api(`/orgs/${orgA._id}/members`)).set(m).send({ email: 'c@x.in', role: 'coordinator' })).status).toBe(201);
    expect((await request(app).post(api(`/orgs/${orgA._id}/members`)).set(m).send({ email: 'm@x.in', role: 'manager' })).status).toBe(403);
    expect(
      (await request(app).post(api(`/orgs/${orgA._id}/members`)).set(m).send({ email: 'd@x.in', role: 'coordinator', grant: ['org.billing'] })).status
    ).toBe(403);

    const ownerRow = await OrgMember.findOne({ organizationId: orgA._id, role: 'owner' }).orFail();
    expect((await request(app).delete(api(`/orgs/${orgA._id}/members/${ownerRow._id}`)).set(m)).status).toBe(403);

    // Coordinators can't manage the team at all.
    expect((await request(app).post(api(`/orgs/${orgA._id}/members`)).set(bearer(users.coordA)).send({ email: 'e@x.in', role: 'coordinator' })).status).toBe(403);
  });

  it('removing a member unassigns them from weddings', async () => {
    const { orgA, weddingA1, users } = await twoAgencies();
    const row = await OrgMember.findOne({ organizationId: orgA._id, userId: users.coordA._id }).orFail();
    expect((await request(app).delete(api(`/orgs/${orgA._id}/members/${row._id}`)).set(bearer(users.ownerA))).status).toBe(200);
    const w = await Wedding.findById(weddingA1._id).orFail();
    expect(w.orgAssignees!.map((a) => String(a.userId))).not.toContain(String(users.coordA._id));
  });
});

describe('plan state', () => {
  it('a paused agency is read-only for staff and clients, but still viewable', async () => {
    const { orgA, weddingA1, users } = await twoAgencies();
    await Organization.updateOne({ _id: orgA._id }, { planStatus: 'paused' });

    expect((await request(app).get(api(`/weddings/${weddingA1._id}`)).set(bearer(users.ownerA))).status).toBe(200);
    expect((await request(app).post(api(`/weddings/${weddingA1._id}/guests`)).set(bearer(users.ownerA)).send({})).status).toBe(403);
    expect((await request(app).post(api(`/weddings/${weddingA1._id}/guests`)).set(bearer(users.clientA)).send({})).status).toBe(403);

    const invite = await request(app).post(api(`/orgs/${orgA._id}/members`)).set(bearer(users.ownerA)).send({ email: 'z@x.in', role: 'coordinator' });
    expect(invite.status).toBe(403);
    expect(invite.body.errors).toMatchObject({ code: 'ORG_READ_ONLY', reason: 'paused' });

    expect((await request(app).get(api(`/orgs/${orgA._id}/billing`)).set(bearer(users.ownerA))).status).toBe(200);
  });

  it('a trial past its grace period goes read-only', async () => {
    const owner = await createUser();
    const org = await createOrg(owner, { planKey: 'org_trial', planStatus: 'trial', trialEndsAt: new Date(Date.now() - 30 * 86400000) });
    const res = await request(app).get(api(`/orgs/${org._id}`)).set(bearer(owner));
    expect(res.body.data.readOnly).toBe('trial_ended');
  });
});

describe('billing and admin', () => {
  it('owner requests a plan; an admin records the payment and activates it', async () => {
    const owner = await createUser();
    const admin = await createUser({ role: 'admin' });
    const org = await createOrg(owner, { planKey: 'org_trial', planStatus: 'trial', trialEndsAt: new Date(Date.now() + 86400000), limitsSnapshot: ORG_PLANS.org_trial.limits });

    expect((await request(app).post(api(`/orgs/${org._id}/billing/request`)).set(bearer(owner)).send({ planKey: 'org_founding', billingPeriod: 'monthly' })).status).toBe(400);
    expect((await request(app).post(api(`/orgs/${org._id}/billing/request`)).set(bearer(owner)).send({ planKey: 'org_growth', billingPeriod: 'annual' })).status).toBe(200);

    expect((await request(app).get(api('/orgs/admin/list')).set(bearer(owner))).status).toBe(403);
    const list = await request(app).get(api('/orgs/admin/list?requests=1')).set(bearer(admin));
    expect(list.body.data.map((o: any) => o.id)).toContain(String(org._id));

    const set = await request(app)
      .patch(api(`/orgs/admin/${org._id}/plan`))
      .set(bearer(admin))
      .send({ planKey: 'org_growth', billingPeriod: 'annual', amount: 29990, method: 'upi', reference: 'UTR123' });
    expect(set.status).toBe(200);
    const fresh = await Organization.findById(org._id).orFail();
    expect(fresh).toMatchObject({ planKey: 'org_growth', planStatus: 'active', billingRequest: null });
    expect(fresh.limitsSnapshot.activeWeddings).toBe(20);

    const billing = await request(app).get(api(`/orgs/${org._id}/billing`)).set(bearer(owner));
    expect(billing.body.data.payments).toHaveLength(1);
  });

  it('admin can set up an agency for someone without an account; they become owner on accept', async () => {
    const admin = await createUser({ role: 'admin' });
    const res = await request(app).post(api('/orgs/admin')).set(bearer(admin)).send({ name: 'Rathore Weddings', ownerEmail: 'rathore@agency.in' });
    expect(res.status).toBe(201);
    const token = res.body.data.inviteLink.split('/').pop();

    const owner = await createUser({ email: 'rathore@agency.in' });
    expect((await request(app).post(api(`/orgs/invites/token/${token}/accept`)).set(bearer(owner))).status).toBe(200);
    const org = await Organization.findById(res.body.data.org.id).orFail();
    expect(String(org.ownerId)).toBe(String(owner._id));
  });
});

describe('handing a wedding over to the family', () => {
  it('makes the chosen client the owner and removes the agency', async () => {
    const { orgA, weddingA1, users } = await twoAgencies();
    expect(
      (await request(app).post(api(`/orgs/${orgA._id}/weddings/${weddingA1._id}/transfer-to-client`)).set(bearer(users.managerA)).send({ clientUserId: String(users.clientA._id) })).status
    ).toBe(403);

    const res = await request(app)
      .post(api(`/orgs/${orgA._id}/weddings/${weddingA1._id}/transfer-to-client`))
      .set(bearer(users.ownerA))
      .send({ clientUserId: String(users.clientA._id) });
    expect(res.status).toBe(200);

    const access = await request(app).get(api(`/weddings/${weddingA1._id}/access`)).set(bearer(users.clientA));
    expect(access.body.data.kind).toBe('owner');
    expect((await request(app).get(api(`/weddings/${weddingA1._id}`)).set(bearer(users.coordA))).status).toBe(403);
  });
});

describe('concierge migration', () => {
  it('moves a pilot planner\'s collaborator weddings into a new org', async () => {
    const planner = await createUser({ email: 'pilot@planner.in' });
    const staff = await createUser({ email: 'staff@planner.in' });
    const family = await createUser();
    const wedding = await createWedding(family._id);
    await addCollaborator(wedding._id, planner._id, 'admin');
    await addCollaborator(wedding._id, staff._id, 'editor');

    const dry = await migrateConciergePlanner({ plannerEmail: 'pilot@planner.in', orgName: 'Pilot Events', staff: [{ email: 'staff@planner.in', role: 'coordinator' }], dryRun: true });
    expect(dry.weddingsMoved).toBe(0);
    expect(await Organization.countDocuments()).toBe(0);

    const result = await migrateConciergePlanner({ plannerEmail: 'pilot@planner.in', orgName: 'Pilot Events', staff: [{ email: 'staff@planner.in', role: 'coordinator' }] });
    expect(result.weddingsMoved).toBe(1);

    const access = async (u: any) => (await request(app).get(api(`/weddings/${wedding._id}/access`)).set(bearer(u))).body.data;
    expect((await access(planner)).kind).toBe('org');
    expect((await access(staff))).toMatchObject({ kind: 'org', org: { role: 'coordinator' } });
    expect((await access(family))).toMatchObject({ kind: 'client', role: 'admin' });
    expect(await Collaborator.countDocuments({ weddingId: wedding._id })).toBe(1);

    // Idempotent.
    expect((await migrateConciergePlanner({ plannerEmail: 'pilot@planner.in', orgName: 'Pilot Events' })).weddingsMoved).toBe(0);
  });
});

