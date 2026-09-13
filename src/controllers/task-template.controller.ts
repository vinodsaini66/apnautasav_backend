import { Request, Response } from 'express';
import { TaskTemplate } from '../models/task-template.model';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';

export class TaskTemplateController {
  static async createTemplate(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { name, description, items } = req.body;

      const template = await TaskTemplate.create({
        name,
        description,
        items,
        createdBy: userId,
        isSystemTemplate: false
      });

      ApiResponse.success(res, 201, {
        message: 'Template created successfully',
        data: template
      });
    } catch (error: any) {
      logger.error('Create task template error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to create template');
    }
  }

  /**
   * GET /task-templates — every user sees the shared system presets plus
   * their own custom templates, never another user's private ones (no
   * Organization/shared-team concept exists yet — see the model's own
   * comment on why templates are user-scoped, not wedding-scoped).
   */
  static async getTemplates(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;

      const templates = await TaskTemplate.find({
        $or: [{ isSystemTemplate: true }, { createdBy: userId }]
      }).sort({ isSystemTemplate: -1, createdAt: -1 });

      ApiResponse.success(res, 200, { data: templates });
    } catch (error: any) {
      logger.error('Get task templates error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch templates');
    }
  }

  static async getTemplateById(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { templateId } = req.params;

      const template = await TaskTemplate.findOne({
        _id: templateId,
        $or: [{ isSystemTemplate: true }, { createdBy: userId }]
      });

      if (!template) {
        ApiResponse.error(res, 404, 'Template not found');
        return;
      }

      ApiResponse.success(res, 200, { data: template });
    } catch (error: any) {
      logger.error('Get task template error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch template');
    }
  }

  static async updateTemplate(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { templateId } = req.params;
      const { name, description, items } = req.body;

      // System templates are curated centrally (scripts/seed.ts) — never
      // editable through the API, by anyone.
      const template = await TaskTemplate.findOneAndUpdate(
        { _id: templateId, createdBy: userId, isSystemTemplate: false },
        {
          $set: {
            ...(name !== undefined ? { name } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(items !== undefined ? { items } : {})
          }
        },
        { new: true, runValidators: true }
      );

      if (!template) {
        ApiResponse.error(res, 404, "Template not found, or you don't have permission to edit it");
        return;
      }

      ApiResponse.success(res, 200, {
        message: 'Template updated successfully',
        data: template
      });
    } catch (error: any) {
      logger.error('Update task template error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to update template');
    }
  }

  static async deleteTemplate(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { templateId } = req.params;

      const template = await TaskTemplate.findOneAndDelete({
        _id: templateId,
        createdBy: userId,
        isSystemTemplate: false
      });

      if (!template) {
        ApiResponse.error(res, 404, "Template not found, or you don't have permission to delete it");
        return;
      }

      ApiResponse.success(res, 200, { message: 'Template deleted successfully' });
    } catch (error: any) {
      logger.error('Delete task template error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to delete template');
    }
  }
}
