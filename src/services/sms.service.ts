import twilio from 'twilio';
import logger from '../utils/logger';

// Twilio is optional until real credentials exist — .env.example ships
// placeholder values (e.g. "your_twilio_account_sid"), and those are
// present-but-fake, so a plain truthiness check on the env vars isn't
// enough to tell "configured" apart from "still a placeholder". Real
// Twilio Account SIDs always start with "AC", so that's what we actually
// gate on (mirrors the isFirebaseConfigured pattern in firebaseAdmin.ts).
export const isTwilioConfigured = !!(
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_ACCOUNT_SID.startsWith('AC') &&
  process.env.TWILIO_AUTH_TOKEN &&
  process.env.TWILIO_PHONE_NUMBER
);

export class SMSService {
  private static client = isTwilioConfigured
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

  static async sendSMS(to: string, message: string): Promise<boolean> {
    try {
      if (!this.client) {
        logger.warn('Twilio not configured (or still using placeholder credentials), SMS not sent');
        logger.info(`SMS to ${to}: ${message}`);
        return true;
      }

      const result = await this.client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: to
      });

      logger.info(`SMS sent to ${to}, SID: ${result.sid}`);
      return true;
    } catch (error) {
      logger.error('Error sending SMS:', error);
      return false;
    }
  }

  static async sendOTP(phoneNumber: string, otp: string): Promise<boolean> {
    const message = `Your Wedding Manager verification code is: ${otp}. Valid for 10 minutes.`;
    return this.sendSMS(phoneNumber, message);
  }
}