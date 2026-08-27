import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { Guest } from '../models/guest.model';
import { Task } from '../models/task.model';
import { Budget } from '../models/budget.model';
import { Vendor } from '../models/vendor.model';
import { WeddingEvent } from '../models/event.model';
import { SharedNote } from '../models/sharedNote.model';
import { ActivityService } from './activity.service';
import { PlanResolutionService, UNLIMITED } from './plan-resolution.service';
import { createGuestSchema } from '../validators/guest.validator';
import { createTaskSchema } from '../validators/task.validator';
import { createBudgetSchema } from '../validators/budget.validator';
import { createVendorSchema } from '../validators/vendor.validator';
import { createEventSchema } from '../validators/event.validator';
import logger from '../utils/logger';

// Every tool below is a direct model-layer mirror of the matching
// controller's createX (see guest/task/budget/vendor/event/note
// .controller.ts) — same validators, same inline plan-limit check the
// route middleware would otherwise run, same ActivityService logging (with
// a "via AI Assistant" marker in the description so the activity feed can
// tell these apart from a manual edit). None of these ever delete
// anything — there is no delete-capable tool in this file, by design.
//
// Every function below is safe to call directly from a Claude tool `run`
// handler: it never throws — every failure path (validation, plan limits,
// not-found, unexpected errors) resolves to a structured AiToolResult
// instead, matching the fan-out-with-per-item-try/catch convention already
// used elsewhere in this codebase (e.g. notification.service.ts's
// notifyTaskDueReminder, guest.controller.ts's composeAndSend).
export interface AiToolResult {
  success: boolean;
  message: string;
  data?: any;
}

type CountableResource = 'guests' | 'tasks' | 'vendors' | 'collaborators';

function zodErrorMessage(error: ZodError): string {
  return error.errors.map((e) => (e.path.length ? `${e.path.join('.')}: ${e.message}` : e.message)).join('; ');
}

/**
 * Inline replica of planLimit.middleware.ts's checkResourceLimit — the
 * usage-vs-limit comparison only, not the whole middleware (there's no
 * Express req/res inside a tool call).
 */
async function checkResourceLimitInline(
  weddingId: string,
  resource: CountableResource
): Promise<{ ok: boolean; message?: string }> {
  const ownerId = await PlanResolutionService.getWeddingOwner(weddingId);
  if (!ownerId) {
    return { ok: false, message: 'This wedding could not be found.' };
  }

  const effective = await PlanResolutionService.getEffectivePlanForWedding(ownerId, weddingId);
  const limit = effective.limits[resource];

  if (limit !== UNLIMITED) {
    const usage = await PlanResolutionService.getCurrentUsage(weddingId);
    const current = usage[resource];
    if (current >= limit) {
      return {
        ok: false,
        message: `You've reached the ${resource} limit (${limit}) for your current plan. Upgrade to add more.`
      };
    }
  }

  return { ok: true };
}

export async function addGuest(weddingId: string, userId: string, input: unknown): Promise<AiToolResult> {
  try {
    const parsed = createGuestSchema.safeParse({ body: input });
    if (!parsed.success) {
      return { success: false, message: `Couldn't add the guest: ${zodErrorMessage(parsed.error)}` };
    }

    const limitCheck = await checkResourceLimitInline(weddingId, 'guests');
    if (!limitCheck.ok) {
      return { success: false, message: limitCheck.message! };
    }

    const guest = await Guest.create({
      ...parsed.data.body,
      weddingId,
      addedBy: userId
    });

    await ActivityService.logActivity({
      weddingId,
      userId,
      actionType: 'created',
      entityType: 'guest',
      entityId: String(guest._id),
      entityName: guest.name,
      description: `Added guest: ${guest.name} (via AI Assistant)`
    });

    return {
      success: true,
      message: `Added guest "${guest.name}".`,
      data: { id: String(guest._id), name: guest.name, category: guest.category, rsvpStatus: guest.rsvpStatus }
    };
  } catch (error: any) {
    logger.error('AI tool addGuest error:', error);
    return { success: false, message: error?.message || 'Failed to add guest.' };
  }
}

