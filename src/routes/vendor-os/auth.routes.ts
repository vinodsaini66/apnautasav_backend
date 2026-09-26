import { Router } from 'express';
import { VendorOsAuthController as C } from '../../controllers/vendor-os/auth.controller';
import { vendorAuth } from '../../middleware/vendor-auth.middleware';
import { authRateLimiter } from '../../middleware/rateLimit.middleware';
import { validate } from '../../middleware/validation.middleware';
import {
  basicProfileSchema,
  changePasswordSchema,
  emailOnlySchema,
  loginSchema,
  phoneLinkSchema,
  phoneLinkVerifySchema,
  refreshSchema,
  resetPasswordSchema,
  sendOtpSchema,
  signupSchema,
  tokenSchema,
  updateMeSchema,
  verifyOtpSchema,
} from '../../validators/vendor-os.validator';

// /vendor-os/auth — VendorOS sign in / sign up. Separate from /auth (the
// family app) by design; see vendor-auth.service.ts.
const router: Router = Router();

/**
 * @swagger
 * tags:
 *   - name: Vendor OS Auth
 *     description: >
 *       VendorOS login screen. Every sign-in returns { token, refreshToken, vendorUser, vendor, onboarding }.
 *       Route on onboarding.nextStep — 'basic_profile' (send to the profile page, every time, until complete) or 'dashboard'.
 * /vendor-os/auth/signup:
 *   post:
 *     summary: Sign Up tab — business name + email + password (signs in immediately, sends a verification email)
 *     tags: [Vendor OS Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [businessName, email, password], properties: { businessName: { type: string }, email: { type: string }, password: { type: string, minLength: 8 } } }
 *     responses:
 *       201: { description: Account created — session with onboarding.nextStep = basic_profile }
 *       409: { description: EMAIL_TAKEN }
 * /vendor-os/auth/login:
 *   post:
 *     summary: Sign In tab — email + password
 *     tags: [Vendor OS Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [email, password], properties: { email: { type: string }, password: { type: string } } }
 *     responses:
 *       200: { description: Session }
 *       401: { description: INVALID_CREDENTIALS }
 * /vendor-os/auth/email-link:
 *   post:
 *     summary: '"Email link" button — emails a one-time 15-minute login link (creates the account for a new email)'
 *     tags: [Vendor OS Auth]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [email], properties: { email: { type: string } } }
 *     responses:
 *       200: { description: Link sent }
 * /vendor-os/auth/email-link/verify:
 *   post:
 *     summary: Exchange the token from the email link for a session
 *     tags: [Vendor OS Auth]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [token], properties: { token: { type: string }, fcmToken: { type: string } } }
 *     responses:
 *       200: { description: Session }
 *       400: { description: Invalid or expired link }
 * /vendor-os/auth/send-otp:
 *   post:
 *     summary: '"Mobile OTP" button — send OTP (always 123456 when NODE_ENV=development)'
 *     tags: [Vendor OS Auth]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [phone], properties: { phone: { type: string, example: '9876543210' } } }
 *     responses:
 *       200: { description: "{ isNewUser }" }
 *       429: { description: Resend cooldown (30 s) }
 * /vendor-os/auth/verify-otp:
 *   post:
 *     summary: Verify OTP → session
 *     tags: [Vendor OS Auth]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [phone, otp], properties: { phone: { type: string }, otp: { type: string, example: '123456' }, name: { type: string }, fcmToken: { type: string } } }
 *     responses:
 *       200: { description: Session }
 *       400: { description: Wrong or expired OTP }
 * /vendor-os/auth/basic-profile:
 *   put:
 *     summary: Save the basic profile (business name, category, city, contact mobile, contact person). Returns a fresh session.
 *     tags: [Vendor OS Auth]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { businessName: { type: string }, osCategory: { type: string, example: photography }, city: { type: string }, state: { type: string }, contactPerson: { type: string }, phone: { type: string }, whatsappNumber: { type: string }, email: { type: string }, subTags: { type: array, items: { type: string } } } }
 *     responses:
 *       200: { description: "Session; onboarding.missingFields lists what is still needed" }
 *   get:
 *     summary: "The basic profile and onboarding state ({ vendor, onboarding })"
 *     tags: [Vendor OS Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 * /vendor-os/auth/onboarding:
 *   post:
 *     summary: "Old single-step onboarding; same body and behaviour as PUT /auth/basic-profile"
 *     tags: [Vendor OS Auth]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { businessName: { type: string }, osCategory: { type: string, example: photography }, city: { type: string }, state: { type: string }, contactPerson: { type: string }, phone: { type: string }, whatsappNumber: { type: string }, email: { type: string }, subTags: { type: array, items: { type: string } } } }
 *     responses:
 *       200: { description: Session }
 * /vendor-os/auth/forgot-password:
 *   post:
 *     summary: "Email a password-reset link (always 200, so emails cannot be probed)"
 *     tags: [Vendor OS Auth]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [email], properties: { email: { type: string } } }
 *     responses:
 *       200: { description: OK }
 * /vendor-os/auth/reset-password:
 *   post:
 *     summary: "Set a new password with the emailed token; returns a session"
 *     tags: [Vendor OS Auth]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [token, password], properties: { token: { type: string, description: 64 hex characters }, password: { type: string, minLength: 8 } } }
 *     responses:
 *       200: { description: Session }
 *       400: { description: Invalid or expired link }
 * /vendor-os/auth/verify-email:
 *   post:
 *     summary: "Verify the email address with the emailed token"
 *     tags: [Vendor OS Auth]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [token], properties: { token: { type: string } } }
 *     responses:
 *       200: { description: OK }
 * /vendor-os/auth/refresh-token:
 *   post:
 *     summary: "Exchange a refresh token for a new token pair"
 *     tags: [Vendor OS Auth]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [refreshToken], properties: { refreshToken: { type: string } } }
 *     responses:
 *       200: { description: Session }
 *       401: { description: Invalid refresh token }
 * /vendor-os/auth/me:
 *   get:
 *     summary: "The signed-in user, business and onboarding state"
 *     tags: [Vendor OS Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 * /vendor-os/auth/logout:
 *   post:
 *     summary: "Sign out (revokes the refresh token and FCM token)"
 *     tags: [Vendor OS Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 * /vendor-os/auth/resend-verification:
 *   post:
 *     summary: "Send the email verification link again"
 *     tags: [Vendor OS Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 * /vendor-os/auth/change-password:
 *   post:
 *     summary: "Change (or set, for OTP-only accounts) the password; other devices are signed out"
 *     tags: [Vendor OS Auth]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [newPassword], properties: { currentPassword: { type: string }, newPassword: { type: string, minLength: 8 } } }
 *     responses:
 *       200: { description: Session }
 * /vendor-os/auth/phone/send-otp:
 *   post:
 *     summary: "Send an OTP to add / verify a mobile number on this account"
 *     tags: [Vendor OS Auth]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [phone], properties: { phone: { type: string } } }
 *     responses:
 *       200: { description: OK }
 * /vendor-os/auth/phone/verify:
 *   post:
 *     summary: "Verify the mobile OTP; returns a fresh session"
 *     tags: [Vendor OS Auth]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [otp], properties: { otp: { type: string, example: '123456' } } }
 *     responses:
 *       200: { description: Session }
 */

