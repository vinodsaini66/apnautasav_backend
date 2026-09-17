import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from '../models/user.model';
import { generateInvitationCode, generateOTP, generateVerificationToken } from '../utils/generateCode';
import { TokenPayload } from '../types';
import logger from '../utils/logger';
import collaborationInvitation from '../models/collaborationInvitation';
import { Collaborator } from '../models/collaborator.model';
import { EmailService } from './email.service';

const EMAIL_VERIFICATION_EXPIRY_HOURS = 24;
const PASSWORD_RESET_EXPIRY_HOURS = 1;
const FRONTEND_BASE_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');

// Thrown by login() when credentials are correct but the account's email
// hasn't been verified yet — the controller maps this to a 403 with a
// machine-readable code so the frontend can offer "Resend verification
// email" instead of a generic error.
export class EmailNotVerifiedError extends Error {
  constructor() {
    super('Please verify your email address before logging in');
    this.name = 'EmailNotVerifiedError';
  }
}

export class AuthService {
  // ---------------------------------------------------------------------
  // Email + password auth (new flow). The OTP flow below is kept as-is and
  // still works — this is an additional flow, not a replacement.
  // ---------------------------------------------------------------------

  private static async createAndSendVerification(user: any, fullName: string): Promise<void> {
    const token = generateVerificationToken();
    user.emailVerificationToken = token;
    user.emailVerificationTokenExpiry = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000);
    await user.save();

