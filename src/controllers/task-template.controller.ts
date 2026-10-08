import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { TaskTemplate } from '../models/task-template.model';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';
import { canEditTemplate, templateOrgsFor, visibleTemplateFilter } from '../services/org/org-template.service';

/**
 * Templates come in three kinds:
 * - system presets (seeded, read-only, visible to everyone);
 * - personal templates (their creator's, follow them across weddings);
 * - agency templates (Track C, `organizationId` set): shared with the
 *   agency's staff who hold templates.apply, edited by templates.manage.
 */
const decorate = (template: any, userId: string, orgs: Awaited<ReturnType<typeof templateOrgsFor>>) => {
  const plain = typeof template.toObject === 'function' ? template.toObject() : template;
  const orgId = plain.organizationId ? String(plain.organizationId) : null;
  return {
    ...plain,
    organization: orgId ? { id: orgId, name: orgs.get(orgId)?.name } : null,
    canEdit: canEditTemplate(plain, userId, orgs),
  };
};

export class TaskTemplateController {
  static async createTemplate(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { name, description, items, organizationId } = req.body;

      if (organizationId) {
        const orgs = await templateOrgsFor(userId);
        if (!orgs.get(String(organizationId))?.permissions.has('templates.manage')) {
          ApiResponse.error(res, 403, "You can't add templates for this agency");
          return;
        }
      }

      const template = await TaskTemplate.create({
        name,
        description,
        items,
        createdBy: userId,
        organizationId: organizationId || undefined,
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
   * GET /task-templates — system presets, the caller's own templates, and
   * the shared templates of every agency they work in. `?organizationId=`
   * narrows to one agency's templates. Each row says whether the caller may
   * edit it.
   */
  static async getTemplates(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const orgs = await templateOrgsFor(userId);
      const filter: any = visibleTemplateFilter(userId, orgs);

      const orgFilter = typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined;
      if (orgFilter) {
        if (!mongoose.isValidObjectId(orgFilter) || !orgs.has(orgFilter)) {
          ApiResponse.success(res, 200, { data: [] });
          return;
        }
        filter.$and = [{ organizationId: new mongoose.Types.ObjectId(orgFilter) }];
      }

      const templates = await TaskTemplate.find(filter).sort({ isSystemTemplate: -1, sortOrder: 1, createdAt: -1 });

      ApiResponse.success(res, 200, { data: templates.map((t) => decorate(t, userId, orgs)) });
    } catch (error: any) {
      logger.error('Get task templates error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch templates');
    }
  }

  static async getTemplateById(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { templateId } = req.params;
      if (!mongoose.isValidObjectId(templateId)) {
        ApiResponse.error(res, 404, 'Template not found');
        return;
      }
      const orgs = await templateOrgsFor(userId);

      const template = await TaskTemplate.findOne({ _id: templateId, ...visibleTemplateFilter(userId, orgs) });

      if (!template) {
        ApiResponse.error(res, 404, 'Template not found');
        return;
      }

      ApiResponse.success(res, 200, { data: decorate(template, userId, orgs) });
    } catch (error: any) {
      logger.error('Get task template error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch template');
    }
  }

  /** Loads a template the caller may edit, or answers 404 (never revealing others' templates). */
  private static async findEditable(req: Request, res: Response) {
    const userId = req.user!.userId;
    const { templateId } = req.params;
    if (!mongoose.isValidObjectId(templateId)) {
      ApiResponse.error(res, 404, "Template not found, or you don't have permission to edit it");
      return null;
    }
    const orgs = await templateOrgsFor(userId);
    const template = await TaskTemplate.findOne({ _id: templateId, ...visibleTemplateFilter(userId, orgs) });
    // System templates are curated centrally (scripts/seed.ts) — never
    // editable through the API, by anyone.
    if (!template || !canEditTemplate(template, userId, orgs)) {
      ApiResponse.error(res, 404, "Template not found, or you don't have permission to edit it");
      return null;
    }
    return template;
  }

  static async updateTemplate(req: Request, res: Response): Promise<void> {
    try {
      const template = await TaskTemplateController.findEditable(req, res);
      if (!template) return;
      const { name, description, items } = req.body;

      if (name !== undefined) template.name = name;
      if (description !== undefined) template.description = description;
      if (items !== undefined) template.items = items;
      await template.save();

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
      const template = await TaskTemplateController.findEditable(req, res);
      if (!template) return;
      await template.deleteOne();

      ApiResponse.success(res, 200, { message: 'Template deleted successfully' });
    } catch (error: any) {
      logger.error('Delete task template error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to delete template');
    }
  }
}
