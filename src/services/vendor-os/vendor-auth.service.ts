import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { VendorUser, IVendorUser } from '../../models/vendor-os/vendor-user.model';
import { WeddingVendor } from '../../models/wedding-vendor.model';
import { SMSService } from '../sms.service';
import { EmailService } from '../email.service';
import { VendorOnboardingService, BASIC_PROFILE_SELECT } from './onboarding.service';
import { generateOTP } from '../../utils/generateCode';
import logger from '../../utils/logger';
import { VendorOsError, badRequest, forbidden, normalizePhone } from '../../utils/vendorOs';

// Vendor OS auth is fully separate from the family app's auth (User model,
// JWT_SECRET). Tokens are signed with a different secret and audience, so a
// family token is rejected by the vendor middleware and vice versa.
//
// Login methods (the Sign In / Sign Up screen):
//   - email + password           signup() / login()
//   - "Email link" (magic link)  requestEmailLink() → verifyEmailLink()
//   - "Mobile OTP"               sendOtp() → verifyOtp()
// All return the same session shape, including `onboarding.nextStep`
// ('basic_profile' | 'dashboard') the frontend routes on.

const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10);
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const EMAIL_RESEND_COOLDOWN_MS = 60 * 1000;
const LOGIN_LINK_MINUTES = 15;
const VERIFY_EMAIL_HOURS = 24;
const RESET_PASSWORD_HOURS = 1;
const AUDIENCE = 'vendor-os';

