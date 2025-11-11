import twilio from 'twilio';
import logger from '../utils/logger';

export class SMSService {
  private static client = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

  static async sendSMS(to: string, message: string): Promise<boolean> {
    try {
      if (!this.client) {
        logger.warn('Twilio not configured, SMS not sent');
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