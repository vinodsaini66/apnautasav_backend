import { TaskTemplate } from '../models/task-template.model';
import { SYSTEM_TASK_TEMPLATES } from '../constants/task-templates';
import logger from '../utils/logger';

/**
 * Keeps the global checklist templates in the database identical to
 * constants/task-templates.ts. Runs on every server start, so a new or
 * edited template reaches every environment without a manual seed. System
 * templates are read-only through the API, so overwriting them is safe; user
 * and agency templates (no `key`) are never touched.
 */
export async function syncSystemTaskTemplates(): Promise<void> {
  for (const t of SYSTEM_TASK_TEMPLATES) {
    await TaskTemplate.updateOne(
      { key: t.key },
      {
        $set: { name: t.name, description: t.description, sortOrder: t.sortOrder, items: t.items, isSystemTemplate: true },
        $unset: { createdBy: '', organizationId: '' },
      },
      { upsert: true, runValidators: true },
    );
  }
  logger.info(`System task templates synced (${SYSTEM_TASK_TEMPLATES.length})`);
}
