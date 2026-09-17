import { Request, Response } from 'express';
import { AuthService, EmailNotVerifiedError } from '../services/auth.service';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';
import { clearAuthCookie, setAuthCookie } from '../helpers/function';

export class AuthController {
  // -------------------------------------------------------------------
  // Email + password auth (new flow, alongside the OTP flow below).
  // -------------------------------------------------------------------

  static async signup(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, fullName } = req.body;

      const result = await AuthService.signup(email, password, fullName);

      ApiResponse.success(res, 201, { message: result.message });
    } catch (error: any) {
      logger.error('Signup error:', error);
      ApiResponse.error(res, 400, error.message || 'Failed to create account');
    }
  }

  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      const result = await AuthService.login(email, password);

      setAuthCookie(res, result.token);

      ApiResponse.success(res, 200, {
        message: 'Logged in successfully',
        data: result
      });
    } catch (error: any) {
      if (error instanceof EmailNotVerifiedError) {
        logger.info(`Login blocked, email not verified: ${req.body?.email}`);
        ApiResponse.error(res, 403, error.message, { code: 'EMAIL_NOT_VERIFIED' });
        return;
      }
      logger.error('Login error:', error);
      ApiResponse.error(res, 401, error.message || 'Failed to log in');
    }
  }

  static async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.body;

      const result = await AuthService.verifyEmail(token);
      setAuthCookie(res, result.token);

      ApiResponse.success(res, 200, { message: result.message, data: result });
    } catch (error: any) {
      logger.error('Verify email error:', error);
      ApiResponse.error(res, 400, error.message || 'Failed to verify email');
    }
  }

  static async resendVerification(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      const result = await AuthService.resendVerificationEmail(email);

      ApiResponse.success(res, 200, { message: result.message });
    } catch (error: any) {
      logger.error('Resend verification error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to resend verification email');
    }
  }

  static async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      const result = await AuthService.forgotPassword(email);

      ApiResponse.success(res, 200, { message: result.message });
    } catch (error: any) {
      logger.error('Forgot password error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to process request');
    }
  }

  static async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const { token, password } = req.body;

      const result = await AuthService.resetPassword(token, password);
      setAuthCookie(res, result.token);

      ApiResponse.success(res, 200, { message: result.message, data: result });
    } catch (error: any) {
      logger.error('Reset password error:', error);
      ApiResponse.error(res, 400, error.message || 'Failed to reset password');
    }
  }

  // -------------------------------------------------------------------
  // OTP auth (existing flow — untouched, kept for future use).
  // -------------------------------------------------------------------

  static async sendOTP(req: Request, res: Response): Promise<void> {
    try {
      const { email} = req.body;

      const result = await AuthService.sendOTP(email);

      ApiResponse.success(res, 200, {
        message: result.message
      });
    } catch (error: any) {
      logger.error('Send OTP error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to send OTP');
    }
  }

  static async verifyOTP(req: Request, res: Response): Promise<void> {
    try {
      const { phoneNumber, otp, fullName, email, fcm_token } = req.body;

      const result = await AuthService.verifyOTP(phoneNumber, otp, fullName, email, fcm_token);

      setAuthCookie(res, result.token);

      ApiResponse.success(res, 200, {
        message: 'OTP verified successfully',
        data: result
      });
    } catch (error: any) {
      logger.error('Verify OTP error:', error);
      ApiResponse.error(res, 400, error.message || 'Failed to verify OTP');
    }
  }

  static async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        ApiResponse.error(res, 400, 'Refresh token is required');
        return;
      }

      const result = await AuthService.refreshToken(refreshToken);

      ApiResponse.success(res, 200, {
        message: 'Token refreshed successfully',
        data: result
      });
    } catch (error: any) {
      logger.error('Refresh token error:', error);
      ApiResponse.error(res, 401, error.message || 'Invalid refresh token');
    }
  }

  static async logout(req: Request, res: Response): Promise<void> {
    try {
      // In a real application, you might want to blacklist the token
      // or clear it from a token store 
      console.log(req);
      clearAuthCookie(res);

      ApiResponse.success(res, 200, {
        message: 'Logged out successfully'
      });
    } catch (error: any) {
      logger.error('Logout error:', error);
      ApiResponse.error(res, 500, 'Failed to logout');
    }
  }
}