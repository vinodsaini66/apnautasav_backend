import nodemailer, { Transporter } from 'nodemailer';
import logger from '../utils/logger';
import { IVendorEnquiry } from '../models/vendor-enquiry.model';

// Mirrors sms.service.ts's pattern: if SMTP isn't configured, no-op and log
// instead of throwing, so the rest of the app never depends on email being
// set up. See vendor-enquiry.service.ts for why this is currently built but
// NOT called from the enquiry submission flow yet.
export class EmailService {
  private static transporter: Transporter | null =
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD
      ? nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: Number(process.env.SMTP_PORT) === 465,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          },
        })
      : null;

  /**
   * Generic send — never throws. Callers get a boolean back so a failed
   * email can never crash or block whatever triggered it.
   */
  static async sendMail(to: string, subject: string, html: string): Promise<boolean> {
    try {
      if (!this.transporter) {
        logger.warn(`SMTP not configured, email not sent to ${to} ("${subject}")`);
        return false;
      }

      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || 'noreply@apnautsav.com',
        to,
        subject,
        html,
      });

      logger.info(`Email sent to ${to}: "${subject}"`);
      return true;
    } catch (error) {
      logger.error(`Error sending email to ${to}:`, error);
      return false;
    }
  }

  /**
   * Acknowledgement email for a vendor's "Partner With Us" enquiry.
   * Ready to call, but NOT wired into the submission flow yet — see the
   * comment in vendor-enquiry.service.ts for how to turn it on once SMTP
   * credentials are actually configured.
   */
  static async sendVendorEnquiryAcknowledgement(enquiry: IVendorEnquiry): Promise<boolean> {
    return this.sendMail(
      enquiry.email,
      "We've received your enquiry — ApnaUtsav",
      vendorEnquiryAcknowledgementTemplate(enquiry)
    );
  }
}

function vendorEnquiryAcknowledgementTemplate(enquiry: IVendorEnquiry): string {
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#fff6ef;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fff6ef;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:520px;background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(200,30,74,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg,#7a1330,#c81e4a,#fb4d61);padding:32px 32px 28px;text-align:center;">
                <span style="display:inline-block;width:44px;height:44px;line-height:44px;border-radius:12px;background:rgba(255,255,255,0.18);color:#ffffff;font-size:20px;">&#9829;</span>
                <div style="margin-top:12px;font-size:22px;font-weight:bold;color:#ffffff;">
                  Apna<span style="color:#ffd88a;">Utsav</span>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 8px;">
                <p style="margin:0 0 4px;font-size:12px;font-weight:bold;letter-spacing:0.08em;color:#c81e4a;text-transform:uppercase;">Vendor partnership</p>
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1e1b1f;">Thanks for reaching out, ${escapeHtml(enquiry.name)}!</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4b4b52;">
                  We've received your enquiry for <strong>${escapeHtml(enquiry.businessName)}</strong> to partner with
                  ApnaUtsav as a <strong>${escapeHtml(enquiry.categoryName)}</strong> vendor. Our team will review the
                  details and connect with you soon.
                </p>
                <table role="presentation" width="100%" style="margin:20px 0;border-radius:14px;background-color:#fff6ef;">
                  <tr>
                    <td style="padding:16px 20px;font-size:13px;color:#6b6b72;">
                      <p style="margin:0 0 6px;"><strong style="color:#1e1b1f;">Business:</strong> ${escapeHtml(enquiry.businessName)}</p>
                      <p style="margin:0 0 6px;"><strong style="color:#1e1b1f;">Category:</strong> ${escapeHtml(enquiry.categoryName)}</p>
                      ${enquiry.city ? `<p style="margin:0 0 6px;"><strong style="color:#1e1b1f;">City:</strong> ${escapeHtml(enquiry.city)}</p>` : ''}
                      <p style="margin:0;"><strong style="color:#1e1b1f;">Your message:</strong> ${escapeHtml(enquiry.message)}</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b4b52;">
                  In the meantime, feel free to reply directly to this email if you'd like to add anything.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 32px;border-top:1px solid #f3e4de;">
                <p style="margin:0;font-size:12px;color:#9a9aa0;">
                  &copy; ${new Date().getFullYear()} ApnaUtsav &middot; This is an automated acknowledgement of your partnership enquiry.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
