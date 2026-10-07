import mongoose from 'mongoose';
import { useTestDatabase } from './helpers/db';
import { familyWeddingScenario } from './helpers/fixtures';
import { resolveWeddingAccess } from '../src/services/access.service';
import { WEDDING_PERMISSIONS } from '../src/constants/permissions';

useTestDatabase();

describe('resolveWeddingAccess — family weddings', () => {
  it('gives the creator every permission', async () => {
    const { wedding, users } = await familyWeddingScenario();
    const result = await resolveWeddingAccess(String(users.owner._id), String(wedding._id));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.access.kind).toBe('owner');
    expect(result.access.role).toBe('admin');
    expect([...result.access.permissions].sort()).toEqual([...WEDDING_PERMISSIONS].sort());
  });

  it('maps each collaborator role to its permission set', async () => {
    const { wedding, users } = await familyWeddingScenario();
    const id = String(wedding._id);

    const admin = await resolveWeddingAccess(String(users.admin._id), id);
    const editor = await resolveWeddingAccess(String(users.editor._id), id);
    const viewer = await resolveWeddingAccess(String(users.viewer._id), id);

    expect(admin.ok && admin.access.permissions.has('wedding.delete')).toBe(true);
    expect(admin.ok && admin.access.permissions.has('collaborators.manage')).toBe(true);

    expect(editor.ok && editor.access.kind).toBe('collaborator');
    expect(editor.ok && editor.access.permissions.has('guests.manage')).toBe(true);
    expect(editor.ok && editor.access.permissions.has('budget.manage')).toBe(true);
    expect(editor.ok && editor.access.permissions.has('wedding.delete')).toBe(false);
    expect(editor.ok && editor.access.permissions.has('tasks.assign')).toBe(false);

    // Viewers read every section and can tick off tasks, but change nothing.
    expect(viewer.ok).toBe(true);
    const viewerPerms = viewer.ok ? [...viewer.access.permissions] : [];
    expect(viewerPerms).toEqual(expect.arrayContaining(['guests.view', 'budget.view', 'vendors.details', 'tasks.complete']));
    expect(viewerPerms.filter((p) => p.endsWith('.manage'))).toEqual([]);
  });

  it('denies pending invitees and strangers', async () => {
    const { wedding, users } = await familyWeddingScenario();
    const id = String(wedding._id);

    expect(await resolveWeddingAccess(String(users.pending._id), id)).toEqual({ ok: false, status: 403 });
    expect(await resolveWeddingAccess(String(users.stranger._id), id)).toEqual({ ok: false, status: 403 });
  });

  it('returns 404 for a missing or malformed wedding id', async () => {
    const { users } = await familyWeddingScenario();
    const userId = String(users.owner._id);

    expect(await resolveWeddingAccess(userId, String(new mongoose.Types.ObjectId()))).toEqual({ ok: false, status: 404 });
    expect(await resolveWeddingAccess(userId, 'not-an-id')).toEqual({ ok: false, status: 404 });
  });
});