export async function addTask(weddingId: string, userId: string, input: unknown): Promise<AiToolResult> {
  try {
    const parsed = createTaskSchema.safeParse({ body: input });
    if (!parsed.success) {
      return { success: false, message: `Couldn't add the task: ${zodErrorMessage(parsed.error)}` };
    }

    const limitCheck = await checkResourceLimitInline(weddingId, 'tasks');
    if (!limitCheck.ok) {
      return { success: false, message: limitCheck.message! };
    }

    const task = await Task.create({
      ...parsed.data.body,
      weddingId,
      createdBy: userId
    });

    await ActivityService.logActivity({
      weddingId,
      userId,
      actionType: 'created',
      entityType: 'task',
      entityId: String(task._id),
      entityName: task.title,
      description: `Created task: ${task.title} (via AI Assistant)`
    });

    return {
      success: true,
      message: `Added task "${task.title}".`,
      data: { id: String(task._id), title: task.title, status: task.status, priority: task.priority, dueDate: task.dueDate }
    };
  } catch (error: any) {
    logger.error('AI tool addTask error:', error);
    return { success: false, message: error?.message || 'Failed to add task.' };
  }
}

export async function addBudgetItem(weddingId: string, userId: string, input: unknown): Promise<AiToolResult> {
  try {
    const ownerId = await PlanResolutionService.getWeddingOwner(weddingId);
    if (!ownerId) {
      return { success: false, message: 'This wedding could not be found.' };
    }

    const effective = await PlanResolutionService.getEffectivePlanForWedding(ownerId, weddingId);
    if (!effective.budgetEnabled) {
      return { success: false, message: "Budget tracking isn't enabled on your current plan." };
    }

    const parsed = createBudgetSchema.safeParse({ body: input });
    if (!parsed.success) {
      return { success: false, message: `Couldn't add the budget item: ${zodErrorMessage(parsed.error)}` };
    }

    const budget = await Budget.create({
      ...parsed.data.body,
      weddingId,
      addedBy: userId
    });

    await ActivityService.logActivity({
      weddingId,
      userId,
      actionType: 'created',
      entityType: 'budget',
      entityId: String(budget._id),
      entityName: budget.description,
      description: `Added budget item: ${budget.description} (via AI Assistant)`
    });

    return {
      success: true,
      message: `Added budget item "${budget.description}".`,
      data: { id: String(budget._id), description: budget.description, category: budget.category, estimatedCost: budget.estimatedCost }
    };
  } catch (error: any) {
    logger.error('AI tool addBudgetItem error:', error);
    return { success: false, message: error?.message || 'Failed to add budget item.' };
  }
}

export async function addVendor(weddingId: string, userId: string, input: unknown): Promise<AiToolResult> {
  try {
    const parsed = createVendorSchema.safeParse({ body: input });
    if (!parsed.success) {
      return { success: false, message: `Couldn't add the vendor: ${zodErrorMessage(parsed.error)}` };
    }

    const limitCheck = await checkResourceLimitInline(weddingId, 'vendors');
    if (!limitCheck.ok) {
      return { success: false, message: limitCheck.message! };
    }

    const vendor = await Vendor.create({
      ...parsed.data.body,
      weddingId,
      addedBy: userId
    });

    await ActivityService.logActivity({
      weddingId,
      userId,
      actionType: 'created',
      entityType: 'vendor',
      entityId: String(vendor._id),
      entityName: vendor.vendorName,
      description: `Added vendor: ${vendor.vendorName} (via AI Assistant)`
    });

    return {
      success: true,
      message: `Added vendor "${vendor.vendorName}".`,
      data: { id: String(vendor._id), vendorName: vendor.vendorName, category: vendor.category, bookingStatus: vendor.bookingStatus }
    };
  } catch (error: any) {
    logger.error('AI tool addVendor error:', error);
    return { success: false, message: error?.message || 'Failed to add vendor.' };
  }
}

export async function addEvent(weddingId: string, userId: string, input: unknown): Promise<AiToolResult> {
  try {
    const parsed = createEventSchema.safeParse({ body: input });
    if (!parsed.success) {
      return { success: false, message: `Couldn't add the event: ${zodErrorMessage(parsed.error)}` };
    }

    const { startDateTime, endDateTime } = parsed.data.body;
    if (startDateTime && endDateTime && new Date(endDateTime) <= new Date(startDateTime)) {
      return { success: false, message: 'End date must be after start date.' };
    }

    // No resource-limit check for events — none exists in this codebase
    // (checkResourceLimit only covers guests/tasks/vendors/collaborators).
    const event = await WeddingEvent.create({
      ...parsed.data.body,
      weddingId,
      createdBy: userId,
      startDateTime: startDateTime ? new Date(startDateTime) : undefined,
      endDateTime: endDateTime ? new Date(endDateTime) : undefined
    });

    await ActivityService.logActivity({
      weddingId,
      userId,
      actionType: 'created',
      entityType: 'event',
      entityId: String(event._id),
      entityName: event.title,
      description: `Created event: ${event.title} (via AI Assistant)`
    });

    return {
      success: true,
      message: `Created event "${event.title}".`,
      data: { id: String(event._id), title: event.title, eventType: event.eventType, startDateTime: event.startDateTime }
    };
  } catch (error: any) {
    logger.error('AI tool addEvent error:', error);
    return { success: false, message: error?.message || 'Failed to add event.' };
  }
}

