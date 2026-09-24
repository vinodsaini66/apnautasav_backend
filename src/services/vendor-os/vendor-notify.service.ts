import mongoose from 'mongoose';
import { VendorNotification, IVendorNotification } from '../../models/vendor-os/vendor-notification.model';
import { VendorActivity, VendorActivityType, IVendorActivity } from '../../models/vendor-os/vendor-activity.model';
import { VendorUser } from '../../models/vendor-os/vendor-user.model';
import { sendPushNotification } from '../../helpers/sendPushNotification';
import logger from '../../utils/logger';

type Id = mongoose.Types.ObjectId | string;

export class VendorNotifyService {
  /**
   * In-panel notification + best-effort FCM push to the vendor's owner and
   * managers (or one specific user). Never throws — a failed notification
   * must not fail the business action that triggered it.
   */
  static async notify(params: {
    vendorId: Id;
    type: string;
    title: string;
    body?: string;
    entityType?: IVendorNotification['entityType'];
    entityId?: Id;
    vendorUserId?: Id;
  }): Promise<void> {
    try {
      await VendorNotification.create(params);

      const recipients = await VendorUser.find(
        params.vendorUserId
          ? { _id: params.vendorUserId, status: 'active' }
          : { vendorId: params.vendorId, status: 'active', role: { $in: ['owner', 'manager'] } }
      )
        .select('+fcmTokens')
        .lean();
      const tokens = recipients.flatMap((r: any) => r.fcmTokens || []);
      if (tokens.length) {
        await sendPushNotification({
          tokens,
          title: params.title,
          body: params.body || '',
          data: {
            type: params.type,
            entityType: params.entityType || '',
            entityId: params.entityId ? String(params.entityId) : '',
          },
        }).catch((err) => logger.warn(`Vendor OS push skipped: ${err.message}`));
      }
    } catch (error) {
      logger.error('Vendor OS notify failed:', error);
    }
  }

  static async logActivity(params: {
    vendorId: Id;
    type: VendorActivityType;
    text?: string;
    leadId?: Id;
    bookingId?: Id;
    quoteId?: Id;
    clientId?: Id;
    channel?: IVendorActivity['channel'];
    direction?: IVendorActivity['direction'];
    templateKey?: string;
    messageStatus?: IVendorActivity['messageStatus'];
    meta?: Record<string, any>;
    createdBy?: Id;
  }) {
    try {
      return await VendorActivity.create(params);
    } catch (error) {
      logger.error('Vendor OS activity log failed:', error);
      return null;
    }
  }
}
