import mongoose, { Document, Schema } from 'mongoose';

// Daily AI call counters (voice extract + ideas chat). Two kinds of row per
// wedding per day:
//   - userId set:  one family member's calls on this wedding
//   - userId null: the whole wedding's calls (the shared cap)
// Only counts are kept — never prompts or replies. Rows expire after 3 days.
export interface IAiUsage extends Document {
  weddingId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId | null;
  day: string; // YYYY-MM-DD in IST
  count: number;
  createdAt: Date;
}

const aiUsageSchema = new Schema<IAiUsage>(
  {
    weddingId: { type: Schema.Types.ObjectId, ref: 'Wedding', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    day: { type: String, required: true },
    count: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 3 }
  },
  { versionKey: false }
);

aiUsageSchema.index({ weddingId: 1, userId: 1, day: 1 }, { unique: true });

export const AiUsage = mongoose.model<IAiUsage>('AiUsage', aiUsageSchema);
