import { Wedding } from '../../src/models/wedding.model';
import { Collaborator } from '../../src/models/collaborator.model';
import { createUser } from './app';

let codeCounter = 0;

export const createWedding = async (createdBy: unknown) => {
  codeCounter += 1;
  return Wedding.create({
    name: `Test Wedding ${codeCounter}`,
    weddingCode: `T${String(codeCounter).padStart(5, '0')}`,
    brideName: 'Priya',
    groomName: 'Rahul',
    weddingDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    location: 'Jaipur',
    totalBudget: 1000000,
    createdBy,
  });
};

export const addCollaborator = (
  weddingId: unknown,
  userId: unknown,
  role: 'admin' | 'editor' | 'viewer',
  invitationStatus: 'pending' | 'accepted' | 'rejected' = 'accepted'
) => Collaborator.create({ weddingId, userId, role, invitationStatus });

/** One wedding with a user in every family-side position. */
export const familyWeddingScenario = async () => {
  const owner = await createUser({ fullName: 'Owner' });
  const admin = await createUser({ fullName: 'Admin' });
  const editor = await createUser({ fullName: 'Editor' });
  const viewer = await createUser({ fullName: 'Viewer' });
  const pending = await createUser({ fullName: 'Pending' });
  const stranger = await createUser({ fullName: 'Stranger' });
  const wedding = await createWedding(owner._id);

  await addCollaborator(wedding._id, admin._id, 'admin');
  await addCollaborator(wedding._id, editor._id, 'editor');
  await addCollaborator(wedding._id, viewer._id, 'viewer');
  await addCollaborator(wedding._id, pending._id, 'editor', 'pending');

  return { wedding, users: { owner, admin, editor, viewer, pending, stranger } };
};