const NOTE_TITLE_MAX_LENGTH = 200;
const NOTE_CONTENT_MAX_LENGTH = 10000;

/**
 * No Zod validator exists for notes anywhere in this codebase (confirmed —
 * NoteController.createNote does no validation of its own beyond what the
 * SharedNote schema itself requires: a non-empty title and content). This
 * does the same minimal check by hand, with a sane max length so a runaway
 * model response can't write an unbounded note.
 */
export async function addNote(weddingId: string, userId: string, input: any): Promise<AiToolResult> {
  try {
    const title = typeof input?.title === 'string' ? input.title.trim() : '';
    const content = typeof input?.content === 'string' ? input.content.trim() : '';
    const tags = Array.isArray(input?.tags) ? input.tags.filter((t: any) => typeof t === 'string') : [];

    if (!title || title.length > NOTE_TITLE_MAX_LENGTH) {
      return { success: false, message: `A note needs a non-empty title (up to ${NOTE_TITLE_MAX_LENGTH} characters).` };
    }
    if (!content || content.length > NOTE_CONTENT_MAX_LENGTH) {
      return { success: false, message: `A note needs non-empty content (up to ${NOTE_CONTENT_MAX_LENGTH} characters).` };
    }

    const note = await SharedNote.create({
      weddingId,
      title,
      content,
      createdBy: userId,
      tags,
      collaborators: []
    });

    await ActivityService.logActivity({
      weddingId,
      userId,
      actionType: 'created',
      entityType: 'note',
      entityId: String(note._id),
      entityName: note.title,
      description: `Created note: ${note.title} (via AI Assistant)`
    });

    return {
      success: true,
      message: `Created note "${note.title}".`,
      data: { id: String(note._id), title: note.title }
    };
  } catch (error: any) {
    logger.error('AI tool addNote error:', error);
    return { success: false, message: error?.message || 'Failed to add note.' };
  }
}

const TASK_STATUSES = ['pending', 'in-progress', 'completed', 'cancelled'] as const;

export async function markTaskStatus(
  weddingId: string,
  userId: string,
  input: { taskQuery: string; status: string }
): Promise<AiToolResult> {
  try {
    const { taskQuery, status } = input;

    if (!TASK_STATUSES.includes(status as (typeof TASK_STATUSES)[number])) {
      return { success: false, message: `"${status}" isn't a valid task status. Use one of: ${TASK_STATUSES.join(', ')}.` };
    }

    const tasks = await Task.find({ weddingId }).select('title status');
    const query = taskQuery.trim().toLowerCase();
    const matches = tasks.filter((t) => t.title.toLowerCase().includes(query));

    if (matches.length === 0) {
      return { success: false, message: `I couldn't find a task matching '${taskQuery}'.` };
    }

    if (matches.length > 1) {
      return {
        success: false,
        message: `Found ${matches.length} tasks matching '${taskQuery}': ${matches.map((t) => t.title).join(', ')}. Which one did you mean?`
      };
    }

    const target = matches[0];
    const oldStatus = target.status;

    const update: any = { status };
    if (status === 'completed') update.completedAt = new Date();

    const task = await Task.findOneAndUpdate({ _id: target._id, weddingId }, { $set: update }, { new: true });
    if (!task) {
      return { success: false, message: 'That task could not be found.' };
    }

    await ActivityService.logActivity({
      weddingId,
      userId,
      actionType: 'updated',
      entityType: 'task',
      entityId: String(task._id),
      entityName: task.title,
      description: `Marked task "${task.title}" as ${status} (via AI Assistant)`,
      changes: { field: 'status', oldValue: oldStatus, newValue: status }
    });

    return {
      success: true,
      message: `Marked "${task.title}" as ${status}.`,
      data: { id: String(task._id), title: task.title, status: task.status }
    };
  } catch (error: any) {
    logger.error('AI tool markTaskStatus error:', error);
    return { success: false, message: error?.message || 'Failed to update task status.' };
  }
}

