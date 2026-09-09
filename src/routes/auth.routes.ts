import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { validate } from '../middleware/validation.middleware';
import {
  sendOtpSchema,
  verifyOtpSchema,
  signupSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema
} from '../validators/auth.validator';
// import { authRateLimiter } from '../middleware/rateLimit.middleware';

const router: Router = Router();

/**
 * @swagger
 * /auth/signup:
 *   post:
 *     summary: Create an account with email + password (sends a verification email)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - email
 *               - password
 *             properties:
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: Account created, verification email sent
 */
router.post('/signup', validate(signupSchema), AuthController.signup);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in with email + password (requires a verified email)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logged in successfully
 *       403:
 *         description: Email not verified yet
 */
router.post('/login', validate(loginSchema), AuthController.login);

/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     summary: Verify an account's email address using the token from the verification email link
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email verified successfully
 */
router.post('/verify-email', validate(verifyEmailSchema), AuthController.verifyEmail);

/**
 * @swagger
 * /auth/resend-verification:
 *   post:
 *     summary: Resend the email verification link
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Verification email resent (if applicable)
 */
router.post('/resend-verification', validate(resendVerificationSchema), AuthController.resendVerification);

/**
 * @swagger
 * /auth/send-otp:
 *   post:
 *     summary: Send OTP to phone number
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *             properties:
 *               phoneNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP sent successfully
 */
router.post('/send-otp', 
    // authRateLimiter,
     validate(sendOtpSchema), AuthController.sendOTP);

/**
 * @swagger
 * /auth/verify-otp:
 *   post:
 *     summary: Verify OTP and login/register
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - otp
 *             properties:
 *               phoneNumber:
 *                 type: string
 *               otp:
 *                 type: string
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP verified successfully
 */
router.post('/verify-otp', 
    // authRateLimiter,
     validate(verifyOtpSchema), AuthController.verifyOTP);

router.post('/refresh-token', AuthController.refreshToken);
router.post('/logout', AuthController.logout);

export default router;