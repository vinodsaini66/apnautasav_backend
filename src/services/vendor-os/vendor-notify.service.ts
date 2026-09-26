import mongoose from 'mongoose';
import { NOTIFICATION_CATEGORY_OF } from '../../constants/vendorOs';
import { VendorNotification, IVendorNotification } from '../../models/vendor-os/vendor-notification.model';
import { VendorActivity, VendorActivityType, IVendorActivity } from '../../models/vendor-os/vendor-activity.model';
import { VendorUser } from '../../models/vendor-os/vendor-user.model';
import { sendPushNotification } from '../../helpers/sendPushNotification';
import { isFirebaseConfigured } from '../../config/firebaseAdmin';
import { VENDOR_OS_PUBLIC_URL } from '../../utils/vendorOs';
import { emitToVendor } from './vendor-realtime';
import logger from '../../utils/logger';

type Id = mongoose.Types.ObjectId | string;

/** Panel page a notification opens (in-app click and push click). */
export const notificationLink = (entityType?: string, entityId?: Id): string => {
  const id = entityId ? String(entityId) : '';
  switch (entityType) {
    case 'lead':
      return id ? `/leads?lead=${id}` : '/leads';
    case 'quote':
      return id ? `/quotes?quote=${id}` : '/quotes';
    case 'booking':
      return id ? `/bookings?booking=${id}` : '/bookings';
    case 'payment':
      return '/payments';
    case 'profile':
      return '/profile';
    case 'crew_assignment':
      return '/my-work';
    default:
      return '/dashboard';
  }
};

// FCM error codes that mean the device token is gone for good.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export interface NotifyResult {
  notificationId?: string;
  /** Open panel tabs that received it live. */
  live: number;
  push: { configured: boolean; devices: number; sent: number; failed: number; removed: number };
}

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
  }): Promise<NotifyResult> {
    const result: NotifyResult = { live: 0, push: { configured: isFirebaseConfigured, devices: 0, sent: 0, failed: 0, removed: 0 } };
    try {
      const doc = await VendorNotification.create(params);
      result.notificationId = String(doc._id);
      const url = notificationLink(params.entityType, params.entityId);

      // Live: bell + toast in every open panel tab of the recipients.
      result.live = emitToVendor(
        { vendorId: String(params.vendorId), vendorUserId: params.vendorUserId ? String(params.vendorUserId) : null },
        'notification',
        {
          _id: String(doc._id),
          type: doc.type,
          title: doc.title,
          body: doc.body,
          entityType: doc.entityType,
          entityId: doc.entityId ? String(doc.entityId) : undefined,
          url,
          read: false,
          createdAt: doc.createdAt,
        }
      );

      const recipients = await VendorUser.find(
        params.vendorUserId
          ? { _id: params.vendorUserId, status: 'active' }
          : { vendorId: params.vendorId, status: 'active', role: { $in: ['owner', 'manager'] } }
      )
        .select('+fcmTokens')
        .lean();
      // Settings → Notifications: skip push for people who switched this category off.
      const category = NOTIFICATION_CATEGORY_OF[params.type];
      const tokens = [
        ...new Set(
          recipients
            .filter((r: any) => !category || r.notificationPrefs?.[category]?.push !== false)
            .flatMap((r: any) => r.fcmTokens || []) as string[]
        ),
      ];
      result.push.devices = tokens.length;
      if (tokens.length && isFirebaseConfigured) {
        const link = `${VENDOR_OS_PUBLIC_URL}${url}`;
        const res = await sendPushNotification({
          tokens,
          title: params.title,
          body: params.body || '',
          // Everything the panel's service worker needs to draw and route
          // the notification itself (public/sw.js), as FCM data strings.
          data: {
            type: params.type,
            entityType: params.entityType || '',
            entityId: params.entityId ? String(params.entityId) : '',
            notificationId: String(doc._id),
            url,
          },
          webpush: {
            notification: {
              icon: `${VENDOR_OS_PUBLIC_URL}/icons/icon-192.png`,
              badge: `${VENDOR_OS_PUBLIC_URL}/icons/badge-72.png`,
              // One visible notification per record: a newer update replaces it.
              tag: `${params.type}:${params.entityId ? String(params.entityId) : doc._id}`,
              renotify: true,
            },
            fcmOptions: { link },
            headers: { Urgency: 'high', TTL: String(24 * 3600) },
          },
        }).catch((err) => {
          logger.warn(`Vendor OS push skipped: ${err.message}`);
          return null;
        });
        if (res) {
          result.push.sent = res.successCount;
          result.push.failed = res.failureCount;
          const dead = res.responses
            .map((r, i) => (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code) ? tokens[i] : null))
            .filter((t): t is string => !!t);
          if (dead.length) {
            await VendorUser.updateMany({ fcmTokens: { $in: dead } }, { $pull: { fcmTokens: { $in: dead } } });
            result.push.removed = dead.length;
          }
        }
      }
    } catch (error) {
      logger.error('Vendor OS notify failed:', error);
    }
    return result;
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
