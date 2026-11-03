import mongoose, { Document, Schema } from 'mongoose';
import { SQUAD_AREAS, SquadArea } from '../constants/squads';

// A family "squad" (Swagat Team, Prabandh Team, ...) — a named group of the
// wedding's own people who share a slice of the work. Membership lives here
// rather than on Collaborator because the wedding owner and agency staff
// aren't Collaborator rows but can still be in a squad. A squad's score is
// its tasks (Task.squadId), never its members, so someone in two squads or
// switching squads never skews it.
export interface ISquad extends Document {
  weddingId: mongoose.Types.ObjectId;
  name: string;
  emoji: string;
  color: string;
  // Which part of the wedding this squad looks after — decides which
  // reminders reach it (e.g. pending RSVPs go to the 'guests' squad only).
  areas: SquadArea[];
  captainId?: mongoose.Types.ObjectId | null;
  memberIds: mongoose.Types.ObjectId[];
  order: number;
  createdBy: mongoose.Types.ObjectId;
  // Last time the daily cron nudged this squad — keeps nudges to one every
  // couple of days per squad.
  lastNudgedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const squadSchema = new Schema<ISquad>(
  {
    weddingId: {
      type: Schema.Types.ObjectId,
      ref: 'Wedding',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: [true, 'Squad name is required'],
      trim: true,
      maxlength: 40
    },
    emoji: {
      type: String,
      trim: true,
      default: '✨',
      maxlength: 16
    },
    color: {
      type: String,
      default: '#9e2b46'
    },
    areas: [{
      type: String,
      enum: SQUAD_AREAS
    }],
    captainId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    memberIds: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    order: {
      type: Number,
      default: 0
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    lastNudgedAt: {
      type: Date
    }
  },
  { timestamps: true }
);

squadSchema.index({ memberIds: 1 });

export const Squad = mongoose.model<ISquad>('Squad', squadSchema);
