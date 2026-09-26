import { Request, Response } from 'express';
import { VendorAuthService } from '../../services/vendor-os/vendor-auth.service';
import { VendorOnboardingService } from '../../services/vendor-os/onboarding.service';
import { ApiResponse } from '../../utils/apiResponse';
import { handle } from '../../utils/vendorOs';
import { userIdOf } from './_context';

// Every sign-in path returns the same session:
//   { token, refreshToken, vendorUser, vendor, onboarding: { nextStep, missingFields, … } }
// Frontend rule: onboarding.nextStep === 'basic_profile' → profile page,
// 'dashboard' → dashboard. Re-check it from GET /auth/me on every app load.
export class VendorOsAuthController {
  // ---- email + password ------------------------------------------------
  static signup = handle(async (req: Request, res: Response) => {
    const session = await VendorAuthService.signup(req.body);
    ApiResponse.success(res, 201, { message: 'Account created. We have sent a verification link to your email.', data: session });
  }, 'signup');

  static login = handle(async (req: Request, res: Response) => {
    const { email, password, fcmToken } = req.body;
    ApiResponse.success(res, 200, { message: 'Signed in successfully', data: await VendorAuthService.login(email, password, fcmToken) });
  }, 'login');

  static forgotPassword = handle(async (req: Request, res: Response) => {
    const result = await VendorAuthService.forgotPassword(req.body.email);
    ApiResponse.success(res, 200, { message: result.message });
  }, 'forgot password');

  static resetPassword = handle(async (req: Request, res: Response) => {
    const session = await VendorAuthService.resetPassword(req.body.token, req.body.password);
    ApiResponse.success(res, 200, { message: "Password updated. You're signed in.", data: session });
  }, 'reset password');

  static changePassword = handle(async (req: Request, res: Response) => {
    const session = await VendorAuthService.changePassword(userIdOf(req), req.body);
    ApiResponse.success(res, 200, { message: 'Password updated. Other devices have been signed out.', data: session });
  }, 'change password');

  static verifyEmail = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Email verified', data: await VendorAuthService.verifyEmail(req.body.token) });
  }, 'verify email');

  static resendVerification = handle(async (req: Request, res: Response) => {
    const result = await VendorAuthService.resendVerification(userIdOf(req));
    ApiResponse.success(res, 200, { message: result.message });
  }, 'resend verification');

  // ---- "Email link" ------------------------------------------------------
  static requestEmailLink = handle(async (req: Request, res: Response) => {
    const result = await VendorAuthService.requestEmailLink(req.body.email);
    ApiResponse.success(res, 200, { message: result.message });
  }, 'email link');

  static verifyEmailLink = handle(async (req: Request, res: Response) => {
    const session = await VendorAuthService.verifyEmailLink(req.body.token, req.body.fcmToken);
    ApiResponse.success(res, 200, { message: 'Signed in successfully', data: session });
  }, 'verify email link');

  // ---- "Mobile OTP" ------------------------------------------------------
  static sendOtp = handle(async (req: Request, res: Response) => {
    const result = await VendorAuthService.sendOtp(req.body.phone);
    ApiResponse.success(res, 200, { message: result.message, data: { isNewUser: result.isNewUser } });
  }, 'send OTP');

  static verifyOtp = handle(async (req: Request, res: Response) => {
    const { phone, otp, name, fcmToken } = req.body;
    const session = await VendorAuthService.verifyOtp(phone, otp, name, fcmToken);
    ApiResponse.success(res, 200, { message: 'Signed in successfully', data: session });
  }, 'verify OTP');

  static sendPhoneLinkOtp = handle(async (req: Request, res: Response) => {
    const result = await VendorAuthService.sendPhoneLinkOtp(userIdOf(req), req.body.phone);
    ApiResponse.success(res, 200, { message: result.message });
  }, 'phone link OTP');

  static verifyPhoneLinkOtp = handle(async (req: Request, res: Response) => {
    const session = await VendorAuthService.verifyPhoneLinkOtp(userIdOf(req), req.body.otp);
    ApiResponse.success(res, 200, { message: 'Mobile number verified', data: session });
  }, 'verify phone link');

  // ---- session -----------------------------------------------------------
  static refresh = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Token refreshed', data: await VendorAuthService.refresh(req.body.refreshToken) });
  }, 'refresh token');

  static me = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorAuthService.me(userIdOf(req)) });
  }, 'me');

  static updateMe = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Profile updated', data: await VendorAuthService.updateMe(userIdOf(req), req.body) });
  }, 'update me');

  static registerPushToken = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Push notifications turned on for this device', data: await VendorAuthService.registerPushToken(userIdOf(req), req.body.token) });
  }, 'register push token');

  static removePushToken = handle(async (req: Request, res: Response) => {
    await VendorAuthService.removePushToken(userIdOf(req), req.body.token);
    ApiResponse.success(res, 200, { message: 'Push notifications turned off for this device' });
  }, 'remove push token');

  static logout = handle(async (req: Request, res: Response) => {
    await VendorAuthService.logout(userIdOf(req), req.body?.fcmToken);
    ApiResponse.success(res, 200, { message: 'Logged out successfully' });
  }, 'logout');

  // ---- basic profile (the gate) --------------------------------------------
  static getBasicProfile = handle(async (req: Request, res: Response) => {
    const { vendor, onboarding } = await VendorAuthService.me(userIdOf(req));
    ApiResponse.success(res, 200, { data: { vendor, onboarding } });
  }, 'get basic profile');

  /** Returns a fresh session: the token must now carry the vendorId. */
  static saveBasicProfile = handle(async (req: Request, res: Response) => {
    const user = await VendorOnboardingService.saveBasicProfile(userIdOf(req), req.body);
    const session = await VendorAuthService.buildSession(user);
    ApiResponse.success(res, 200, {
      message:
        session.onboarding.nextStep === 'dashboard'
          ? 'Profile saved — welcome to your dashboard'
          : `Profile saved. Still needed: ${session.onboarding.missingFields.join(', ')}`,
      data: session,
    });
  }, 'save basic profile');
}
