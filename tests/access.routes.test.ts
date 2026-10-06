import request from 'supertest';
import mongoose from 'mongoose';
import { useTestDatabase } from './helpers/db';
import { buildApp, bearer, createUser } from './helpers/app';
import { familyWeddingScenario, createWedding } from './helpers/fixtures';
import { Task } from '../src/models/task.model';
import { Comment } from '../src/models/comment.model';
import { Collaborator } from '../src/models/collaborator.model';

useTestDatabase();
const app = buildApp();

/**
 * Track A regression matrix: the permission rewrite (requirePermission +
 * access.service) must keep exactly the old viewer < editor < admin < owner
 * gates on family weddings. "Allowed" means the request got past the gate
 * (anything but 401/403) — validation or business errors after it are fine.
 */
type Role = 'viewer' | 'editor' | 'admin' | 'owner';
const RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };
const ROLES: Role[] = ['viewer', 'editor', 'admin', 'owner'];

const fakeId = () => String(new mongoose.Types.ObjectId());

const ROUTES: { name: string; min: Role; call: (id: string) => { method: 'get' | 'put' | 'post' | 'delete'; path: string; body?: object } }[] = [
  { name: 'GET wedding', min: 'viewer', call: (id) => ({ method: 'get', path: `/weddings/${id}` }) },
  { name: 'GET guests', min: 'viewer', call: (id) => ({ method: 'get', path: `/weddings/${id}/guests` }) },
  { name: 'GET tasks', min: 'viewer', call: (id) => ({ method: 'get', path: `/weddings/${id}/tasks` }) },
  { name: 'GET vendors', min: 'viewer', call: (id) => ({ method: 'get', path: `/weddings/${id}/vendors` }) },
  { name: 'GET budget', min: 'viewer', call: (id) => ({ method: 'get', path: `/weddings/${id}/budget` }) },
  { name: 'GET events', min: 'viewer', call: (id) => ({ method: 'get', path: `/weddings/${id}/events` }) },
  { name: 'GET activities', min: 'viewer', call: (id) => ({ method: 'get', path: `/weddings/${id}/activities` }) },
  { name: 'GET gifts', min: 'viewer', call: (id) => ({ method: 'get', path: `/weddings/${id}/gifts` }) },
  { name: 'GET stats', min: 'viewer', call: (id) => ({ method: 'get', path: `/weddings/${id}/stats` }) },
  { name: 'GET search', min: 'viewer', call: (id) => ({ method: 'get', path: `/weddings/${id}/search?q=a` }) },
  { name: 'complete task', min: 'viewer', call: (id) => ({ method: 'post', path: `/weddings/${id}/tasks/${fakeId()}/complete`, body: {} }) },
  { name: 'PUT wedding', min: 'editor', call: (id) => ({ method: 'put', path: `/weddings/${id}`, body: { description: 'x' } }) },
  { name: 'POST guest', min: 'editor', call: (id) => ({ method: 'post', path: `/weddings/${id}/guests`, body: {} }) },
  { name: 'POST budget', min: 'editor', call: (id) => ({ method: 'post', path: `/weddings/${id}/budget`, body: {} }) },
  { name: 'POST vendor', min: 'editor', call: (id) => ({ method: 'post', path: `/weddings/${id}/vendors`, body: {} }) },
  { name: 'POST task', min: 'editor', call: (id) => ({ method: 'post', path: `/weddings/${id}/tasks`, body: {} }) },
  { name: 'POST note', min: 'editor', call: (id) => ({ method: 'post', path: `/weddings/${id}/notes`, body: {} }) },
  { name: 'assign task', min: 'admin', call: (id) => ({ method: 'post', path: `/weddings/${id}/tasks/${fakeId()}/assign`, body: {} }) },
  { name: 'invite collaborator', min: 'admin', call: (id) => ({ method: 'post', path: `/weddings/${id}/collaborators/invite`, body: {} }) },
  { name: 'public settings', min: 'admin', call: (id) => ({ method: 'put', path: `/weddings/${id}/public-settings`, body: {} }) },
  { name: 'DELETE wedding', min: 'admin', call: (id) => ({ method: 'delete', path: `/weddings/${id}` }) },
];

const send = (user: { _id: unknown }, spec: ReturnType<(typeof ROUTES)[number]['call']>) => {
  const req = request(app)[spec.method](`/api/v1${spec.path}`).set(bearer(user));
  return spec.body ? req.send(spec.body) : req;
};

