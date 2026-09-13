import { Request, Response } from 'express';
import { SeatingTable } from '../models/seating-table.model';
import { Guest } from '../models/guest.model';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';

const GUEST_POPULATE = 'name category isVIP rsvpStatus plusOne';

export class SeatingTableController {
  static async createTable(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const userId = req.user?.userId;
      const { name, capacity, eventId, notes } = req.body;

      const table = await SeatingTable.create({
        weddingId,
        name,
        capacity,
        eventId: eventId || undefined,
        notes,
        createdBy: userId,
        guestIds: []
      });

      ApiResponse.success(res, 201, { message: 'Table created', data: table });
    } catch (error: any) {
      logger.error('Create seating table error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to create table');
    }
  }

  static async getTables(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const { eventId } = req.query;

      const filter: any = { weddingId };
      if (eventId) filter.eventId = eventId;

      const tables = await SeatingTable.find(filter)
        .populate('guestIds', GUEST_POPULATE)
        .sort({ createdAt: 1 })
        .lean();

      ApiResponse.success(res, 200, { data: tables });
    } catch (error: any) {
      logger.error('Get seating tables error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch tables');
    }
  }

  static async updateTable(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, tableId } = req.params;
      const { name, capacity, eventId, notes } = req.body;

      const table = await SeatingTable.findOne({ _id: tableId, weddingId });
      if (!table) {
        ApiResponse.error(res, 404, 'Table not found');
        return;
      }

      // Don't silently shrink a table below the number of guests already
      // sitting there — that would strand an assignment with nowhere to go.
      if (capacity !== undefined && capacity < table.guestIds.length) {
        ApiResponse.error(
          res,
          400,
          `${table.name} already has ${table.guestIds.length} guest(s) assigned — unassign some first, or don't reduce capacity below that.`
        );
        return;
      }

      if (name !== undefined) table.name = name;
      if (capacity !== undefined) table.capacity = capacity;
      if (eventId !== undefined) table.eventId = (eventId || undefined) as any;
      if (notes !== undefined) table.notes = notes;

      await table.save();
      await table.populate('guestIds', GUEST_POPULATE);

      ApiResponse.success(res, 200, { message: 'Table updated', data: table });
    } catch (error: any) {
      logger.error('Update seating table error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to update table');
    }
  }

  static async deleteTable(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, tableId } = req.params;

      const table = await SeatingTable.findOneAndDelete({ _id: tableId, weddingId });
      if (!table) {
        ApiResponse.error(res, 404, 'Table not found');
        return;
      }

      ApiResponse.success(res, 200, { message: 'Table deleted' });
    } catch (error: any) {
      logger.error('Delete seating table error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to delete table');
    }
  }

  /**
   * POST /:weddingId/seating-tables/:tableId/guests — assigns a guest to
   * this table. A guest sits at exactly one table at a time, so this first
   * pulls them off any other table in the wedding before adding them here.
   */
  static async assignGuest(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, tableId } = req.params;
      const { guestId } = req.body;

      const guest = await Guest.findOne({ _id: guestId, weddingId });
      if (!guest) {
        ApiResponse.error(res, 404, 'Guest not found');
        return;
      }

      const table = await SeatingTable.findOne({ _id: tableId, weddingId });
      if (!table) {
        ApiResponse.error(res, 404, 'Table not found');
        return;
      }

      const alreadyHere = table.guestIds.some((id) => String(id) === String(guestId));
      if (!alreadyHere && table.guestIds.length >= table.capacity) {
        ApiResponse.error(res, 400, `${table.name} is already full (${table.capacity} seats).`);
        return;
      }

      if (!alreadyHere) {
        await SeatingTable.updateMany(
          { weddingId, _id: { $ne: table._id } },
          { $pull: { guestIds: guest._id } }
        );
        table.guestIds.push(guest._id as any);
        await table.save();
      }

      await table.populate('guestIds', GUEST_POPULATE);
      ApiResponse.success(res, 200, { message: 'Guest assigned', data: table });
    } catch (error: any) {
      logger.error('Assign guest to table error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to assign guest');
    }
  }

  static async unassignGuest(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, tableId, guestId } = req.params;

      const table = await SeatingTable.findOneAndUpdate(
        { _id: tableId, weddingId },
        { $pull: { guestIds: guestId } },
        { new: true }
      ).populate('guestIds', GUEST_POPULATE);

      if (!table) {
        ApiResponse.error(res, 404, 'Table not found');
        return;
      }

      ApiResponse.success(res, 200, { message: 'Guest unassigned', data: table });
    } catch (error: any) {
      logger.error('Unassign guest from table error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to unassign guest');
    }
  }

  /**
   * GET /:weddingId/seating-tables/unseated — guests not currently placed
   * at any table for this wedding. Powers the "unassigned" pool the seating
   * UI assigns from.
   */
  static async getUnseatedGuests(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;

      const tables = await SeatingTable.find({ weddingId }).select('guestIds').lean();
      const seatedIds = new Set<string>();
      tables.forEach((table) => (table.guestIds || []).forEach((id: any) => seatedIds.add(String(id))));

      const guests = await Guest.find({ weddingId })
        .select(GUEST_POPULATE)
        .sort({ name: 1 })
        .lean();

      const unseated = guests.filter((guest) => !seatedIds.has(String(guest._id)));

      ApiResponse.success(res, 200, { data: unseated });
    } catch (error: any) {
      logger.error('Get unseated guests error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch unseated guests');
    }
  }
}