export async function getWeddingSummary(weddingId: string): Promise<AiToolResult> {
  try {
    // .aggregate() bypasses Mongoose's query-casting layer, so a bare
    // string weddingId never matches the stored ObjectId — cast
    // explicitly, matching the convention already used across the
    // controllers (guest/budget/event .controller.ts).
    const weddingObjectId = new mongoose.Types.ObjectId(weddingId);

    const ownerId = await PlanResolutionService.getWeddingOwner(weddingId);
    if (!ownerId) {
      return { success: false, message: 'This wedding could not be found.' };
    }
    const effective = await PlanResolutionService.getEffectivePlanForWedding(ownerId, weddingId);
    const budgetEnabled = effective.budgetEnabled;

    const [guestStats, taskStats, vendorStats, budgetStats] = await Promise.all([
      Guest.aggregate([
        { $match: { weddingId: weddingObjectId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            confirmed: { $sum: { $cond: [{ $eq: ['$rsvpStatus', 'confirmed'] }, 1, 0] } },
            declined: { $sum: { $cond: [{ $eq: ['$rsvpStatus', 'declined'] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ['$rsvpStatus', 'pending'] }, 1, 0] } }
          }
        }
      ]),
      Task.aggregate([
        { $match: { weddingId: weddingObjectId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            done: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }
          }
        }
      ]),
      Vendor.aggregate([
        { $match: { weddingId: weddingObjectId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            booked: { $sum: { $cond: [{ $in: ['$bookingStatus', ['booked', 'confirmed']] }, 1, 0] } }
          }
        }
      ]),
      budgetEnabled
        ? Budget.aggregate([
            { $match: { weddingId: weddingObjectId } },
            {
              $group: {
                _id: null,
                totalEstimated: { $sum: '$estimatedCost' },
                totalActual: { $sum: { $ifNull: ['$actualCost', 0] } }
              }
            }
          ])
        : Promise.resolve(null)
    ]);

    const summary = {
      guests: guestStats[0]
        ? { total: guestStats[0].total, confirmed: guestStats[0].confirmed, declined: guestStats[0].declined, pending: guestStats[0].pending }
        : { total: 0, confirmed: 0, declined: 0, pending: 0 },
      tasks: taskStats[0] ? { total: taskStats[0].total, done: taskStats[0].done } : { total: 0, done: 0 },
      vendors: vendorStats[0] ? { total: vendorStats[0].total, booked: vendorStats[0].booked } : { total: 0, booked: 0 },
      budget: budgetEnabled
        ? {
            enabled: true,
            estimated: budgetStats?.[0]?.totalEstimated || 0,
            spent: budgetStats?.[0]?.totalActual || 0
          }
        : { enabled: false }
    };

    return { success: true, message: 'Here is the current wedding summary.', data: summary };
  } catch (error: any) {
    logger.error('AI tool getWeddingSummary error:', error);
    return { success: false, message: error?.message || 'Failed to fetch the wedding summary.' };
  }
}

export async function listGuests(
  weddingId: string,
  filters: { rsvpStatus?: string; category?: string }
): Promise<AiToolResult> {
  try {
    const filter: any = { weddingId };
    if (filters.rsvpStatus) filter.rsvpStatus = filters.rsvpStatus;
    if (filters.category) filter.category = filters.category;

    const guests = await Guest.find(filter).select('name rsvpStatus category').limit(20).lean();

    return {
      success: true,
      message: `Found ${guests.length} guest(s).`,
      data: guests.map((g) => ({ name: g.name, rsvpStatus: g.rsvpStatus, category: g.category }))
    };
  } catch (error: any) {
    logger.error('AI tool listGuests error:', error);
    return { success: false, message: error?.message || 'Failed to list guests.' };
  }
}

export async function listTasks(weddingId: string, filters: { status?: string }): Promise<AiToolResult> {
  try {
    const filter: any = { weddingId };
    if (filters.status) filter.status = filters.status;

    const tasks = await Task.find(filter).select('title status dueDate').limit(20).lean();

    return {
      success: true,
      message: `Found ${tasks.length} task(s).`,
      data: tasks.map((t) => ({ title: t.title, status: t.status, dueDate: t.dueDate }))
    };
  } catch (error: any) {
    logger.error('AI tool listTasks error:', error);
    return { success: false, message: error?.message || 'Failed to list tasks.' };
  }
}
