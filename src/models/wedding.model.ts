import mongoose, { Document, Schema } from 'mongoose';
import { CLIENT_SECTION_LEVELS, ClientAccessSettings } from '../constants/client-access';

export interface IWedding extends Document {
  name: string;
  weddingCode: string;
  brideName: string;
  groomName: string;
  weddingDate: Date;
  location: string;
  totalBudget: number;
  currency: string;
  createdBy: mongoose.Types.ObjectId;
  members: mongoose.Types.ObjectId[];
  status: 'planning' | 'ongoing' | 'completed';
  description?: string;
  imageUrl?: string;
  // Public wedding website (#29) — when isPublic is true, GET
  // /weddings/public/:publicSlug (and .../events) serve a curated,
  // guest-safe subset of this document to unauthenticated visitors.
  // publicSlug is only ever set once the wedding is made public at least
  // once — sparse so many weddings can share `undefined` without violating
  // the unique index.
  isPublic: boolean;
  publicSlug?: string;
  // Guest-facing wedding-website info cards (redesign). All four are
  // independently optional/nullable — a wedding with none of them set
  // simply means the frontend hides those cards. venueAddress is the full
  // postal address, deliberately separate from the existing short
  // `location` display string above.
  venueAddress?: string;
  accommodationInfo?: string;
  pickupInfo?: string;
  giftPolicy?: string;
  // Track C (planner agencies — apnautasav_frontend/docs/TrackC_Planner_Organization_Plan.md).
  // All optional: unset organizationId = an ordinary family wedding, exactly
  // as before. When set, access comes from org membership (access.service.ts)
  // and `createdBy` is only "which staff member typed it in" — it grants
  // nothing on its own.
  organizationId?: mongoose.Types.ObjectId | null;
  // Staff working this wedding. Coordinators only see weddings they're
  // assigned to; `isLead` marks the planner the client deals with.
  orgAssignees?: { userId: mongoose.Types.ObjectId; isLead: boolean }[];
  clientContact?: { name?: string; phone?: string; email?: string };
  archivedAt?: Date | null;
  // What the client family sees on this agency wedding. Unset = the
  // agency's default (constants/client-access.ts effectiveClientAccess).
  clientAccess?: Partial<ClientAccessSettings> | null;
  createdAt: Date;
  updatedAt: Date;
}

const weddingSchema = new Schema<IWedding>({
  name: {
    type: String,
    required: [true, 'Location is required'],
    trim: true
  },
  weddingCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    length: 6
  },
  brideName: {
    type: String,
    required: [true, 'Bride name is required'],
    trim: true
  },
  groomName: {
    type: String,
    required: [true, 'Groom name is required'],
    trim: true
  },
  weddingDate: {
    type: Date,
    required: [true, 'Wedding date is required']
  },
  location: {
    type: String,
    required: [true, 'Location is required'],
    trim: true
  },
  totalBudget: {
    type: Number,
    required: [true, 'Total budget is required'],
    min: [0, 'Budget cannot be negative']
  },
  currency: {
    type: String,
    default: 'INR',
    // NRI-friendly: covers India plus the destinations most NRI families
    // planning a wedding back home are actually paying from/in (US, UK,
    // Canada, Australia, Gulf, Eurozone).
    enum: ['INR', 'USD', 'GBP', 'EUR', 'CAD', 'AUD', 'AED']
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    type: Schema.Types.ObjectId,
    ref: 'Collaborator'
  }],
  status: {
    type: String,
    enum: ['planning', 'ongoing', 'completed'],
    default: 'planning'
  },
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  imageUrl: {
    type: String
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  publicSlug: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  venueAddress: {
    type: String,
    trim: true,
    maxlength: [500, 'Venue address cannot exceed 500 characters']
  },
  accommodationInfo: {
    type: String,
    trim: true,
    maxlength: [2000, 'Accommodation info cannot exceed 2000 characters']
  },
  pickupInfo: {
    type: String,
    trim: true,
    maxlength: [2000, 'Pickup info cannot exceed 2000 characters']
  },
  giftPolicy: {
    type: String,
    trim: true,
    maxlength: [2000, 'Gift policy cannot exceed 2000 characters']
  },
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    default: undefined
  },
  orgAssignees: {
    type: [{
      _id: false,
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      isLead: { type: Boolean, default: false }
    }],
    default: undefined
  },
  clientContact: {
    type: {
      _id: false,
      name: { type: String, trim: true, maxlength: 100 },
      phone: { type: String, trim: true, maxlength: 20 },
      email: { type: String, trim: true, lowercase: true, maxlength: 200 }
    },
    default: undefined
  },
  archivedAt: {
    type: Date,
    default: undefined
  },
  clientAccess: {
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
    default: undefined
  }
}, {
  timestamps: true
});

// Indexes
weddingSchema.index({ createdBy: 1 });
weddingSchema.index({ organizationId: 1, weddingDate: 1 }, { partialFilterExpression: { organizationId: { $exists: true } } });
weddingSchema.index({ 'orgAssignees.userId': 1 }, { sparse: true });
weddingSchema.index({ weddingCode: 1 });
weddingSchema.index({ weddingDate: 1 });

export const Wedding = mongoose.model<IWedding>('Wedding', weddingSchema);