    const verificationLink = `${FRONTEND_BASE_URL}/auth/verify-email?token=${token}`;
    await EmailService.sendVerificationEmail(user.email, fullName, verificationLink);
  }

  static async signup(email: string, password: string, fullName: string): Promise<{ message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    let user = await User.findOne({ email: normalizedEmail }).select('+password +isVerified');

    if (user && user.password && user.isVerified) {
      throw new Error('An account with this email already exists. Please log in instead.');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    if (user) {
      // Account exists but was never completed (e.g. started via OTP flow,
      // or signed up before but never clicked the verification link) —
      // update it in place rather than failing on the unique email index.
      user.password = passwordHash;
      user.fullName = fullName;
      user.isVerified = false;
    } else {
      user = new User({
        email: normalizedEmail,
        password: passwordHash,
        fullName,
        isVerified: false
      });
    }

    await this.createAndSendVerification(user, fullName);

    return { message: 'Account created. Please check your email to verify your address.' };
  }

  static async login(email: string, password: string): Promise<{ token: string; refreshToken: string; user: any }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select('+password');

    if (!user || !user.password) {
      throw new Error('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new Error('Invalid email or password');
    }

    if (!user.isVerified) {
      throw new EmailNotVerifiedError();
    }

    const token = this.generateToken(user);
    const refreshToken = this.generateRefreshToken(user);

    return {
      token,
      refreshToken,
      user: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      }
    };
  }

  /**
   * Verifying also logs the user in (returns a token, like login()) — the
   * link click already proved they own the inbox tied to this account, so
   * there's no extra security value in making them re-type their password
   * a second time right after.
   */
  static async verifyEmail(token: string): Promise<{ message: string; token: string; refreshToken: string; user: any }> {
    const user = await User.findOne({ emailVerificationToken: token })
      .select('+emailVerificationToken +emailVerificationTokenExpiry');

    if (!user || !user.emailVerificationTokenExpiry) {
      throw new Error('Invalid or expired verification link');
    }

    if (new Date() > user.emailVerificationTokenExpiry) {
      throw new Error('This verification link has expired. Please request a new one.');
    }

    user.isVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationTokenExpiry = undefined;
    await user.save();

    return {
      message: "Email verified successfully. You're signed in.",
      token: this.generateToken(user),
      refreshToken: this.generateRefreshToken(user),
      user: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      }
    };
  }

  /**
   * Always returns the same generic message regardless of whether the
   * email exists — same privacy reasoning as resendVerificationEmail below
   * (don't let this endpoint be used to enumerate registered accounts).
   */
  static async forgotPassword(email: string): Promise<{ message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const genericMessage = "If an account with that email exists, we've sent a link to reset the password.";

    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    // No-op for an OTP-only (password-less) account too — there's no
    // password on file for a reset link to replace.
    if (!user || !user.password) {
      return { message: genericMessage };
    }

    const token = generateVerificationToken();
    user.passwordResetToken = token;
    user.passwordResetTokenExpiry = new Date(Date.now() + PASSWORD_RESET_EXPIRY_HOURS * 60 * 60 * 1000);
    await user.save();

    const resetLink = `${FRONTEND_BASE_URL}/auth/reset-password?token=${token}`;
    await EmailService.sendPasswordResetEmail(user.email, user.fullName, resetLink);

    return { message: genericMessage };
  }

  /**
   * Resetting also logs the user in (returns a token, like login()/
   * verifyEmail() above) — matches the "Save and sign in" button copy on
   * the reset-password page.
   */
  static async resetPassword(token: string, newPassword: string): Promise<{ message: string; token: string; refreshToken: string; user: any }> {
    const user = await User.findOne({ passwordResetToken: token })
      .select('+passwordResetToken +passwordResetTokenExpiry +password');

    if (!user || !user.passwordResetTokenExpiry) {
      throw new Error('This reset link is invalid or has already been used.');
    }

    if (new Date() > user.passwordResetTokenExpiry) {
      throw new Error('This reset link has expired. Please request a new one.');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordResetToken = undefined;
    user.passwordResetTokenExpiry = undefined;
    // A password-reset link proves the same inbox ownership signup's
    // verification link does — flip isVerified too so an account that
    // somehow never finished verifying isn't left permanently unable to
    // log in after a legitimate reset.
    user.isVerified = true;
    await user.save();

    return {
      message: "Password updated. You're signed in.",
      token: this.generateToken(user),
      refreshToken: this.generateRefreshToken(user),
      user: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      }
    };
  }

  static async resendVerificationEmail(email: string): Promise<{ message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const genericMessage = 'If an account with that email exists and needs verification, a new link has been sent.';

    const user = await User.findOne({ email: normalizedEmail }).select('+password +isVerified');

    // Don't reveal whether the email exists, and don't resend for an
    // already-verified or password-less (OTP-only) account.
    if (!user || !user.password || user.isVerified) {
      return { message: genericMessage };
    }

    await this.createAndSendVerification(user, user.fullName);

    return { message: genericMessage };
  }

  // ---------------------------------------------------------------------
  // OTP auth (existing flow — untouched, kept for future use).
  // ---------------------------------------------------------------------

  static async sendOTP(email: string): Promise<{ success: boolean; message: string }> {
    try {
      const otp = process.env.NODE_ENV === 'development'
        ? '123456'
        : generateOTP(6);

      const otpExpiry = new Date(Date.now() + parseInt(process.env.OTP_EXPIRY_MINUTES || '10') * 60 * 1000);

      let user = await User.findOne({ email }).select('+otp +otpExpiry');

      if (user) {
        user.otp = otp;
        user.otpExpiry = otpExpiry;
        await user.save();
      } else {
        user = await User.create({
          email,
          otp,
          otpExpiry,
          fullName: 'User', // Temporary name
          isVerified: false
        });
      }

      // TODO: Send OTP via Twilio/SMS service
      // For development, log the OTP
      logger.info(`OTP for ${email}: ${otp}`);

      // In production, use Twilio or similar service
      // await this.sendSMS(phoneNumber, `Your wedding manager OTP is: ${otp}`);

      return {
        success: true,
        message: 'OTP sent successfully'
      };
    } catch (error) {
      logger.error('Error sending OTP:', error);
      throw error;
    }
  }

  static async verifyOTP(
    phoneNumber: string,
    otp: string,
    fullName?: string,
    email?: string,
    fcm_token?: string
  ): Promise<{ token: string; refreshToken: string; user: any }> {
    const user = await User.findOne({ email }).select('+otp +otpExpiry');

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.otp || !user.otpExpiry) {
      throw new Error('No OTP found for this user');
    }

    if (user.otp !== otp) {
      throw new Error('Invalid OTP');
    }

    if (new Date() > user.otpExpiry) {
      throw new Error('OTP has expired');
    }

    // Update user details if provided
    if (fullName) user.fullName = fullName;
    if (email) user.email = email;
    if (phoneNumber) user.phoneNumber = phoneNumber;
    if (fcm_token) user.fcm_token = fcm_token;

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;

    await user.save();

    if (email) {
      const invitations = await collaborationInvitation.find({
        email,
      });
      if (invitations.length > 0) {
        invitations.forEach(async (invitation) => {
          const invitationCode = generateInvitationCode();
          await Collaborator.create({
            weddingId: invitation.weddingId,
            name: fullName,
            userId: user._id,
            role: invitation.role,
            invitedBy: invitation.invitedBy,
            invitationCode,
            invitationStatus: 'pending'
          });
          await collaborationInvitation.findByIdAndDelete(invitation._id);
        });
      }
    }

    const token = this.generateToken(user);
    const refreshToken = this.generateRefreshToken(user);

    return {
      token,
      refreshToken,
      user: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      }
    };
  }

  static generateToken(user: any): string {
    const payload: TokenPayload = {
      userId: user._id.toString(),
      phoneNumber: user.phoneNumber,
      role: user.role
    };

    return jwt.sign(payload, process.env.JWT_SECRET as string, {
      expiresIn: (process.env.JWT_EXPIRES_IN || '1h') as string
    } as jwt.SignOptions);
  }

  static generateRefreshToken(user: any): string {
    const payload: TokenPayload = {
      userId: user._id.toString(),
      phoneNumber: user.phoneNumber,
      role: user.role
    };

    return jwt.sign(
      payload,
      process.env.JWT_REFRESH_SECRET || 'default_secret',
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' } as jwt.SignOptions
    );
  }

  static async refreshToken(refreshToken: string): Promise<{ token: string }> {
    try {
      const decoded = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET as string
      ) as TokenPayload;

      const user = await User.findById(decoded.userId);

      if (!user) {
        throw new Error('User not found');
      }

      const newToken = this.generateToken(user);

      return { token: newToken };
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }
}