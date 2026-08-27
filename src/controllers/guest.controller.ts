import { Request, Response } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { Guest } from '../models/guest.model';
import { Wedding } from '../models/wedding.model';
import { ApiResponse } from '../utils/apiResponse';
import { ActivityService } from '../services/activity.service';
import { NotificationService } from '../services/notification.service';
import { SMSService } from '../services/sms.service';
import { EmailService } from '../services/email.service';
import { sendExport, ExportColumn } from '../services/export.service';
import { ensurePublicSlug } from '../utils/generateCode';
import { renderTemplate } from '../utils/template.util';
import logger from '../utils/logger';
import { getSocketServer } from '../config/socket';

const GUEST_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'phoneNumber', label: 'Phone' },
  { key: 'category', label: 'Category' },
  { key: 'rsvpStatus', label: 'RSVP Status' },
  { key: 'plusOne', label: 'Plus One' },
  { key: 'isVIP', label: 'VIP' }
];

// Base URL for guest-facing RSVP links (#2 + #7's compose/send and the
// rsvpLink field on the guest read paths). No FRONTEND_URL-style env var
// existed anywhere in this codebase yet, so one is introduced here (see
// .env.example) with a sensible local-dev fallback, following the
// NEXT_PUBLIC_API_URL-in-reverse convention the frontend already uses.
const FRONTEND_BASE_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');

const buildRsvpLink = (publicSlug: string, rsvpToken: string): string =>
  `${FRONTEND_BASE_URL}/w/${publicSlug}?rsvp=${rsvpToken}`;

/**
 * Attaches a working rsvpLink to a guest document, generating and
 * PERSISTING an rsvpToken first if one doesn't exist yet.
 *
 * The token is deliberately not lazy-only-on-compose: a guest's per-row
 * "Send via WhatsApp" action (frontend, entirely client-side, no backend
 * call) needs a real rsvpLink available the moment a guest is created or
 * fetched — not just after the bulk composer has sent them something —
 * otherwise a guest's very first WhatsApp invite would carry a blank
 * RSVP link. "Generated on first send or on demand" (the data-model
 * plan) covers this: this IS the "on demand" path, composeAndSend's own
 * inline generation is now just a defensive fallback for the same case.
 */
async function attachRsvpLink(
  guest: InstanceType<typeof Guest>
): Promise<Record<string, any> & { rsvpLink?: string }> {
  if (!guest.rsvpToken) {
    guest.rsvpToken = crypto.randomBytes(24).toString('hex');
    await guest.save();
  }

  const wedding = await Wedding.findById(guest.weddingId).select('publicSlug brideName groomName');
  if (!wedding) return { ...guest.toObject(), rsvpLink: undefined };

  const publicSlug = await ensurePublicSlug(wedding);
  return { ...guest.toObject(), rsvpLink: buildRsvpLink(publicSlug, guest.rsvpToken) };
}

