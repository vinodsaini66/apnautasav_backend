import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';
import { clearAuthCookie, setAuthCookie } from '../helpers/function';

export class AuthController {
  static async sendOTP(req: Request, res: Response): Promise<void> {
    try {
      const { phoneNumber } = req.body;

      const result = await AuthService.sendOTP(phoneNumber);

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