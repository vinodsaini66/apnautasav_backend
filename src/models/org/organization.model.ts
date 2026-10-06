import mongoose, { Document, Schema } from 'mongoose';
import { ORG_PLAN_KEYS, OrgPlanKey, OrgPlanLimits } from '../../constants/org';
import { CLIENT_SECTION_LEVELS, ClientAccessSettings } from '../../constants/client-access';

// A wedding planning agency (Track C). Staff reach its weddings through
// OrgMember; client families through ordinary per-wedding Collaborator rows.
// See apnautasav_frontend/docs/TrackC_Planner_Organization_Plan.md.
//
// `ownerId` is unset only while an admin-created org waits for its owner to
// sign up and accept (their OrgMember row holds the invited email). A user
// owns at most one organization (enforced in OrgService.create).
export type OrgPlanStatus = 'trial' | 'active' | 'past_due' | 'paused' | 'cancelled';
export type BillingPeriod = 'monthly' | 'annual';

export interface IOrganization extends Document {
  name: string;
  slug: string;
  ownerId?: mongoose.Types.ObjectId | null;
  contact: { phone?: string; email?: string; city?: string; address?: string };
  gstNumber?: string;
  logoUrl?: string;
  brandColor?: string;
  accentColor?: string;
  showPoweredBy: boolean;
  status: 'active' | 'suspended';
  planKey: OrgPlanKey;
  planStatus: OrgPlanStatus;
  billingPeriod?: BillingPeriod | null;
  trialEndsAt?: Date | null;
  currentPeriodEnd?: Date | null;
  /** Off-season pause (M5): when it started and what status to go back to. Paused = read-only. */
  pausedAt?: Date | null;
  pausedFromStatus?: 'trial' | 'active' | null;
  /** Snapshotted from ORG_PLANS when the plan is set, so later price/limit edits never change what an org already has. */
  limitsSnapshot: OrgPlanLimits;
  /** An upgrade the org asked for from its billing screen, waiting for an admin to confirm payment. */
  billingRequest?: {
    planKey: OrgPlanKey;
    billingPeriod: BillingPeriod;
    note?: string;
    requestedBy: mongoose.Types.ObjectId;
    requestedAt: Date;
  } | null;
  settings: {
    /** What client families see on a new wedding unless the wedding overrides it. */
    defaultClientAccess?: Partial<ClientAccessSettings> | null;
  };
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

const organizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    contact: {
      _id: false,
      phone: { type: String, trim: true, maxlength: 20 },
      email: { type: String, trim: true, lowercase: true, maxlength: 200 },
      city: { type: String, trim: true, maxlength: 100 },
      address: { type: String, trim: true, maxlength: 500 },
    },
    gstNumber: { type: String, trim: true, uppercase: true, maxlength: 20 },
    logoUrl: { type: String, trim: true },
    brandColor: { type: String, match: HEX },
    accentColor: { type: String, match: HEX },
    showPoweredBy: { type: Boolean, default: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    planKey: { type: String, enum: ORG_PLAN_KEYS, required: true },
    planStatus: { type: String, enum: ['trial', 'active', 'past_due', 'paused', 'cancelled'], required: true },
    billingPeriod: { type: String, enum: ['monthly', 'annual', null], default: null },
    trialEndsAt: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    pausedAt: { type: Date, default: null },
    pausedFromStatus: { type: String, enum: ['trial', 'active', null], default: null },
    limitsSnapshot: {
      _id: false,
      activeWeddings: { type: Number, required: true },
      seats: { type: Number, required: true },
      whiteLabel: { type: Boolean, required: true },
      brandedExports: { type: Boolean, required: true },
      csvImport: { type: Boolean, required: true },
    },
    billingRequest: {
      type: {
        _id: false,
        planKey: { type: String, enum: ORG_PLAN_KEYS, required: true },
        billingPeriod: { type: String, enum: ['monthly', 'annual'], required: true },
        note: { type: String, trim: true, maxlength: 500 },
        requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        requestedAt: { type: Date, required: true },
      },
      default: null,
    },
    settings: {
      _id: false,
      defaultClientAccess: {
        type: {
          _id: false,
          preset: { type: String, enum: ['view_only', 'collaborate', 'custom'] },
          sections: {
            _id: false,
            events: { type: String, enum: CLIENT_SECTION_LEVELS.events },
            guests: { type: String, enum: CLIENT_SECTION_LEVELS.guests },
            tasks: { type: String, enum: CLIENT_SECTION_LEVELS.tasks },
            budget: { type: String, enum: CLIENT_SECTION_LEVELS.budget },
            vendors: { type: String, enum: CLIENT_SECTION_LEVELS.vendors },
            activity: { type: String, enum: CLIENT_SECTION_LEVELS.activity }
          },
          allowJoinByCode: { type: Boolean }
        },
        default: undefined,
      },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

organizationSchema.index({ ownerId: 1 }, { unique: true, partialFilterExpression: { ownerId: { $type: 'objectId' } } });
organizationSchema.index({ 'billingRequest.requestedAt': 1 }, { sparse: true });

export const Organization = mongoose.model<IOrganization>('Organization', organizationSchema);
