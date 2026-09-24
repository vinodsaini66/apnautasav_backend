import mongoose, { Document, Schema } from 'mongoose';

// A person on the vendor's wedding-day roster — a salaried team member or
// a freelancer (second shooter, dhol player, makeup assistant). Unlike
// VendorUser, a crew member does NOT need a panel login; if they have one
// (VendorUser with role 'crew'), `vendorUserId` links it so they can see
// and confirm their own assignments.
//
// Crew members are individuals; a VendorResource ("Crew A") is the bookable
// team the calendar checks at booking time. `defaultResourceId` says which
// team a member usually works in, so "assign default team" can fill an
// event in one tap.
export interface ICrewMember extends Document {
  vendorId: mongoose.Types.ObjectId;
  name: string;
  phone: string;
  role?: string;
  skills: string[];
  type: 'staff' | 'freelancer';
  defaultRate?: number;
  defaultResourceId?: mongoose.Types.ObjectId;
  vendorUserId?: mongoose.Types.ObjectId;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const crewMemberSchema = new Schema<ICrewMember>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: 'WeddingVendor', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true },
    role: { type: String, trim: true, maxlength: 80 },
    skills: { type: [String], default: [] },
    type: { type: String, enum: ['staff', 'freelancer'], default: 'freelancer' },
    defaultRate: { type: Number, min: 0 },
    defaultResourceId: { type: Schema.Types.ObjectId, ref: 'VendorResource' },
    vendorUserId: { type: Schema.Types.ObjectId, ref: 'VendorUser' },
    notes: { type: String, trim: true, maxlength: 1000 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

crewMemberSchema.index({ vendorId: 1, phone: 1 }, { unique: true });
crewMemberSchema.index({ vendorId: 1, isActive: 1 });

export const CrewMember = mongoose.model<ICrewMember>('CrewMember', crewMemberSchema);
