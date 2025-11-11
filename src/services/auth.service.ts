import jwt from 'jsonwebtoken';
import { User } from '../models/user.model';
import { generateOTP } from '../utils/generateCode';
import { TokenPayload } from '../types';
import logger from '../utils/logger';

export class AuthService {
  static async sendOTP(phoneNumber: string): Promise<{ success: boolean; message: string }> {
    try {
      const otp = generateOTP(6);
      const otpExpiry = new Date(Date.now() + parseInt(process.env.OTP_EXPIRY_MINUTES || '10') * 60 * 1000);

      let user = await User.findOne({ phoneNumber }).select('+otp +otpExpiry');

      if (user) {
        user.otp = otp;
        user.otpExpiry = otpExpiry;
        await user.save();
      } else {
        user = await User.create({
          phoneNumber,
          otp,
          otpExpiry,
          fullName: 'User', // Temporary name
          isVerified: false
        });
      }

      // TODO: Send OTP via Twilio/SMS service
      // For development, log the OTP
      logger.info(`OTP for ${phoneNumber}: ${otp}`);

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
    email?: string
  ): Promise<{ token: string; refreshToken: string; user: any }> {
    const user = await User.findOne({ phoneNumber }).select('+otp +otpExpiry');

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
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;

    await user.save();

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
    } as jwt.SignOptions );
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