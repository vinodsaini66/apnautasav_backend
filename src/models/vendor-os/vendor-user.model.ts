import mongoose, { Document, Schema } from 'mongoose';
import { VENDOR_USER_ROLES, VendorUserRole } from '../../constants/vendorOs';

// A person who logs into the Vendor OS panel. Deliberately a separate
// collection (and separate JWT secret — see services/vendor-os/vendor-auth.service.ts)
// from the family-side `User`: the same phone/email can be a family user and
// a vendor without either session unlocking the other.
//
// Three ways in (all land on the same account):
//   - email + password (Sign Up / Sign In tabs)
//   - "Email link" (passwordless magic link)
//   - "Mobile OTP"
// So both `email` and `phone` are optional, each unique when present.
//
// `vendorId` is set at email sign-up (a draft listing is created with the
// business name) or when the basic profile is first saved (OTP / email-link
// sign-ups, which don't collect a business name up front).
export interface IVendorUser extends Document {
  vendorId?: mongoose.Types.ObjectId | null;
  phone?: string;
  phoneVerified: boolean;
  pendingPhone?: string;
  name?: string;
  email?: string;
  emailVerified: boolean;
  passwordHash?: string;
  role: VendorUserRole;
  status: 'invited' | 'active' | 'disabled';
  invitedBy?: mongoose.Types.ObjectId;
  otpHash?: string;
  otpExpiry?: Date;
  otpAttempts: number;
  otpSentAt?: Date;
  verifyTokenHash?: string;
  verifyTokenExpiry?: Date;
  verifySentAt?: Date;
  loginLinkHash?: string;
  loginLinkExpiry?: Date;
  loginLinkSentAt?: Date;
  resetTokenHash?: string;
  resetTokenExpiry?: Date;
  resetSentAt?: Date;
  // Bumped on password reset — every token issued before it stops working.
  tokenVersion: number;
  fcmTokens: string[];
  language: 'en' | 'hi';
  /** Settings → Notifications: { leads: { push, whatsapp }, … }. Missing = on. */
  notificationPrefs?: Record<string, { push?: boolean; whatsapp?: boolean }>;
  lastLoginAt?: Date;
  lastLoginMethod?: 'password' | 'otp' | 'email_link';
  createdAt: Date;
  updatedAt: Date;
}

const vendorUserSchema = new Schema<IVendorUser>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: 'WeddingVendor', default: null, index: true },
    phone: { type: String, trim: true },
    phoneVerified: { type: Boolean, default: false },
    pendingPhone: { type: String, trim: true, select: false },
    name: { type: String, trim: true, maxlength: 100 },
    email: { type: String, trim: true, lowercase: true },
    emailVerified: { type: Boolean, default: false },
    passwordHash: { type: String, select: false },
    role: { type: String, enum: VENDOR_USER_ROLES, default: 'owner' },
    status: { type: String, enum: ['invited', 'active', 'disabled'], default: 'active' },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'VendorUser' },
    otpHash: { type: String, select: false },
    otpExpiry: { type: Date, select: false },
    otpAttempts: { type: Number, default: 0, select: false },
    otpSentAt: { type: Date, select: false },
    verifyTokenHash: { type: String, select: false },
    verifyTokenExpiry: { type: Date, select: false },
    verifySentAt: { type: Date, select: false },
    loginLinkHash: { type: String, select: false },
    loginLinkExpiry: { type: Date, select: false },
    loginLinkSentAt: { type: Date, select: false },
    resetTokenHash: { type: String, select: false },
    resetTokenExpiry: { type: Date, select: false },
    resetSentAt: { type: Date, select: false },
    tokenVersion: { type: Number, default: 0 },
    fcmTokens: { type: [String], default: [], select: false },
    language: { type: String, enum: ['en', 'hi'], default: 'en' },
    notificationPrefs: { type: Schema.Types.Mixed, default: {} },
    lastLoginAt: Date,
    lastLoginMethod: { type: String, enum: ['password', 'otp', 'email_link'] },
  },
  { timestamps: true }
);

// Unique only when present (an email-only account has no phone and vice
// versa). NOTE: if a `vendorusers` collection already exists from an earlier
// deploy, drop its old `phone_1` index once so this one can be built.
vendorUserSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } }, name: 'phone_unique' });
vendorUserSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } }, name: 'email_unique' });
vendorUserSchema.index({ verifyTokenHash: 1 }, { sparse: true });
vendorUserSchema.index({ loginLinkHash: 1 }, { sparse: true });
vendorUserSchema.index({ resetTokenHash: 1 }, { sparse: true });

export const VendorUser = mongoose.model<IVendorUser>('VendorUser', vendorUserSchema);
