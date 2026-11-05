import { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import mongoose from 'mongoose';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';
import { hasPermission } from '../services/access.service';
import { WeddingPermission } from '../constants/permissions';
import { WeddingEvent } from '../models/event.model';
import * as Ai from '../services/ai.service';
import * as AiTools from '../services/ai-tools.service';

// AI Assistant routes (see services/ai.service.ts):
//   POST /weddings/:weddingId/ai/extract  speech/text -> draft records (saves nothing)
//   POST /weddings/:weddingId/ai/commit   save the drafts the user confirmed
//   POST /weddings/:weddingId/ai/chat     ideas chat, never stored
// The route chain already checked wedding access, `ai.use` and the plan.

const MAX_INPUT_CHARS = 3000;
const MAX_ITEMS_PER_TYPE = 25;

const canSeeBudget = (req: Request) => Boolean(req.access && hasPermission(req.access, 'budget.view'));

/** Shared error mapping for the two routes that call the model. */
const sendAiError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof Ai.AiNotConfiguredError) {
    ApiResponse.error(res, 503, error.message);
  } else if (error instanceof Ai.AiRefusedError) {
    ApiResponse.error(res, 422, error.message);
  } else if (error instanceof Anthropic.RateLimitError) {
    ApiResponse.error(res, 429, 'The AI is busy right now. Please try again in a minute.');
  } else if (error instanceof Anthropic.APIError) {
    logger.error(`AI API error ${error.status}:`, error.message);
    ApiResponse.error(res, 502, 'The AI service had a problem. Please try again.');
  } else {
    logger.error(fallback, error);
    ApiResponse.error(res, 500, fallback);
  }
};

/** 429 once today's AI calls are used up (this person's or the wedding's); true means go ahead. */
const takeQuota = async (weddingId: string, userId: string, res: Response): Promise<boolean> => {
  if (!Ai.isAiConfigured()) {
    ApiResponse.error(res, 503, 'The AI Assistant is not configured on this server.');
    return false;
  }
  const quota = await Ai.consumeDailyQuota(weddingId, userId);
  if (!quota.ok) {
    const message =
      quota.scope === 'user'
        ? `You've used your ${quota.limit} AI requests for today on this wedding. They reset at midnight.`
        : `Your family has used this wedding's ${quota.limit} AI requests for today. They reset at midnight.`;
    ApiResponse.error(res, 429, message, { code: 'AI_DAILY_LIMIT', scope: quota.scope, limit: quota.limit });
    return false;
  }
  return true;
};

// ---------------------------------------------------------------- commit helpers

/** Drops null / empty-string / undefined fields so optional validators pass. */
const clean = <T extends Record<string, any>>(obj: T): Partial<T> => {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj || {})) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    out[key] = typeof value === 'string' ? value.trim() : value;
  }
  return out as Partial<T>;
};

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value.slice(0, MAX_ITEMS_PER_TYPE) : []);

