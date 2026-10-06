import mongoose from 'mongoose';
import { User } from '../../models/user.model';
import { Wedding } from '../../models/wedding.model';
import { Collaborator } from '../../models/collaborator.model';
import { Organization } from '../../models/org/organization.model';
import { OrgMember } from '../../models/org/org-member.model';
import { ORG_PLANS, ORG_TRIAL_DAYS, OrgPlanKey } from '../../constants/org';
import { uniqueSlug } from './org.service';

/**
 * Moves a concierge-pilot planner (PDF Phase 1: set up as an `admin`
 * Collaborator on each client's wedding) onto a real Organization:
 *
 * - creates the org (or reuses the one they already own), planner = owner;
 * - every wedding where the planner is an accepted admin collaborator joins
 *   the org, with the planner as lead;
 * - listed staff become OrgMembers, assigned to the weddings they were
 *   collaborators on; their per-wedding Collaborator rows go away;
 * - the family who created each wedding stays in as an `admin` client
 *   collaborator (on an org wedding `createdBy` alone grants nothing, so it
 *   is re-pointed at the planner).
 *
 * Idempotent — re-running skips weddings already in the org.
 */
export interface ConciergeMigrationInput {
  plannerEmail: string;
  orgName: string;
  planKey?: OrgPlanKey;
  staff?: { email: string; role: 'manager' | 'coordinator' }[];
  dryRun?: boolean;
}

export const migrateConciergePlanner = async (input: ConciergeMigrationInput) => {
  const report: string[] = [];
  const dry = !!input.dryRun;
  const planner = await User.findOne({ email: input.plannerEmail.toLowerCase() });
  if (!planner) throw new Error(`No user with email ${input.plannerEmail}`);

  // 1. The organization.
  let org = await Organization.findOne({ ownerId: planner._id });
  if (org) report.push(`Using existing organization "${org.name}" (${org._id})`);
  else {
    const planKey = input.planKey ?? 'org_trial';
    report.push(`Create organization "${input.orgName}" on ${planKey}, owner ${planner.email}`);
    if (!dry) {
      org = await Organization.create({
        name: input.orgName,
        slug: await uniqueSlug(input.orgName),
        ownerId: planner._id,
        contact: { email: planner.email },
        planKey,
        planStatus: planKey === 'org_trial' ? 'trial' : 'active',
        trialEndsAt: planKey === 'org_trial' ? new Date(Date.now() + ORG_TRIAL_DAYS * 86400000) : null,
        limitsSnapshot: ORG_PLANS[planKey].limits,
        createdBy: planner._id,
      });
      await OrgMember.create({
        organizationId: org._id,
        userId: planner._id,
        email: planner.email,
        name: planner.fullName,
        role: 'owner',
        status: 'active',
        joinedAt: new Date(),
      });
    }
  }
  const orgId = org?._id as mongoose.Types.ObjectId | undefined;

  // 2. Staff.
  const staffUsers: { id: string; email: string; role: 'manager' | 'coordinator' }[] = [];
  for (const s of input.staff ?? []) {
    const user = await User.findOne({ email: s.email.toLowerCase() });
    if (!user) {
      report.push(`! Skipping staff ${s.email}: no account yet (invite them from the Team screen instead)`);
      continue;
    }
    staffUsers.push({ id: String(user._id), email: user.email, role: s.role });
    report.push(`Staff ${user.email} → ${s.role}`);
    if (!dry && orgId) {
      await OrgMember.updateOne(
        { organizationId: orgId, email: user.email },
        { $set: { userId: user._id, name: user.fullName, role: s.role, status: 'active', joinedAt: new Date() } },
        { upsert: true }
      );
    }
  }
  const staffIds = new Set(staffUsers.map((s) => s.id));

  // 3. The planner's client weddings.
  const plannerSeats = await Collaborator.find({ userId: planner._id, role: 'admin', invitationStatus: 'accepted' }).lean();
  const weddings = await Wedding.find({ _id: { $in: plannerSeats.map((c) => c.weddingId) }, organizationId: null });
  report.push(`${weddings.length} wedding(s) to move`);

  for (const wedding of weddings) {
    const familyOwnerId = String(wedding.createdBy);
    const staffSeats = await Collaborator.find({ weddingId: wedding._id, userId: { $in: [...staffIds] } }).lean();
    report.push(`- ${wedding.name}: family owner ${familyOwnerId} stays as admin client; ${staffSeats.length} staff seat(s) move to org assignment`);
    if (dry || !orgId) continue;

    if (familyOwnerId !== String(planner._id)) {
      await Collaborator.updateOne(
        { weddingId: wedding._id, userId: wedding.createdBy },
        { $set: { role: 'admin', invitationStatus: 'accepted', invitedBy: planner._id } },
        { upsert: true }
      );
    }
    await Collaborator.deleteMany({ weddingId: wedding._id, userId: { $in: [planner._id, ...staffSeats.map((s) => s.userId)] } });

    wedding.createdBy = planner._id as mongoose.Types.ObjectId;
    wedding.organizationId = orgId;
    wedding.orgAssignees = [
      { userId: planner._id as mongoose.Types.ObjectId, isLead: true },
      ...staffSeats.map((s) => ({ userId: s.userId as mongoose.Types.ObjectId, isLead: false })),
    ];
    await wedding.save();
  }

  if (dry) report.push('(dry run — nothing was changed)');
  return { orgId: orgId ? String(orgId) : null, weddingsMoved: dry ? 0 : weddings.length, report };
};