describe('family wedding permission gates (regression)', () => {
  for (const route of ROUTES) {
    for (const role of ROLES) {
      const allowed = RANK[role] >= RANK[route.min];
      it(`${route.name}: ${role} is ${allowed ? 'allowed' : 'forbidden'}`, async () => {
        const { wedding, users } = await familyWeddingScenario();
        const res = await send(users[role], route.call(String(wedding._id)));
        if (allowed) expect([401, 403]).not.toContain(res.status);
        else expect(res.status).toBe(403);
      });
    }

    it(`${route.name}: strangers and pending invitees are forbidden`, async () => {
      const { wedding, users } = await familyWeddingScenario();
      const spec = route.call(String(wedding._id));
      expect((await send(users.stranger, spec)).status).toBe(403);
      expect((await send(users.pending, spec)).status).toBe(403);
    });
  }

  it('rejects requests without a token', async () => {
    const { wedding } = await familyWeddingScenario();
    const res = await request(app).get(`/api/v1/weddings/${wedding._id}`);
    expect(res.status).toBe(401);
  });

  it('404s an unknown wedding', async () => {
    const { users } = await familyWeddingScenario();
    const res = await request(app).get(`/api/v1/weddings/${fakeId()}`).set(bearer(users.owner));
    expect(res.status).toBe(404);
  });
});

describe('task status: assignee override', () => {
  it('lets an assigned viewer update the status, but not an unassigned viewer', async () => {
    const { wedding, users } = await familyWeddingScenario();
    const other = await createUser();
    await Collaborator.create({ weddingId: wedding._id, userId: other._id, role: 'viewer', invitationStatus: 'accepted' });

    const task = await Task.create({
      weddingId: wedding._id,
      title: 'Book DJ',
      category: 'music',
      createdBy: users.owner._id,
      assignedTo: [users.viewer._id],
    });
    const path = `/api/v1/weddings/${wedding._id}/tasks/${task._id}/status`;

    const assigned = await request(app).patch(path).set(bearer(users.viewer)).send({ status: 'in-progress' });
    expect([401, 403]).not.toContain(assigned.status);

    const unassigned = await request(app).patch(path).set(bearer(other)).send({ status: 'in-progress' });
    expect(unassigned.status).toBe(403);
  });
});

describe('comment moderation', () => {
  it('lets admins delete other people\'s comments, but not editors', async () => {
    const { wedding, users } = await familyWeddingScenario();
    const make = () =>
      Comment.create({
        weddingId: wedding._id,
        entityType: 'task',
        entityId: new mongoose.Types.ObjectId(),
        authorId: users.viewer._id,
        content: 'hello',
      });

    const c1 = await make();
    const byEditor = await request(app).delete(`/api/v1/weddings/${wedding._id}/comments/${c1._id}`).set(bearer(users.editor));
    expect(byEditor.status).toBe(403);

    const byAdmin = await request(app).delete(`/api/v1/weddings/${wedding._id}/comments/${c1._id}`).set(bearer(users.admin));
    expect([401, 403]).not.toContain(byAdmin.status);
  });
});

describe('GET /weddings/:weddingId/access', () => {
  it('returns kind, role and permissions for the caller', async () => {
    const { wedding, users } = await familyWeddingScenario();

    const owner = await request(app).get(`/api/v1/weddings/${wedding._id}/access`).set(bearer(users.owner));
    expect(owner.status).toBe(200);
    expect(owner.body.data).toMatchObject({ kind: 'owner', role: 'admin' });
    expect(owner.body.data.permissions).toContain('wedding.delete');

    const viewer = await request(app).get(`/api/v1/weddings/${wedding._id}/access`).set(bearer(users.viewer));
    expect(viewer.body.data).toMatchObject({ kind: 'collaborator', role: 'viewer' });
    expect(viewer.body.data.permissions).toContain('budget.view');
    expect(viewer.body.data.permissions).not.toContain('guests.manage');
  });
});

describe('PUT /weddings/invite/:inviteId', () => {
  it('only the invitee can answer their invite', async () => {
    const owner = await createUser();
    const invitee = await createUser();
    const attacker = await createUser();
    const wedding = await createWedding(owner._id);
    const invite = await Collaborator.create({
      weddingId: wedding._id,
      userId: invitee._id,
      role: 'editor',
      invitationStatus: 'pending',
    });
    const path = `/api/v1/weddings/invite/${invite._id}`;

    const hijack = await request(app).put(path).set(bearer(attacker)).send({ status: 'accepted' });
    expect(hijack.status).toBe(404);
    expect((await Collaborator.findById(invite._id))!.invitationStatus).toBe('pending');

    const bad = await request(app).put(path).set(bearer(invitee)).send({ status: 'whatever' });
    expect(bad.status).toBe(400);

    const ok = await request(app).put(path).set(bearer(invitee)).send({ status: 'accepted' });
    expect(ok.status).toBe(200);
    expect((await Collaborator.findById(invite._id))!.invitationStatus).toBe('accepted');
  });
});
