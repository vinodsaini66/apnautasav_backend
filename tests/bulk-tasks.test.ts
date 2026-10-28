import request from 'supertest';
import { useTestDatabase } from './helpers/db';
import { buildApp, bearer, createUser } from './helpers/app';
import { addCollaborator, createWedding } from './helpers/fixtures';
import { Task } from '../src/models/task.model';

useTestDatabase();
const app = buildApp();

describe('POST /weddings/:id/tasks/bulk', () => {
  it('adds many tasks at once, keeping done items done', async () => {
    const owner = await createUser();
    const wedding = await createWedding(owner._id);
    const res = await request(app)
      .post(`/api/v1/weddings/${wedding._id}/tasks/bulk`)
      .set(bearer(owner))
      .send({
        source: 'the checklist generator',
        tasks: [
          { title: 'Book the venue', category: 'venue', priority: 'high', dueDate: '2026-12-01' },
          { title: 'Shortlist photographers', category: 'photography', status: 'completed' },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ createdCount: 2, skippedCount: 0 });
    const tasks = await Task.find({ weddingId: wedding._id }).sort({ title: 1 });
    expect(tasks.map((t) => [t.title, t.status])).toEqual([
      ['Book the venue', 'pending'],
      ['Shortlist photographers', 'completed'],
    ]);
    expect(tasks[1].completedAt).toBeTruthy();
  });

  it('needs tasks.manage and valid rows', async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const wedding = await createWedding(owner._id);
    await addCollaborator(wedding._id, viewer._id, 'viewer');
    const body = { tasks: [{ title: 'Book the venue', category: 'venue' }] };
    expect((await request(app).post(`/api/v1/weddings/${wedding._id}/tasks/bulk`).set(bearer(viewer)).send(body)).status).toBe(403);
    expect((await request(app).post(`/api/v1/weddings/${wedding._id}/tasks/bulk`).set(bearer(owner)).send({ tasks: [] })).status).toBe(400);
    expect((await request(app).post(`/api/v1/weddings/${wedding._id}/tasks/bulk`).set(bearer(owner)).send({ tasks: [{ title: 'x', category: 'nope' }] })).status).toBe(400);
  });
});
