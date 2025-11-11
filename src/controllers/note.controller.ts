import { Request, Response } from 'express';
import { SharedNote } from '../models/sharedNote.model';
import { ApiResponse } from '../utils/apiResponse';
import { ActivityService } from '../services/activity.service';
import logger from '../utils/logger';

export class NoteController {
  static async createNote(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const userId = req.user?.userId;
      const { title, content, tags, collaborators } = req.body;

      const note = await SharedNote.create({
        weddingId,
        title,
        content,
        createdBy: userId,
        tags: tags || [],
        collaborators: collaborators || []
      });

      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'created',
        entityType: 'note',
        entityId: note._id as string,
        entityName: note.title,
        description: `Created note: ${note.title}`
      });

      ApiResponse.success(res, 201, {
        message: 'Note created successfully',
        data: note
      });
    } catch (error: any) {
      logger.error('Create note error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to create note');
    }
  }

  static async getNotes(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const { page = 1, limit = 50, search, tags } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const filter: any = { weddingId };

      if (search) {
        filter.$or = [
          { title: { $regex: search, $options: 'i' } },
          { content: { $regex: search, $options: 'i' } }
        ];
      }

      if (tags) {
        filter.tags = { $in: Array.isArray(tags) ? tags : [tags] };
      }

      const notes = await SharedNote.find(filter)
        .populate('createdBy', 'fullName')
        .populate('collaborators', 'fullName')
        .sort({ isPinned: -1, updatedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

      const total = await SharedNote.countDocuments(filter);

      ApiResponse.paginated(res, notes, Number(page), Number(limit), total);
    } catch (error: any) {
      logger.error('Get notes error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch notes');
    }
  }

  static async updateNote(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, noteId } = req.params;
      const userId = req.user?.userId;
      const { title, content, tags, collaborators, isPinned } = req.body;

      const note = await SharedNote.findOne({ _id: noteId, weddingId });

      if (!note) {
        ApiResponse.error(res, 404, 'Note not found');
        return;
      }

      // Save edit history
      if (content && content !== note.content) {
        note.editHistory.push({
          editedBy: userId as any,
          editedAt: new Date(),
          previousContent: note.content
        });
      }

      if (title) note.title = title;
      if (content) note.content = content;
      if (tags) note.tags = tags;
      if (collaborators) note.collaborators = collaborators;
      if (isPinned !== undefined) note.isPinned = isPinned;

      await note.save();

      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'updated',
        entityType: 'note',
        entityId: note._id as string,
        entityName: note.title,
        description: `Updated note: ${note.title}`
      });

      ApiResponse.success(res, 200, {
        message: 'Note updated successfully',
        data: note
      });
    } catch (error: any) {
      logger.error('Update note error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to update note');
    }
  }

  static async deleteNote(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, noteId } = req.params;
      const userId = req.user?.userId;

      const note = await SharedNote.findOneAndDelete({ _id: noteId, weddingId });

      if (!note) {
        ApiResponse.error(res, 404, 'Note not found');
        return;
      }

      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'deleted',
        entityType: 'note',
        entityName: note.title,
        description: `Deleted note: ${note.title}`
      });

      ApiResponse.success(res, 200, {
        message: 'Note deleted successfully'
      });
    } catch (error: any) {
      logger.error('Delete note error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to delete note');
    }
  }
}