import mongoose, { Schema } from 'mongoose';

const CollaborationInvitationSchema = new Schema(
  {
    phoneNumber: { type: String, },
    email: { type: String, required: true },
    name: { type: String, required: true },
    weddingId: { type: Schema.Types.ObjectId, ref: 'Wedding', required: true },
    role: { type: String, enum: ['editor', 'admin'], default: 'editor' },
    invitationCode: { type: String, required: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'expired'],
      default: 'pending'
    },
    expiresAt: { type: Date }, // optional
  },
  { timestamps: true }
);

export default mongoose.model('CollaborationInvitation', CollaborationInvitationSchema);
