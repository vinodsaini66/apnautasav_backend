import mongoose, { Document, Schema } from 'mongoose';

export interface IGuestInvitation {
  channel: 'sms' | 'email';
  status: 'sent' | 'failed';
  sentAt: Date;
  sentBy: mongoose.Types.ObjectId;
  error?: string;
}

export interface IGuest extends Document {
  weddingId: mongoose.Types.ObjectId;
  name: string;
  email?: string;
  phoneNumber?: string;
  category: 'family' | 'friends' | 'colleagues' | 'others';
  rsvpStatus: 'pending' | 'confirmed' | 'declined';
  address: string;
  plusOne: number;
  dietaryRestrictions?: string;
  seatingPreference?: string;
  notes?: string;
  addedBy: mongoose.Types.ObjectId;
  isVIP: boolean;
  // Which functions this guest is invited to (Mehendi, Sangeet, ...). Empty
  // means "not yet tagged to a specific function" — a valid state, not an
  // error; RSVP itself stays a single status for the whole wedding.
  eventIds: mongoose.Types.ObjectId[];
  // Guest-facing RSVP loop (Phase 2). rsvpToken is a long random string
  // (crypto.randomBytes(24).toString('hex')) — deliberately NOT the short
  // 6-char style used for wedding/collaborator codes, since it's meant to
  // be unguessable and mailed/texted directly to one guest. Generated on
  // first compose/send or on demand; access via it does NOT require
  // Wedding.isPublic — decoupled from the public wedding website feature.
  rsvpToken?: string;
  // Set only by the guest's own public POST /rsvp/:token submission —
  // distinguishes a self-service RSVP from a collaborator's manual edit via
  // PUT /:weddingId/guests/:guestId (which never touches this field).
  rsvpRespondedAt?: Date;
  // Send-tracking log for the compose & send feature (#2 + #7).
  invitations: IGuestInvitation[];
  createdAt: Date;
  updatedAt: Date;
}

const guestSchema = new Schema<IGuest>({
  weddingId: {
    type: Schema.Types.ObjectId,
    ref: 'Wedding',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    enum: ['family', 'friends', 'colleagues', 'others'],
    required: true
  },  
  address: {
    type: String,
    // required: true
  },
  plusOne: {
    type: Number,
    default: 0,
    min: 0
  },
  rsvpStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'declined'],
    default: 'pending'
  },
  dietaryRestrictions: {
    type: String
  },
  seatingPreference: {
    type: String
  },
  notes: {
    type: String
  },
  addedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  isVIP: {
    type: Boolean,
    default: false
  },
  eventIds: [{
    type: Schema.Types.ObjectId,
    ref: 'Event',
    default: []
  }],
  rsvpToken: {
    type: String,
    unique: true,
    sparse: true
  },
  rsvpRespondedAt: {
    type: Date
  },
  invitations: {
    type: [
      {
        channel: {
          type: String,
          enum: ['sms', 'email'],
          required: true
        },
        status: {
          type: String,
          enum: ['sent', 'failed'],
          required: true
        },
        sentAt: {
          type: Date,
          required: true
        },
        sentBy: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        error: {
          type: String
        }
      }
    ],
    default: []
  }
}, {
  timestamps: true
});

// Indexes
guestSchema.index({ weddingId: 1 });
guestSchema.index({ email: 1 });
guestSchema.index({ phoneNumber: 1 });
guestSchema.index({ eventIds: 1 });
// rsvpToken already gets a unique index from the schema field definition
// above (unique + sparse) — no separate .index() call needed.

export const Guest = mongoose.model<IGuest>('Guest', guestSchema);