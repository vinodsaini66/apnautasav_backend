import { Organization } from '../../src/models/org/organization.model';
import { OrgMember } from '../../src/models/org/org-member.model';
import { Wedding } from '../../src/models/wedding.model';
import { ORG_PLANS, OrgRole } from '../../src/constants/org';
import { createUser } from './app';
import { createWedding, addCollaborator } from './fixtures';

let orgCounter = 0;

export const createOrg = async (owner: { _id: unknown; email: string }, overrides: Record<string, unknown> = {}) => {
  orgCounter += 1;
  const org = await Organization.create({
    name: `Agency ${orgCounter}`,
    slug: `agency-${orgCounter}`,
    ownerId: owner._id,
    planKey: 'org_growth',
    planStatus: 'active',
    currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    limitsSnapshot: ORG_PLANS.org_growth.limits,
    createdBy: owner._id,
    ...overrides,
  });
  await addMember(org._id, owner, 'owner');
  return org;
};

export const addMember = (
  organizationId: unknown,
  user: { _id: unknown; email: string },
  role: OrgRole,
  extra: Record<string, unknown> = {}
) =>
  OrgMember.create({ organizationId, userId: user._id, email: user.email, role, status: 'active', joinedAt: new Date(), ...extra });

export const createOrgWedding = async (orgId: unknown, createdBy: unknown, assignees: unknown[] = []) => {
  const wedding = await createWedding(createdBy);
  wedding.organizationId = orgId as any;
  wedding.orgAssignees = assignees.map((userId, i) => ({ userId: userId as any, isLead: i === 0 }));
  await wedding.save();
  return Wedding.findById(wedding._id).orFail();
};

/**
 * Agency A (owner, manager, two coordinators, a client family on one wedding)
 * and agency B (its own owner and wedding) — for cross-tenant tests.
 */
export const twoAgencies = async () => {
  const ownerA = await createUser({ fullName: 'Owner A' });
  const managerA = await createUser({ fullName: 'Manager A' });
  const coordA = await createUser({ fullName: 'Coordinator A' });
  const coord2A = await createUser({ fullName: 'Coordinator 2 A' });
  const clientA = await createUser({ fullName: 'Client A' });
  const ownerB = await createUser({ fullName: 'Owner B' });

  const orgA = await createOrg(ownerA);
  await addMember(orgA._id, managerA, 'manager');
  await addMember(orgA._id, coordA, 'coordinator');
  await addMember(orgA._id, coord2A, 'coordinator');
  const orgB = await createOrg(ownerB);

  // weddingA1: coordinator A assigned, client family in. weddingA2: nobody but the owner.
  const weddingA1 = await createOrgWedding(orgA._id, ownerA._id, [ownerA._id, coordA._id]);
  const weddingA2 = await createOrgWedding(orgA._id, ownerA._id, [ownerA._id]);
  await addCollaborator(weddingA1._id, clientA._id, 'editor');
  const weddingB1 = await createOrgWedding(orgB._id, ownerB._id, [ownerB._id]);

  return {
    orgA,
    orgB,
    weddingA1,
    weddingA2,
    weddingB1,
    users: { ownerA, managerA, coordA, coord2A, clientA, ownerB },
  };
};
