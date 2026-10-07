import mongoose, { Document, Schema } from 'mongoose';
import { ORG_ROLES, OrgRole } from '../../constants/org';

// A planner's staff member (or the owner). Deliberately separate from
// `Collaborator`: a Collaborator is one person on ONE wedding (that's how
// client families get in); an OrgMember reaches the org's weddings —
// every one for owner/manager, only assigned ones for a coordinator
// (Wedding.orgAssignees). See services/access.service.ts.
//
// Invites: a row is created with the invitee's email and status 'invited'.
// `userId` is bound when they accept (the logged-in user's email must match).
// Only a SHA-256 of the invite token is stored.
export interface IOrgMember extends Document {
  organizationId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId | null;
  email: string;
  name?: string;
  role: OrgRole;
  permissionOverrides: { grant: string[]; revoke: string[] };
  status: 'invited' | 'active' | 'disabled';
  inviteTokenHash?: string | null;
  inviteExpiresAt?: Date | null;
  invitedBy?: mongoose.Types.ObjectId | null;
  joinedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const orgMemberSchema = new Schema<IOrgMember>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    email: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, trim: true, maxlength: 100 },
    role: { type: String, enum: ORG_ROLES, required: true },
    permissionOverrides: {
      _id: false,
      grant: { type: [String], default: [] },
      revoke: { type: [String], default: [] },
    },
    status: { type: String, enum: ['invited', 'active', 'disabled'], default: 'invited' },
    inviteTokenHash: { type: String, default: null, select: false },
    inviteExpiresAt: { type: Date, default: null },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    joinedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

orgMemberSchema.index({ organizationId: 1, email: 1 }, { unique: true });
orgMemberSchema.index(
  { organizationId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } }
);
orgMemberSchema.index({ userId: 1, status: 1 });
orgMemberSchema.index({ email: 1, status: 1 });
orgMemberSchema.index({ inviteTokenHash: 1 }, { sparse: true });

export const OrgMember = mongoose.model<IOrgMember>('OrgMember', orgMemberSchema);
