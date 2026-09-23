import { Request, Response } from 'express';
import { Guest } from '../models/guest.model';
import { Wedding } from '../models/wedding.model';
import { WeddingEvent } from '../models/event.model';
import { GuestNote } from '../models/guestNote.model';
import { ApiResponse } from '../utils/apiResponse';
import { ActivityService } from '../services/activity.service';
import { NotificationService } from '../services/notification.service';
import logger from '../utils/logger';

export class RsvpController {
  /**
   * GET /rsvp/:token — public, unauthenticated. Resolves a guest by their
   * long random rsvpToken (never the wedding's short 6-char weddingCode)
   * and returns their own current RSVP state plus the same curated,
   * guest-safe wedding + event-schedule fields as
   * WeddingController.getPublicWeddingBySlug / getPublicWeddingEvents
   * (Phase 8) — resolved via the guest's weddingId instead of a slug, and
   * deliberately NOT gated on Wedding.isPublic: a guest reaching this link
   * was sent it directly, not browsing a public page.
   * Generic 404 for an unknown/invalid token — never distinguishes "no
   * such token" from any other failure.
   */
  static async getRsvp(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;

      const guest = await Guest.findOne({ rsvpToken: token })
        .select('name rsvpStatus plusOne dietaryRestrictions weddingId eventIds')
        .lean();

      if (!guest) {
        ApiResponse.error(res, 404, 'Invitation not found');
        return;
      }

      const wedding = await Wedding.findById(guest.weddingId).lean();
      if (!wedding) {
        ApiResponse.error(res, 404, 'Invitation not found');
        return;
      }

      const events = await WeddingEvent.find({ weddingId: wedding._id })
        .select('title eventType startDateTime endDateTime location dressCode status isFamilyOnly')
        .sort({ startDateTime: 1 })
        .lean();

      ApiResponse.success(res, 200, {
        data: {
          guest: {
            name: guest.name,
            rsvpStatus: guest.rsvpStatus,
            plusOne: guest.plusOne,
            dietaryRestrictions: guest.dietaryRestrictions,
            // Which functions this guest is invited to — lets the frontend
            // compute per-event "you're coming" / "family only" / "not
            // shown" badges without a second request.
            eventIds: (guest.eventIds || []).map((id) => String(id))
          },
          wedding: {
            name: wedding.name,
            brideName: wedding.brideName,
            groomName: wedding.groomName,
            weddingDate: wedding.weddingDate,
            location: wedding.location,
            description: wedding.description,
            imageUrl: wedding.imageUrl,
            status: wedding.status,
            venueAddress: wedding.venueAddress,
            accommodationInfo: wedding.accommodationInfo,
            pickupInfo: wedding.pickupInfo,
            giftPolicy: wedding.giftPolicy
          },
          events
        }
      });
    } catch (error: any) {
      logger.error('Get RSVP error:', error);
      ApiResponse.error(res, 500, 'Failed to load invitation');
    }
  }

  /**
   * POST /rsvp/:token — public, unauthenticated. Updates ONLY this one
   * guest's rsvpStatus/plusOne/dietaryRestrictions/notes — never reads any
   * other field off the request body, never touches any other guest or
   * wedding document. Sets rsvpRespondedAt so this self-service path is
   * distinguishable from a collaborator's manual edit via
   * PUT /:weddingId/guests/:guestId (which never sets that field).
   */
  static async submitRsvp(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;
      const { rsvpStatus, plusOne, dietaryRestrictions, notes } = req.body as {
        rsvpStatus: 'confirmed' | 'declined';
        plusOne?: number;
        dietaryRestrictions?: string;
        notes?: string;
      };

      const guest = await Guest.findOne({ rsvpToken: token });
      if (!guest) {
        ApiResponse.error(res, 404, 'Invitation not found');
        return;
      }

      guest.rsvpStatus = rsvpStatus;
      if (plusOne !== undefined) guest.plusOne = plusOne;
      if (dietaryRestrictions !== undefined) guest.dietaryRestrictions = dietaryRestrictions;
      if (notes !== undefined) guest.notes = notes;
      guest.rsvpRespondedAt = new Date();

      await guest.save();

      const weddingId = String(guest.weddingId);

      // Notify the wedding team — reuses the exact same
      // NotificationService.notifyGuestRSVP already called from the
      // collaborator-edit path in GuestController.updateGuest. Guarded
      // separately so a notification failure never blocks the RSVP itself
      // from succeeding.
      try {
        const recipientIds = await NotificationService.getWeddingRecipientIds(weddingId);
        if (recipientIds.length > 0) {
          await NotificationService.notifyGuestRSVP(weddingId, recipientIds, guest.name, guest.rsvpStatus);
        }
      } catch (notifyError) {
        logger.warn('Failed to send guest RSVP notification:', notifyError);
      }

      // Activity logging needs a userId (required on the Activity model);
      // there's no authenticated user on this public route, so the guest's
      // own addedBy (the collaborator who added them) is used as the
      // attributed actor — a judgment call, since no real "acting user"
      // exists for a guest's own self-service submission.
      try {
        await ActivityService.logActivity({
          weddingId,
          userId: String(guest.addedBy),
          actionType: 'updated',
          entityType: 'guest',
          entityId: String(guest._id),
          entityName: guest.name,
          description: `${guest.name} ${guest.rsvpStatus === 'confirmed' ? 'confirmed' : 'declined'} their invitation via public RSVP link`
        });
      } catch (activityError) {
        logger.warn('Failed to log public RSVP activity:', activityError);
      }

      ApiResponse.success(res, 200, {
        message: 'RSVP submitted successfully',
        data: {
          rsvpStatus: guest.rsvpStatus,
          plusOne: guest.plusOne,
          dietaryRestrictions: guest.dietaryRestrictions
        }
      });
    } catch (error: any) {
      logger.error('Submit RSVP error:', error);
      ApiResponse.error(res, 500, 'Failed to submit RSVP');
    }
  }

  /**
   * POST /rsvp/:token/note — public, unauthenticated. A guest leaving a
   * note for the couple, visible to the wedding's team in-app via
   * GET /:weddingId/guest-notes. Same guest lookup + generic 404 as
   * getRsvp/submitRsvp above — never leaks more than those do. guestName is
   * denormalized onto the note at write time so it still displays even if
   * the guest is later renamed/deleted.
   */
  static async submitNote(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;
      const { message } = req.body as { message: string };

      const guest = await Guest.findOne({ rsvpToken: token });
      if (!guest) {
        ApiResponse.error(res, 404, 'Invitation not found');
        return;
      }

      await GuestNote.create({
        weddingId: guest.weddingId,
        guestId: guest._id,
        guestName: guest.name,
        message
      });

      // Notify the wedding team — mirrors submitRsvp's best-effort
      // notification above; failures never block the 200 response.
      try {
        const weddingId = String(guest.weddingId);
        const recipientIds = await NotificationService.getWeddingRecipientIds(weddingId);
        await Promise.all(
          recipientIds.map((recipientId) =>
            NotificationService.createNotification({
              recipientId,
              weddingId,
              type: 'activity_alert',
              title: 'New Guest Note',
              message: `${guest.name} left a note for you`,
              relatedEntityType: 'guest',
              relatedEntityId: String(guest._id)
            })
          )
        );
      } catch (notifyError) {
        logger.warn('Failed to send guest note notification:', notifyError);
      }

      ApiResponse.success(res, 200, {
        message: 'Thank you for your note!'
      });
    } catch (error: any) {
      logger.error('Submit guest note error:', error);
      ApiResponse.error(res, 500, 'Failed to submit note');
    }
  }
}
