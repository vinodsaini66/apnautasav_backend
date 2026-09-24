import mongoose, { Document, Schema } from 'mongoose';

// Event-day timeline for one booking event ("baraat 6 pm, varmala 8 pm"),
// shared with the crew on the call sheet and — once the vendor chooses —
// with the family via a public link and their ApnaUtsav account.
export interface IRunSheetItem {
  _id: mongoose.Types.ObjectId;
  time: string;
  endTime?: string;
  title: string;
  description?: string;
  location?: string;
  crewMemberIds: mongoose.Types.ObjectId[];
  status: 'pending' | 'in_progress' | 'done' | 'skipped';
  completedAt?: Date;
}

export interface IRunSheet extends Document {
  vendorId: mongoose.Types.ObjectId;
  bookingId: mongoose.Types.ObjectId;
  bookingEventId: mongoose.Types.ObjectId;
  functionType: string;
  date: Date;
  items: IRunSheetItem[];
  notes?: string;
  shareToken: string;
  sharedWithClient: boolean;
  lastSharedAt?: Date;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const itemSchema = new Schema<IRunSheetItem>({
  time: { type: String, required: true, trim: true, maxlength: 10 },
  endTime: { type: String, trim: true, maxlength: 10 },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 1000 },
  location: { type: String, trim: true, maxlength: 200 },
  crewMemberIds: { type: [Schema.Types.ObjectId], ref: 'CrewMember', default: [] },
  status: { type: String, enum: ['pending', 'in_progress', 'done', 'skipped'], default: 'pending' },
  completedAt: Date,
});

const runSheetSchema = new Schema<IRunSheet>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: 'WeddingVendor', required: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'VendorBooking', required: true, index: true },
    bookingEventId: { type: Schema.Types.ObjectId, required: true, unique: true },
    functionType: { type: String, required: true },
    date: { type: Date, required: true },
    items: { type: [itemSchema], default: [] },
    notes: { type: String, trim: true, maxlength: 3000 },
    shareToken: { type: String, required: true, unique: true },
    sharedWithClient: { type: Boolean, default: false },
    lastSharedAt: Date,
    updatedBy: { type: Schema.Types.ObjectId, ref: 'VendorUser' },
  },
  { timestamps: true }
);

runSheetSchema.index({ vendorId: 1, date: 1 });

export const RunSheet = mongoose.model<IRunSheet>('RunSheet', runSheetSchema);