export class GuestController {
  static async createGuest(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const userId = req.user?.userId;
      const guestData = req.body;

      const guest = await Guest.create({
        ...guestData,
        weddingId,
        addedBy: userId
      });

      // Log activity
      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'created',
        entityType: 'guest',
        entityId: String(guest._id),
        entityName: `${guest.name}`,
        description: `Added guest: ${guest.name}`
      });

      const socketServer = getSocketServer();
      socketServer.emitToWedding(weddingId, 'guest:added', {
        guest: {
          id: guest._id,
          name: guest.name,
          category: guest.category,
          rsvpStatus: guest.rsvpStatus
        },
        addedBy: userId,
        timestamp: new Date()
      });

      const guestWithLink = await attachRsvpLink(guest);

      ApiResponse.success(res, 201, {
        message: 'Guest added successfully',
        data: guestWithLink
      });
    } catch (error: any) {
      logger.error('Create guest error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to add guest');
    }
  }

  static async getGuests(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const { page = 1, limit = 50, category, rsvpStatus, search, eventId } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const filter: any = { weddingId };

      if (category) filter.category = category;
      if (rsvpStatus) filter.rsvpStatus = rsvpStatus;
      if (eventId) filter.eventIds = eventId;
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      const guests = await Guest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

      const total = await Guest.countDocuments(filter);

      // Batch rsvpLink computation: fetch/ensure the wedding's publicSlug at
      // most once per page, and generate+persist an rsvpToken for any guest
      // on this page that doesn't have one yet — a guest's rsvpLink must be
      // available the moment they're listed (not only after a compose/send
      // or an individual create/update touches them), since the per-row
      // WhatsApp action depends on it. Only the (usually small) set of
      // guests actually missing a token pay for an extra write.
      let guestsWithLinks = guests.map((g) => ({ ...g, rsvpLink: undefined as string | undefined }));

      if (guests.length > 0) {
        const wedding = await Wedding.findById(weddingId).select('publicSlug brideName groomName');
        if (wedding) {
          const publicSlug = await ensurePublicSlug(wedding);

          const missingToken = guests.filter((g) => !g.rsvpToken);
          if (missingToken.length > 0) {
            const generated = missingToken.map((g) => ({
              _id: g._id,
              rsvpToken: crypto.randomBytes(24).toString('hex')
            }));
            await Promise.all(
              generated.map(({ _id, rsvpToken }) => Guest.updateOne({ _id }, { $set: { rsvpToken } }))
            );
            const tokenById = new Map(generated.map((g) => [String(g._id), g.rsvpToken]));
            guests.forEach((g) => {
              if (!g.rsvpToken) g.rsvpToken = tokenById.get(String(g._id));
            });
          }

          guestsWithLinks = guests.map((g) => ({
            ...g,
            rsvpLink: g.rsvpToken ? buildRsvpLink(publicSlug, g.rsvpToken) : undefined
          }));
        }
      }

      ApiResponse.paginated(res, guestsWithLinks, Number(page), Number(limit), total);
    } catch (error: any) {
      logger.error('Get guests error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch guests');
    }
  }

  static async updateGuest(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, guestId } = req.params;
      const userId = req.user?.userId;
      const updateData = req.body;

      const previousGuest = updateData.rsvpStatus
        ? await Guest.findOne({ _id: guestId, weddingId }).select('rsvpStatus').lean()
        : null;

      const guest = await Guest.findOneAndUpdate(
        { _id: guestId, weddingId },
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!guest) {
        ApiResponse.error(res, 404, 'Guest not found');
        return;
      }

      // Log activity
      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'updated',
        entityType: 'guest',
        entityId: String(guest._id),
        entityName: `${guest.name}`,
        description: `Updated guest: ${guest.name}`
      });

      // Notify the rest of the wedding team when an RSVP actually changed —
      // guarded separately so a notification failure never blocks the
      // update itself from succeeding.
      if (previousGuest && previousGuest.rsvpStatus !== guest.rsvpStatus) {
        try {
          const recipientIds = await NotificationService.getWeddingRecipientIds(weddingId, userId);
          if (recipientIds.length > 0) {
            await NotificationService.notifyGuestRSVP(weddingId, recipientIds, guest.name, guest.rsvpStatus);
          }
        } catch (notifyError) {
          logger.warn('Failed to send guest RSVP notification:', notifyError);
        }
      }

      const guestWithLink = await attachRsvpLink(guest);

      ApiResponse.success(res, 200, {
        message: 'Guest updated successfully',
        data: guestWithLink
      });
    } catch (error: any) {
      logger.error('Update guest error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to update guest');
    }
  }

  static async deleteGuest(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, guestId } = req.params;
      const userId = req.user?.userId;

      const guest = await Guest.findOneAndDelete({ _id: guestId, weddingId });

      if (!guest) {
        ApiResponse.error(res, 404, 'Guest not found');
        return;
      }

      // Log activity
      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'deleted',
        entityType: 'guest',
        entityName: `${guest.name}`,
        description: `Deleted guest: ${guest.name}`
      });

      ApiResponse.success(res, 200, {
        message: 'Guest deleted successfully'
      });
    } catch (error: any) {
      logger.error('Delete guest error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to delete guest');
    }
  }

  static async getGuestStats(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      // .aggregate() bypasses Mongoose's query-casting layer, so a bare
      // string weddingId never matches the stored ObjectId — cast
      // explicitly, matching the convention in event.controller.ts.
      const weddingObjectId = new mongoose.Types.ObjectId(weddingId);

      const stats = await Guest.aggregate([
        { $match: { weddingId: weddingObjectId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            totalWithPlusOne: { $sum: { $add: [1, '$plusOne'] } },
            confirmed: {
              $sum: { $cond: [{ $eq: ['$rsvpStatus', 'confirmed'] }, 1, 0] }
            },
            declined: {
              $sum: { $cond: [{ $eq: ['$rsvpStatus', 'declined'] }, 1, 0] }
            },
            pending: {
              $sum: { $cond: [{ $eq: ['$rsvpStatus', 'pending'] }, 1, 0] }
            }
          }
        }
      ]);

      const categoryStats = await Guest.aggregate([
        { $match: { weddingId: weddingObjectId } },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 }
          }
        }
      ]);

      ApiResponse.success(res, 200, {
        data: {
          overview: stats[0] || {
            total: 0,
            totalWithPlusOne: 0,
            confirmed: 0,
            declined: 0,
            pending: 0
          },
          byCategory: categoryStats
        }
      });
    } catch (error: any) {
      logger.error('Get guest stats error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch guest statistics');
    }
  }

  /**
   * GET /:weddingId/guests/export?format=csv|pdf — full (unpaginated) list
   * for this wedding, using getGuests' own filters.
   */
  static async exportGuests(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const { category, rsvpStatus, search, eventId, format } = req.query;

      const filter: any = { weddingId };
      if (category) filter.category = category;
      if (rsvpStatus) filter.rsvpStatus = rsvpStatus;
      if (eventId) filter.eventIds = eventId;
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      const guests = await Guest.find(filter).sort({ createdAt: -1 }).lean();

      const rows = guests.map((g) => ({
        name: g.name,
        email: g.email || '',
        phoneNumber: g.phoneNumber || '',
        category: g.category,
        rsvpStatus: g.rsvpStatus,
        plusOne: g.plusOne,
        isVIP: g.isVIP ? 'Yes' : 'No'
      }));

      await sendExport(res, format as string, 'Guest List', 'guest-list', rows, GUEST_EXPORT_COLUMNS);
    } catch (error: any) {
      logger.error('Export guests error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to export guests');
    }
  }

  /**
   * POST /:weddingId/guests/compose — digital invitations + guest
   * communication (#2 + #7), one system for both. For each targeted guest:
   * ensures an rsvpToken, runs {{name}}/{{rsvpLink}} substitution on the
   * composed message, sends via the existing SMSService/EmailService (both
   * safely no-op without real credentials), and appends a result to that
   * guest's invitations[] log. Mirrors notifyTaskDueReminder's fan-out
   * pattern in notification.service.ts — each guest's send is wrapped in
   * its own try/catch so one bad contact never aborts the batch.
   */
  static async composeAndSend(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const userId = req.user?.userId;
      const { guestIds, channel, message } = req.body as {
        guestIds: string[];
        channel: 'sms' | 'email';
        message: string;
      };

      const wedding = await Wedding.findById(weddingId).select('publicSlug brideName groomName');
      if (!wedding) {
        ApiResponse.error(res, 404, 'Wedding not found');
        return;
      }

      const publicSlug = await ensurePublicSlug(wedding);

      const guests = await Guest.find({ _id: { $in: guestIds }, weddingId });

      const results = await Promise.all(
        guests.map(async (guest) => {
          if (!guest.rsvpToken) {
            guest.rsvpToken = crypto.randomBytes(24).toString('hex');
          }

          const rsvpLink = buildRsvpLink(publicSlug, guest.rsvpToken);
          const text = renderTemplate(message, { name: guest.name, rsvpLink });

          let status: 'sent' | 'failed' = 'failed';
          let error: string | undefined;

          try {
            if (channel === 'sms') {
              if (!guest.phoneNumber) throw new Error('Guest has no phone number on file');
              const ok = await SMSService.sendSMS(guest.phoneNumber, text);
              status = ok ? 'sent' : 'failed';
              if (!ok) error = 'SMS delivery failed';
            } else {
              if (!guest.email) throw new Error('Guest has no email address on file');
              const ok = await EmailService.sendMail(
                guest.email,
                `You're invited — ${wedding.brideName} & ${wedding.groomName}`,
                text.replace(/\n/g, '<br/>')
              );
              status = ok ? 'sent' : 'failed';
              if (!ok) error = 'Email delivery failed';
            }
          } catch (sendError: any) {
            status = 'failed';
            error = sendError?.message || 'Send failed';
            logger.warn(`Compose send failed for guest ${guest._id}:`, sendError);
          }

          guest.invitations.push({
            channel,
            status,
            sentAt: new Date(),
            sentBy: new mongoose.Types.ObjectId(userId!),
            ...(error ? { error } : {})
          });

          try {
            await guest.save();
          } catch (saveError) {
            logger.warn(`Failed to persist invitation log for guest ${guest._id}:`, saveError);
          }

          return { guestId: String(guest._id), name: guest.name, channel, status, ...(error ? { error } : {}) };
        })
      );

      const sentCount = results.filter((r) => r.status === 'sent').length;
      const failedCount = results.length - sentCount;

      try {
        await ActivityService.logActivity({
          weddingId,
          userId: userId!,
          actionType: 'updated',
          entityType: 'guest',
          description: `Sent ${channel.toUpperCase()} invitations to ${results.length} guest(s) (${sentCount} sent, ${failedCount} failed)`
        });
      } catch (activityError) {
        logger.warn('Failed to log compose-send activity:', activityError);
      }

      ApiResponse.success(res, 200, {
        message: 'Invitations processed',
        data: { results, sentCount, failedCount }
      });
    } catch (error: any) {
      logger.error('Compose guests error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to send invitations');
    }
  }
}