/** "2026-12-12" + "18:30" (India time) -> ISO string, or undefined without a valid date. */
const toIso = (date?: string | null, time?: string | null): string | undefined => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const hhmm = time && /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, '0') : '10:00';
  const parsed = new Date(`${date}T${hhmm}:00+05:30`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

interface CommitResult {
  type: 'guest' | 'task' | 'vendor' | 'event' | 'budget' | 'note';
  clientId?: string;
  name: string;
  success: boolean;
  message: string;
}

export class AiController {
  /** POST /weddings/:weddingId/ai/extract  { text } -> drafts for review */
  static async extract(req: Request, res: Response): Promise<void> {
    const { weddingId } = req.params;
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';

    if (!text) {
      ApiResponse.error(res, 400, 'Say or type what you want to add.');
      return;
    }
    if (text.length > MAX_INPUT_CHARS) {
      ApiResponse.error(res, 400, `That's too long — keep it under ${MAX_INPUT_CHARS} characters.`);
      return;
    }

    try {
      if (!(await takeQuota(weddingId, req.user!.userId, res))) return;
      const drafts = await Ai.extractDrafts(weddingId, text, canSeeBudget(req));
      ApiResponse.success(res, 200, { data: drafts });
    } catch (error) {
      sendAiError(res, error, 'Could not understand that. Please try again.');
    }
  }

  /**
   * POST /weddings/:weddingId/ai/commit  { guests, tasks, vendors, events, budgetItems, notes }
   *
   * Saves the drafts the user confirmed (and maybe edited). Each type needs
   * the same permission its own REST route needs, and each item goes through
   * the same validator, plan limit and activity log (ai-tools.service.ts).
   * One bad item doesn't stop the rest; every item reports its own result.
   * Doesn't call the model, so it doesn't count against the daily limit.
   */
  static async commit(req: Request, res: Response): Promise<void> {
    const { weddingId } = req.params;
    const userId = req.user!.userId;
    const access = req.access!;
    const body = req.body || {};
    const results: CommitResult[] = [];

    const allowed = (perm: WeddingPermission) => hasPermission(access, perm);
    const denied = (type: CommitResult['type'], items: any[], label: (i: any) => string) => {
      for (const item of items) {
        results.push({ type, clientId: item?.clientId, name: label(item), success: false, message: "You don't have permission to add this." });
      }
    };

    try {
      // Guests may only be linked to this wedding's own functions.
      const validEventIds = new Set(
        (await WeddingEvent.find({ weddingId }).select('_id').lean()).map((e: any) => String(e._id))
      );

      // Functions first, so they exist before anything that mentions them.
      const events = asArray(body.events);
      if (events.length && !allowed('events.manage')) denied('event', events, (e) => e?.title || 'Function');
      else {
        for (const e of events) {
          const r = await AiTools.addEvent(
            weddingId,
            userId,
            clean({
              title: e?.title,
              eventType: e?.eventType,
              startDateTime: toIso(e?.date, e?.time),
              location: e?.venueName ? { venueName: String(e.venueName).trim() } : undefined
            })
          );
          results.push({ type: 'event', clientId: e?.clientId, name: e?.title || 'Function', success: r.success, message: r.message });
        }
      }

      const guests = asArray(body.guests);
      if (guests.length && !allowed('guests.manage')) denied('guest', guests, (g) => g?.name || 'Guest');
      else {
        for (const g of guests) {
          const eventIds = Array.isArray(g?.eventIds)
            ? g.eventIds.filter((id: unknown) => typeof id === 'string' && mongoose.isValidObjectId(id) && validEventIds.has(id))
            : [];
          const plusOne = Number.isFinite(g?.plusOne) && g.plusOne > 0 ? Math.round(g.plusOne) : undefined;
          const r = await AiTools.addGuest(
            weddingId,
            userId,
            clean({
              name: g?.name,
              phoneNumber: g?.phoneNumber,
              category: g?.category || 'others',
              plusOne,
              isVIP: g?.isVIP === true ? true : undefined,
              notes: g?.notes,
              eventIds: eventIds.length ? eventIds : undefined
            })
          );
          results.push({ type: 'guest', clientId: g?.clientId, name: g?.name || 'Guest', success: r.success, message: r.message });
        }
      }

      const tasks = asArray(body.tasks);
      if (tasks.length && !allowed('tasks.manage')) denied('task', tasks, (t) => t?.title || 'Task');
      else {
        for (const t of tasks) {
          const dueDate = typeof t?.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate) ? t.dueDate : undefined;
          const r = await AiTools.addTask(
            weddingId,
            userId,
            clean({ title: t?.title, category: t?.category || 'others', priority: t?.priority, dueDate, description: t?.description })
          );
          results.push({ type: 'task', clientId: t?.clientId, name: t?.title || 'Task', success: r.success, message: r.message });
        }
      }

      const vendors = asArray(body.vendors);
      if (vendors.length && !allowed('vendors.manage')) denied('vendor', vendors, (v) => v?.vendorName || 'Vendor');
      else {
        for (const v of vendors) {
          const cost = Number(v?.estimatedCost);
          const r = await AiTools.addVendor(
            weddingId,
            userId,
            clean({
              vendorName: v?.vendorName,
              category: v?.category,
              contactPerson: v?.contactPerson,
              phoneNumber: v?.phoneNumber,
              estimatedCost: Number.isFinite(cost) && cost > 0 ? cost : undefined,
              bookingStatus: v?.bookingStatus,
              notes: v?.notes
            })
          );
          results.push({ type: 'vendor', clientId: v?.clientId, name: v?.vendorName || 'Vendor', success: r.success, message: r.message });
        }
      }

      const budgetItems = asArray(body.budgetItems);
      if (budgetItems.length && !allowed('budget.manage')) denied('budget', budgetItems, (b) => b?.description || 'Budget item');
      else {
        for (const b of budgetItems) {
          const r = await AiTools.addBudgetItem(
            weddingId,
            userId,
            clean({ description: b?.description, category: b?.category || 'others', estimatedCost: Number(b?.estimatedCost), status: b?.status })
          );
          results.push({ type: 'budget', clientId: b?.clientId, name: b?.description || 'Budget item', success: r.success, message: r.message });
        }
      }

      const notes = asArray(body.notes);
      if (notes.length && !allowed('notes.manage')) denied('note', notes, (n) => n?.title || 'Note');
      else {
        for (const n of notes) {
          const r = await AiTools.addNote(weddingId, userId, { title: n?.title, content: n?.content });
          results.push({ type: 'note', clientId: n?.clientId, name: n?.title || 'Note', success: r.success, message: r.message });
        }
      }

      if (results.length === 0) {
        ApiResponse.error(res, 400, 'Nothing to save.');
        return;
      }

      ApiResponse.success(res, 200, {
        data: { results, saved: results.filter((r) => r.success).length, failed: results.filter((r) => !r.success).length }
      });
    } catch (error) {
      logger.error('AI commit error:', error);
      ApiResponse.error(res, 500, 'Could not save. Please try again.');
    }
  }

  /** POST /weddings/:weddingId/ai/chat  { message, history } -> { reply } */
  static async chat(req: Request, res: Response): Promise<void> {
    const { weddingId } = req.params;
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

    if (!message) {
      ApiResponse.error(res, 400, 'message is required');
      return;
    }
    if (message.length > MAX_INPUT_CHARS) {
      ApiResponse.error(res, 400, `That's too long — keep it under ${MAX_INPUT_CHARS} characters.`);
      return;
    }

    try {
      if (!(await takeQuota(weddingId, req.user!.userId, res))) return;
      const reply = await Ai.chat(weddingId, message, req.body?.history, canSeeBudget(req));
      ApiResponse.success(res, 200, { data: { reply } });
    } catch (error) {
      sendAiError(res, error, 'Could not get a reply. Please try again.');
    }
  }
}