// ---- email + password ------------------------------------------------------
router.post('/signup', authRateLimiter, validate(signupSchema), C.signup);
router.post('/login', authRateLimiter, validate(loginSchema), C.login);
router.post('/forgot-password', authRateLimiter, validate(emailOnlySchema), C.forgotPassword);
router.post('/reset-password', authRateLimiter, validate(resetPasswordSchema), C.resetPassword);
router.post('/verify-email', validate(tokenSchema), C.verifyEmail);

// ---- "Email link" ------------------------------------------------------------
router.post('/email-link', authRateLimiter, validate(emailOnlySchema), C.requestEmailLink);
router.post('/email-link/verify', authRateLimiter, validate(tokenSchema), C.verifyEmailLink);

// ---- "Mobile OTP" ------------------------------------------------------------
router.post('/send-otp', authRateLimiter, validate(sendOtpSchema), C.sendOtp);
router.post('/verify-otp', authRateLimiter, validate(verifyOtpSchema), C.verifyOtp);

// ---- session ---------------------------------------------------------------
router.post('/refresh-token', validate(refreshSchema), C.refresh);
router.get('/me', vendorAuth, C.me);
/**
 * @swagger
 * /vendor-os/auth/me:
 *   patch:
 *     summary: Update my name, language or notification preferences (Settings)
 *     tags: [Vendor OS Profile & Team]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               language: { type: string, enum: [en, hi] }
 *               notificationPrefs:
 *                 type: object
 *                 description: "Per category (leads, followUps, quotes, payments, bookings, crew): { push, whatsapp }. Push off skips FCM for that category; merged per key."
 *                 example: { quotes: { push: false } }
 *     responses: { 200: { description: My user } }
 */
router.patch('/me', vendorAuth, validate(updateMeSchema), C.updateMe);
router.post('/logout', vendorAuth, C.logout);
router.post('/resend-verification', vendorAuth, C.resendVerification);
router.post('/change-password', vendorAuth, validate(changePasswordSchema), C.changePassword);
router.post('/phone/send-otp', vendorAuth, validate(phoneLinkSchema), C.sendPhoneLinkOtp);
router.post('/phone/verify', vendorAuth, validate(phoneLinkVerifySchema), C.verifyPhoneLinkOtp);

// ---- basic profile (the dashboard gate) ------------------------------------
router.get('/basic-profile', vendorAuth, C.getBasicProfile);
router.put('/basic-profile', vendorAuth, validate(basicProfileSchema), C.saveBasicProfile);
// Older name for the same step.
router.post('/onboarding', vendorAuth, validate(basicProfileSchema), C.saveBasicProfile);

export default router;
