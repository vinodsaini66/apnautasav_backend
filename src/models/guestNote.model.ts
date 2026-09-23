import mongoose, { Document, Schema } from 'mongoose';

// Guest-facing "leave a note for the couple" feature (wedding-website
// redesign) — written via the public POST /rsvp/:token/note route, read by
// the wedding's own team via GET /:weddingId/guest-notes. guestName is a
// denormalized snapshot of the guest's name at write time so a note still
// displays correctly even if the guest is later renamed/deleted.
export interface IGuestNote extends Document {
  weddingId: mongoose.Types.ObjectId;
  guestId?: mongoose.Types.ObjectId;
  guestName: string;
  message: string;
  createdAt: Date;
  updatedAt: Date;
}

const guestNoteSchema = new Schema<IGuestNote>({
  weddingId: {
    type: Schema.Types.ObjectId,
    ref: 'Wedding',
    required: true,
    index: true
  },
  guestId: {
    type: Schema.Types.ObjectId,
    ref: 'Guest'
  },
  guestName: {
    type: String,
    required: [true, 'Guest name is required'],
    trim: true
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true,
    minlength: [2, 'Message must be at least 2 characters long'],
    maxlength: [1000, 'Message cannot exceed 1000 characters']
  }
}, {
  timestamps: true
});

guestNoteSchema.index({ weddingId: 1, createdAt: -1 });

export const GuestNote = mongoose.model<IGuestNote>('GuestNote', guestNoteSchema);
