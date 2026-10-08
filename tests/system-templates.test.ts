import request from 'supertest';
import { useTestDatabase } from './helpers/db';
import { buildApp, bearer, createUser } from './helpers/app';
import { createWedding } from './helpers/fixtures';
import { TaskTemplate } from '../src/models/task-template.model';
import { Task } from '../src/models/task.model';
import { WeddingEvent } from '../src/models/event.model';
import { syncSystemTaskTemplates } from '../src/services/system-templates.service';
import { SYSTEM_TASK_TEMPLATES } from '../src/constants/task-templates';

useTestDatabase();
const app = buildApp();
const DAY = 24 * 60 * 60 * 1000;

describe('global checklist templates', () => {
  it('syncs one template per wedding function, idempotently, and lists them in order', async () => {
    await syncSystemTaskTemplates();
    await syncSystemTaskTemplates();
    expect(await TaskTemplate.countDocuments({ isSystemTemplate: true })).toBe(SYSTEM_TASK_TEMPLATES.length);

    const user = await createUser();
    const res = await request(app).get('/api/v1/task-templates').set(bearer(user));
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { key: string }) => t.key)).toEqual([
      'standard-indian-wedding',
      'mehendi-ceremony',
      'haldi-ceremony',
      'sangeet-night',
      'wedding-ceremony',
      'reception-party',
    ]);
  });

  it('updates an existing system template in place (no duplicate)', async () => {
    await TaskTemplate.create({ key: 'mehendi-ceremony', name: 'Old name', isSystemTemplate: true, items: [{ title: 'x', category: 'others', priority: 'low', dueOffsetDays: -1 }] });
    await syncSystemTaskTemplates();
    const rows = await TaskTemplate.find({ key: 'mehendi-ceremony' });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Mehendi Checklist');
    expect(rows[0].items.length).toBeGreaterThan(1);
  });

  it("counts a function checklist back from that function's date, else the wedding date", async () => {
    await syncSystemTaskTemplates();
    const owner = await createUser();
    const wedding = await createWedding(owner._id);
    const haldi = await WeddingEvent.create({
      weddingId: wedding._id,
      eventType: 'haldi',
      title: 'Haldi',
      startDateTime: new Date(wedding.weddingDate.getTime() - 2 * DAY),
      createdBy: owner._id,
    });
    const template = await TaskTemplate.findOne({ key: 'haldi-ceremony' }).orFail();
    const res = await request(app).post(`/api/v1/weddings/${wedding._id}/tasks/apply-template/${template._id}`).set(bearer(owner));
    expect(res.status).toBe(201);

    const tasks = await Task.find({ weddingId: wedding._id });
    expect(tasks).toHaveLength(template.items.length);
    const muhurat = tasks.find((t) => t.title.startsWith('Fix the haldi muhurat'))!;
    expect(muhurat.dueDate!.getTime()).toBe(haldi.startDateTime!.getTime() - 30 * DAY);
    expect(String(muhurat.eventId)).toBe(String(haldi._id));

    // No Sangeet on this wedding yet: falls back to the wedding date.
    const sangeet = await TaskTemplate.findOne({ key: 'sangeet-night' }).orFail();
    await request(app).post(`/api/v1/weddings/${wedding._id}/tasks/apply-template/${sangeet._id}`).set(bearer(owner));
    const venue = await Task.findOne({ weddingId: wedding._id, title: 'Book sangeet venue or banquet hall' }).orFail();
    expect(venue.dueDate!.getTime()).toBe(wedding.weddingDate.getTime() - 60 * DAY);
  });
});