const PANEL_URL = (process.env.VENDOR_OS_PANEL_URL || process.env.VENDOR_OS_PUBLIC_URL || process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');

export const vendorJwtSecret = (): string => process.env.VENDOR_JWT_SECRET || `${process.env.JWT_SECRET}:vendor-os`;
const vendorRefreshSecret = (): string =>
  process.env.VENDOR_JWT_REFRESH_SECRET || `${process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET}:vendor-os-refresh`;

export interface VendorTokenPayload {
  vendorUserId: string;
  vendorId: string | null;
  role: IVendorUser['role'];
  phone?: string;
  tv: number;
  typ: 'vendor_os';
}

const hashOtp = (key: string, otp: string) => crypto.createHash('sha256').update(`${key}:${otp}:${vendorJwtSecret()}`).digest('hex');
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('hex');
const isDevelopment = () => process.env.NODE_ENV === 'development';

export const verifyVendorAccessToken = (token: string): VendorTokenPayload => {
  const decoded = jwt.verify(token, vendorJwtSecret(), { audience: AUDIENCE }) as VendorTokenPayload;
  if (decoded.typ !== 'vendor_os') throw new Error('Not a Vendor OS token');
  return decoded;
};

const emailShell = (title: string, body: string, cta?: { label: string; url: string }) => `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1f2937">
    <h2 style="margin:0 0 4px">ApnaUtsav <span style="font-size:13px;color:#6b7280">VendorOS</span></h2>
    <h3 style="margin:24px 0 8px">${title}</h3>
    <p style="line-height:1.6">${body}</p>
    ${cta ? `<p style="margin:28px 0"><a href="${cta.url}" style="background:#2563eb;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none">${cta.label}</a></p>
    <p style="font-size:12px;color:#6b7280">Or open this link: ${cta.url}</p>` : ''}
    <p style="font-size:12px;color:#9ca3af;margin-top:32px">If you didn't request this, you can ignore this email.</p>
  </div>`;

export class VendorAuthService {
  static assertPhone(input: string): string {
    const phone = normalizePhone(input);
    if (!/^[6-9]\d{9}$/.test(phone)) throw badRequest('Enter a valid 10-digit mobile number');
    return phone;
  }

  static normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private static assertActive(user: IVendorUser) {
    if (user.status === 'disabled') throw forbidden('This account has been disabled. Contact the business owner.');
  }

  private static async sendEmail(to: string, subject: string, html: string, devLabel: string, url?: string) {
    const sent = await EmailService.sendMail(to, subject, html);
    if (isDevelopment() && url) logger.info(`Vendor OS ${devLabel} for ${to}: ${url}`);
    return sent;
  }

  // -------------------------------------------------------------------
  // Email + password
  // -------------------------------------------------------------------

  /**
   * Sign Up tab: business name + email + password. Logs the vendor straight
   * in (no "check your inbox" wall — that loses vendors mid-demo) and
   * creates the draft listing; a verification email goes out in the
   * background and `onboarding.emailVerified` stays false until clicked.
   */
  static async signup(data: { businessName: string; email: string; password: string; name?: string }) {
    const email = this.normalizeEmail(data.email);
    let user = await VendorUser.findOne({ email }).select('+passwordHash');

    // An email that already has a password, or already runs a business,
    // is taken — never overwrite it (that would be an account takeover).
    // The only reusable row is a bare one left by an unused email-link
    // request.
    if (user && (user.passwordHash || user.vendorId || user.emailVerified)) {
      throw new VendorOsError(409, 'An account with this email already exists. Sign in, or use "Email link" if you forgot your password.', {
        code: 'EMAIL_TAKEN',
      });
    }
    if (!user) user = new VendorUser({ email, role: 'owner', status: 'active' });
    user.passwordHash = await bcrypt.hash(data.password, 10);
    if (data.name) user.name = data.name;
    user.lastLoginAt = new Date();
    user.lastLoginMethod = 'password';
    await user.save();

    await VendorOnboardingService.createDraftListing(user, data.businessName.trim());
    await this.sendVerificationEmail(user).catch((err) => logger.warn(`Vendor OS verify email failed: ${err.message}`));

    return this.buildSession(user);
  }

  /** Sign In tab. Deliberately one generic error for wrong email and wrong password. */
  static async login(rawEmail: string, password: string, fcmToken?: string) {
    const email = this.normalizeEmail(rawEmail);
    const user = await VendorUser.findOne({ email }).select('+passwordHash +fcmTokens');
    const ok = user?.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !ok) {
      throw new VendorOsError(401, 'Invalid email or password', { code: 'INVALID_CREDENTIALS' });
    }
    this.assertActive(user);
    this.touchLogin(user, 'password', fcmToken);
    await user.save();
    return this.buildSession(user);
  }

  private static touchLogin(user: IVendorUser, method: IVendorUser['lastLoginMethod'], fcmToken?: string) {
    user.lastLoginAt = new Date();
    user.lastLoginMethod = method;
    if (user.status === 'invited') user.status = 'active';
    if (fcmToken && !(user.fcmTokens || []).includes(fcmToken)) user.fcmTokens = [...(user.fcmTokens || []).slice(-4), fcmToken];
  }

  // -------------------------------------------------------------------
  // Email verification
  // -------------------------------------------------------------------

  static async sendVerificationEmail(user: IVendorUser) {
    if (!user.email || user.emailVerified) return;
    const token = newToken();
    user.verifyTokenHash = hashToken(token);
    user.verifyTokenExpiry = new Date(Date.now() + VERIFY_EMAIL_HOURS * 3600 * 1000);
    user.verifySentAt = new Date();
    await user.save();
    const url = `${PANEL_URL}/auth/verify-email?token=${token}`;
    await this.sendEmail(
      user.email,
      'Verify your email — ApnaUtsav VendorOS',
      emailShell('Confirm your email address', 'Tap below to verify the email for your VendorOS account.', { label: 'Verify email', url }),
      'verify-email link',
      url
    );
  }

  static async resendVerification(vendorUserId: string) {
    const user = await VendorUser.findById(vendorUserId).select('+verifySentAt');
    if (!user) throw new VendorOsError(401, 'Session expired');
    if (!user.email) throw badRequest('No email on this account');
    if (user.emailVerified) return { message: 'Email is already verified' };
    if (user.verifySentAt && Date.now() - user.verifySentAt.getTime() < EMAIL_RESEND_COOLDOWN_MS) {
      throw new VendorOsError(429, 'Please wait a minute before requesting another email');
    }
    await this.sendVerificationEmail(user);
    return { message: 'Verification email sent' };
  }

  /** Clicking the verification link also signs the vendor in. */
  static async verifyEmail(token: string) {
    const user = await VendorUser.findOne({ verifyTokenHash: hashToken(token) }).select('+verifyTokenHash +verifyTokenExpiry');
    if (!user || !user.verifyTokenExpiry || user.verifyTokenExpiry < new Date()) {
      throw badRequest('This verification link is invalid or has expired', { code: 'INVALID_TOKEN' });
    }
    this.assertActive(user);
    user.emailVerified = true;
    user.verifyTokenHash = undefined;
    user.verifyTokenExpiry = undefined;
    this.touchLogin(user, 'email_link');
    await user.save();
    return this.buildSession(user);
  }

  // -------------------------------------------------------------------
  // "Email link" — passwordless magic link (works for sign in AND sign up)
  // -------------------------------------------------------------------

  static async requestEmailLink(rawEmail: string) {
    const email = this.normalizeEmail(rawEmail);
    const generic = { message: 'If this email can sign in, a login link is on its way. It expires in 15 minutes.' };

    let user = await VendorUser.findOne({ email }).select('+loginLinkSentAt');
    if (user?.status === 'disabled') return generic;
    if (user?.loginLinkSentAt && Date.now() - user.loginLinkSentAt.getTime() < EMAIL_RESEND_COOLDOWN_MS) {
      throw new VendorOsError(429, 'Please wait a minute before requesting another link');
    }
    // New email → the account is created now and completed via the basic
    // profile after the link is opened.
    if (!user) user = new VendorUser({ email, role: 'owner', status: 'active' });

    const token = newToken();
    user.loginLinkHash = hashToken(token);
    user.loginLinkExpiry = new Date(Date.now() + LOGIN_LINK_MINUTES * 60 * 1000);
    user.loginLinkSentAt = new Date();
    await user.save();

    const url = `${PANEL_URL}/auth/email-link?token=${token}`;
    await this.sendEmail(
      email,
      'Your VendorOS login link',
      emailShell('Sign in to VendorOS', `Tap below to sign in. This link works once and expires in ${LOGIN_LINK_MINUTES} minutes.`, {
        label: 'Sign in to VendorOS',
        url,
      }),
      'login link',
      url
    );
    return generic;
  }

  static async verifyEmailLink(token: string, fcmToken?: string) {
    const user = await VendorUser.findOne({ loginLinkHash: hashToken(token) }).select(
      '+loginLinkHash +loginLinkExpiry +passwordHash +fcmTokens'
    );
    if (!user || !user.loginLinkExpiry || user.loginLinkExpiry < new Date()) {
      throw badRequest('This login link is invalid or has expired. Request a new one.', { code: 'INVALID_TOKEN' });
    }
    this.assertActive(user);

    // First proof of inbox ownership on an account someone else may have
    // pre-registered with this email + a password: drop that password and
    // kill its sessions, so only the real inbox owner keeps access.
    if (!user.emailVerified && user.passwordHash) {
      user.passwordHash = undefined;
      user.tokenVersion += 1;
    }
    user.emailVerified = true;
    user.loginLinkHash = undefined;
    user.loginLinkExpiry = undefined;
    this.touchLogin(user, 'email_link', fcmToken);
    await user.save();
    return this.buildSession(user);
  }

  // -------------------------------------------------------------------
  // Forgot / reset password
  // -------------------------------------------------------------------

  static async forgotPassword(rawEmail: string) {
    const email = this.normalizeEmail(rawEmail);
    const generic = { message: "If an account with that email exists, we've sent a link to reset the password." };
    const user = await VendorUser.findOne({ email }).select('+resetSentAt');
    if (!user || user.status === 'disabled') return generic;
    if (user.resetSentAt && Date.now() - user.resetSentAt.getTime() < EMAIL_RESEND_COOLDOWN_MS) return generic;

    const token = newToken();
    user.resetTokenHash = hashToken(token);
    user.resetTokenExpiry = new Date(Date.now() + RESET_PASSWORD_HOURS * 3600 * 1000);
    user.resetSentAt = new Date();
    await user.save();
    const url = `${PANEL_URL}/auth/reset-password?token=${token}`;
    await this.sendEmail(
      email,
      'Reset your VendorOS password',
      emailShell('Reset your password', 'Tap below to choose a new password. The link expires in 1 hour.', { label: 'Reset password', url }),
      'reset-password link',
      url
    );
    return generic;
  }

  /** Sets the new password, signs out every other session, signs this one in. */
  static async resetPassword(token: string, password: string) {
    const user = await VendorUser.findOne({ resetTokenHash: hashToken(token) }).select('+resetTokenHash +resetTokenExpiry');
    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      throw badRequest('This reset link is invalid or has expired', { code: 'INVALID_TOKEN' });
    }
    this.assertActive(user);
    user.passwordHash = await bcrypt.hash(password, 10);
    user.resetTokenHash = undefined;
    user.resetTokenExpiry = undefined;
    user.emailVerified = true; // the link proved inbox ownership
    user.tokenVersion += 1;
    this.touchLogin(user, 'password');
    await user.save();
    return this.buildSession(user);
  }

  /** Change password while signed in (also lets OTP / email-link users add one). */
  static async changePassword(vendorUserId: string, data: { currentPassword?: string; newPassword: string }) {
    const user = await VendorUser.findById(vendorUserId).select('+passwordHash');
    if (!user) throw new VendorOsError(401, 'Session expired');
    if (!user.email) throw badRequest('Add an email to your account before setting a password');
    if (user.passwordHash) {
      if (!data.currentPassword || !(await bcrypt.compare(data.currentPassword, user.passwordHash))) {
        throw badRequest('Current password is incorrect');
      }
    }
    user.passwordHash = await bcrypt.hash(data.newPassword, 10);
    user.tokenVersion += 1;
    await user.save();
    return this.buildSession(user);
  }

  // -------------------------------------------------------------------
  // Mobile OTP
  // -------------------------------------------------------------------

  static async sendOtp(rawPhone: string): Promise<{ message: string; isNewUser: boolean }> {
    const phone = this.assertPhone(rawPhone);
    let user = await VendorUser.findOne({ phone }).select('+otpSentAt');
    const isNewUser = !user;
    if (user) this.assertActive(user);

    if (user?.otpSentAt && Date.now() - user.otpSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
      throw new VendorOsError(429, 'Please wait 30 seconds before requesting another OTP');
    }

    const otp = isDevelopment() ? '123456' : generateOTP(6);
    if (!user) user = new VendorUser({ phone, role: 'owner', status: 'active' });
    user.otpHash = hashOtp(phone, otp);
    user.otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    user.otpAttempts = 0;
    user.otpSentAt = new Date();
    await user.save();

    await SMSService.sendSMS(`+91${phone}`, `${otp} is your ApnaUtsav VendorOS login code. Valid for ${OTP_EXPIRY_MINUTES} minutes.`);
    if (isDevelopment()) logger.info(`Vendor OS OTP for ${phone}: ${otp}`);
    return { message: 'OTP sent successfully', isNewUser };
  }

  private static async checkOtp(user: IVendorUser, key: string, otp: string) {
    if (!user.otpHash || !user.otpExpiry) throw badRequest('Please request an OTP first');
    if (user.otpAttempts >= OTP_MAX_ATTEMPTS) throw new VendorOsError(429, 'Too many wrong attempts. Request a new OTP.');
    if (new Date() > user.otpExpiry) throw badRequest('OTP has expired. Request a new one.');
    if (hashOtp(key, otp) !== user.otpHash) {
      user.otpAttempts += 1;
      await user.save();
      throw badRequest('Invalid OTP');
    }
    user.otpHash = undefined;
    user.otpExpiry = undefined;
    user.otpAttempts = 0;
  }

  static async verifyOtp(rawPhone: string, otp: string, name?: string, fcmToken?: string) {
    const phone = this.assertPhone(rawPhone);
    const user = await VendorUser.findOne({ phone }).select('+otpHash +otpExpiry +otpAttempts +fcmTokens');
    if (!user) throw badRequest('Please request an OTP first');
    this.assertActive(user);
    await this.checkOtp(user, phone, otp);

    user.phoneVerified = true;
    if (name && !user.name) user.name = name;
    this.touchLogin(user, 'otp', fcmToken);
    await user.save();
    return this.buildSession(user);
  }

  /**
   * Add / change the mobile number on a signed-in account (email sign-ups).
   * Verifies it by OTP so the "Phone verified" badge means something and
   * the vendor can later sign in with Mobile OTP too.
   */
  static async sendPhoneLinkOtp(vendorUserId: string, rawPhone: string) {
    const phone = this.assertPhone(rawPhone);
    const user = await VendorUser.findById(vendorUserId).select('+otpSentAt');
    if (!user) throw new VendorOsError(401, 'Session expired');
    const owner = await VendorUser.findOne({ phone, _id: { $ne: user._id } }).select('_id').lean();
    if (owner) throw new VendorOsError(409, 'This number is already registered with another VendorOS account', { code: 'PHONE_TAKEN' });
    if (user.otpSentAt && Date.now() - user.otpSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
      throw new VendorOsError(429, 'Please wait 30 seconds before requesting another OTP');
    }
    const otp = isDevelopment() ? '123456' : generateOTP(6);
    user.pendingPhone = phone;
    user.otpHash = hashOtp(`link:${phone}`, otp);
    user.otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    user.otpAttempts = 0;
    user.otpSentAt = new Date();
    await user.save();
    await SMSService.sendSMS(`+91${phone}`, `${otp} is your code to add this number to ApnaUtsav VendorOS.`);
    if (isDevelopment()) logger.info(`Vendor OS phone-link OTP for ${phone}: ${otp}`);
    return { message: 'OTP sent successfully' };
  }

  static async verifyPhoneLinkOtp(vendorUserId: string, otp: string) {
    const user = await VendorUser.findById(vendorUserId).select('+otpHash +otpExpiry +otpAttempts +pendingPhone');
    if (!user) throw new VendorOsError(401, 'Session expired');
    if (!user.pendingPhone) throw badRequest('Please request an OTP first');
    await this.checkOtp(user, `link:${user.pendingPhone}`, otp);
    user.phone = user.pendingPhone;
    user.pendingPhone = undefined;
    user.phoneVerified = true;
    try {
      await user.save();
    } catch (err: any) {
      if (err?.code === 11000) throw new VendorOsError(409, 'This number was just registered with another account', { code: 'PHONE_TAKEN' });
      throw err;
    }
    if (user.vendorId) {
      await WeddingVendor.updateOne({ _id: user.vendorId, phone: user.phone }, { $set: { 'verification.phone': true } });
    }
    return this.buildSession(user);
  }

  // -------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------

  static async buildSession(user: IVendorUser) {
    const vendor = user.vendorId
      ? await WeddingVendor.findById(user.vendorId).select(`${BASIC_PROFILE_SELECT} slug logo osPlan`).lean()
      : null;
    const onboarding = VendorOnboardingService.state(user, vendor as any);
    return {
      token: this.generateToken(user),
      refreshToken: this.generateRefreshToken(user),
      vendorUser: this.toPublicUser(user),
      vendor,
      onboarding,
      // Kept for older clients: true until the basic profile is complete.
      needsOnboarding: onboarding.nextStep !== 'dashboard',
    };
  }

  static toPublicUser(user: IVendorUser) {
    return {
      id: user._id,
      phone: user.phone,
      phoneVerified: user.phoneVerified,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      hasPassword: user.passwordHash === undefined ? undefined : Boolean(user.passwordHash),
      role: user.role,
      status: user.status,
      language: user.language,
      vendorId: user.vendorId,
    };
  }

  static payloadFor(user: IVendorUser): VendorTokenPayload {
    return {
      vendorUserId: String(user._id),
      vendorId: user.vendorId ? String(user.vendorId) : null,
      role: user.role,
      phone: user.phone,
      tv: user.tokenVersion || 0,
      typ: 'vendor_os',
    };
  }

  static generateToken(user: IVendorUser): string {
    return jwt.sign(this.payloadFor(user), vendorJwtSecret(), {
      expiresIn: process.env.VENDOR_JWT_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '1h',
      audience: AUDIENCE,
    } as jwt.SignOptions);
  }

  static generateRefreshToken(user: IVendorUser): string {
    return jwt.sign({ vendorUserId: String(user._id), tv: user.tokenVersion || 0, typ: 'vendor_os_refresh' }, vendorRefreshSecret(), {
      expiresIn: process.env.VENDOR_JWT_REFRESH_EXPIRES_IN || '30d',
      audience: AUDIENCE,
    } as jwt.SignOptions);
  }

  static async refresh(refreshToken: string) {
    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, vendorRefreshSecret(), { audience: AUDIENCE });
    } catch {
      throw new VendorOsError(401, 'Invalid refresh token');
    }
    if (decoded.typ !== 'vendor_os_refresh') throw new VendorOsError(401, 'Invalid refresh token');

    const user = await VendorUser.findById(decoded.vendorUserId);
    if (!user || user.status === 'disabled' || (decoded.tv ?? 0) !== (user.tokenVersion || 0)) {
      throw new VendorOsError(401, 'Invalid refresh token');
    }
    // Re-issued from the DB row, so role changes / new vendorId are picked up.
    const session = await this.buildSession(user);
    return { token: session.token, vendorUser: session.vendorUser, onboarding: session.onboarding };
  }

  static async me(vendorUserId: string) {
    const user = await VendorUser.findById(vendorUserId).select('+passwordHash');
    if (!user) throw new VendorOsError(401, 'Session expired');
    const { vendorUser, vendor, onboarding, needsOnboarding } = await this.buildSession(user);
    return { vendorUser, vendor, onboarding, needsOnboarding };
  }

  static async updateMe(vendorUserId: string, data: { name?: string; language?: 'en' | 'hi'; fcmToken?: string }) {
    const user = await VendorUser.findById(vendorUserId).select('+fcmTokens');
    if (!user) throw new VendorOsError(401, 'Session expired');
    if (data.name !== undefined) user.name = data.name;
    if (data.language) user.language = data.language;
    if (data.fcmToken && !user.fcmTokens.includes(data.fcmToken)) user.fcmTokens = [...user.fcmTokens.slice(-4), data.fcmToken];
    await user.save();
    return this.toPublicUser(user);
  }

  static async logout(vendorUserId: string, fcmToken?: string) {
    if (!fcmToken) return;
    await VendorUser.updateOne({ _id: vendorUserId }, { $pull: { fcmTokens: fcmToken } });
  }
}
