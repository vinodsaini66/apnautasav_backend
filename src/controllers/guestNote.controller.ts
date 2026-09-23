import { Request, Response } from 'express';
import { GuestNote } from '../models/guestNote.model';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';

export class GuestNoteController {
  /**
   * GET /:weddingId/guest-notes — authed, any team member (checkWeddingAccess
   * only, no ADMIN gate — same read-access level as noteRoutes/activityRoutes).
   * Paginated, newest first, same page/limit query-param convention as
   * NoteController.getNotes.
   */
  static async getGuestNotes(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const { page = 1, limit = 50 } = req.query;

      const skip = (Number(page) - 1) * Number(limit);

      const notes = await GuestNote.find({ weddingId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

      const total = await GuestNote.countDocuments({ weddingId });

      ApiResponse.paginated(res, notes, Number(page), Number(limit), total);
    } catch (error: any) {
      logger.error('Get guest notes error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch guest notes');
    }
  }
}
