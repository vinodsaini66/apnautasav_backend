import { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
// The project's installed zod (3.25.x) ships its Zod-4-compatible API under
// the 'zod/v4' subpath — @anthropic-ai/sdk's betaZodTool() is typed against
// that API specifically (peerDependency: "zod": "^3.25.0 || ^4.0.0"), so
// this file imports from 'zod/v4' rather than the project's usual 'zod'
// (classic v3 API, used everywhere else — src/validators/*.ts — which
// stays untouched).
import { z } from 'zod/v4';
import { Wedding } from '../models/wedding.model';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';
import * as AiTools from '../services/ai-tools.service';

// Per the skill's "ALWAYS use claude-opus-5 unless the user explicitly
// names a different model" rule — no date suffix.
const MODEL_ID = 'claude-opus-5';

interface AiAction {
  type: 'created' | 'updated';
  entityType: string;
  entityName?: string;
  success: boolean;
  message?: string;
}

interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Tool input schemas. These are deliberately a bit looser than the real
// create*Schema Zod validators in src/validators/ — they only need to be
// good enough to steer Claude's tool call; ai-tools.service.ts re-validates
// every input against the actual validator (or, for notes, its own manual
// check) before touching the database, exactly like every other write path
// in this codebase.
const guestInputSchema = z.object({
  name: z.string().min(2).max(50).describe('Full name of the guest'),
  phoneNumber: z.string().optional(),
  address: z.string().optional(),
  category: z.enum(['family', 'friends', 'colleagues', 'others']),
  rsvpStatus: z.enum(['pending', 'confirmed', 'declined']).optional(),
  notes: z.string().optional(),
  isVIP: z.boolean().optional(),
  email: z.string().optional(),
  plusOne: z.number().min(0).optional().describe('Number of additional guests this person is bringing'),
  dietaryRestrictions: z.string().optional(),
  seatingPreference: z.string().optional()
});

const taskInputSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().optional(),
  category: z.enum(['venue', 'decoration', 'catering', 'logistics', 'invitations', 'music', 'photography', 'others']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  dueDate: z.string().optional().describe('Due date in YYYY-MM-DD format'),
  estimatedHours: z.number().positive().optional()
});

const budgetItemInputSchema = z.object({
  category: z.enum(['venue', 'decoration', 'catering', 'logistics', 'invitations', 'music', 'photography', 'others']),
  description: z.string().min(3).max(200),
  estimatedCost: z.number().positive(),
  actualCost: z.number().positive().optional(),
  status: z.enum(['estimated', 'approved', 'paid', 'pending']).optional(),
  notes: z.string().optional()
});

const vendorInputSchema = z.object({
  vendorName: z.string().min(2).max(100),
  category: z.enum(['catering', 'photography', 'decoration', 'music', 'venue', 'invitations', 'logistics', 'others']),
  contactPerson: z.string().optional(),
  email: z.string().optional(),
  phoneNumber: z.string().min(10).describe('Vendor contact phone number, at least 10 digits'),
  estimatedCost: z.number().positive().optional(),
  bookingStatus: z.enum(['inquiry', 'negotiating', 'booked', 'confirmed', 'cancelled']).optional(),
  notes: z.string().optional()
});

const eventInputSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(1000).optional(),
  eventType: z.enum(['ceremony', 'reception', 'mehendi', 'sangeet', 'haldi', 'engagement', 'cocktail', 'other']),
  startDateTime: z.string().optional().describe('ISO 8601 datetime, e.g. 2026-12-31T18:00:00Z'),
  endDateTime: z.string().optional().describe('ISO 8601 datetime, e.g. 2026-12-31T22:00:00Z'),
  dressCode: z.string().max(100).optional(),
  estimatedBudget: z.number().min(0).optional()
});

const noteInputSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  tags: z.array(z.string()).optional()
});

const markTaskStatusInputSchema = z.object({
  taskQuery: z.string().min(1).describe("A word or phrase from the task's title to search for"),
  status: z.enum(['pending', 'in-progress', 'completed', 'cancelled'])
});

const listGuestsInputSchema = z.object({
  rsvpStatus: z.enum(['pending', 'confirmed', 'declined']).optional(),
  category: z.enum(['family', 'friends', 'colleagues', 'others']).optional()
});

const listTasksInputSchema = z.object({
  status: z.enum(['pending', 'in-progress', 'completed', 'cancelled']).optional()
});

export class AiController {
  /**
   * POST /weddings/:weddingId/ai/chat
   *
   * Wedding-level authorization for the whole conversation is already
   * guaranteed by the route's middleware chain (checkWeddingAccess ->
   * checkPermission(EDITOR) -> checkAiAssistantEnabled) — every tool below
   * only replicates the narrower per-resource checks (validators, plan
   * resource limits) that the equivalent REST controller would run.
   */
  static async chat(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const userId = req.user?.userId;
      const { message, history } = req.body as { message?: string; history?: ChatHistoryMessage[] };

      if (!userId) {
        ApiResponse.error(res, 401, 'Unauthorized');
        return;
      }

      if (!message || typeof message !== 'string' || !message.trim()) {
        ApiResponse.error(res, 400, 'message is required');
        return;
      }

      const wedding = await Wedding.findById(weddingId).select('name brideName groomName weddingDate');
      if (!wedding) {
        ApiResponse.error(res, 404, 'Wedding not found');
        return;
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        logger.error('AI chat requested but ANTHROPIC_API_KEY is not configured');
        ApiResponse.error(res, 503, 'The AI Assistant is not configured on this server.');
        return;
      }

      const client = new Anthropic({ apiKey });

      // Each tool's `run` pushes its own outcome into this closure array —
      // the mechanism this codebase uses to observe intermediate tool
      // calls/results out of the Tool Runner's loop, since the runner's
      // return value only surfaces the final assistant message.
      const actions: AiAction[] = [];

      const weddingDateStr = wedding.weddingDate ? new Date(wedding.weddingDate).toISOString().slice(0, 10) : 'not yet set';
      const todayStr = new Date().toISOString().slice(0, 10);

      const system = `You are the AI wedding-planning assistant for ${wedding.brideName} & ${wedding.groomName}'s wedding ("${wedding.name}"), scheduled for ${weddingDateStr}. Today's date is ${todayStr}.

You can create guests, tasks, budget items, vendors, events, and notes, update a task's status, and answer questions about this wedding (guest/task/budget/vendor summaries and lists). You must NEVER delete anything — you have no delete capability at all, by design, and must never claim otherwise. Stay scoped to this one wedding only; never reference or act on any other wedding. If a request is ambiguous (for example, which task to update when several could match), ask a clarifying question instead of guessing. Keep replies concise and friendly.`;

      const tools = [
        betaZodTool({
          name: 'add_guest',
          description: "Add a new guest to this wedding's guest list.",
          inputSchema: guestInputSchema,
          run: async (input) => {
            const result = await AiTools.addGuest(weddingId, userId, input);
            actions.push({
              type: 'created',
              entityType: 'guest',
              entityName: input.name,
              success: result.success,
              message: result.message
            });
            return JSON.stringify(result);
          }
        }),
        betaZodTool({
          name: 'add_task',
          description: 'Add a new to-do/task for this wedding.',
          inputSchema: taskInputSchema,
          run: async (input) => {
            const result = await AiTools.addTask(weddingId, userId, input);
            actions.push({
              type: 'created',
              entityType: 'task',
              entityName: input.title,
              success: result.success,
              message: result.message
            });
            return JSON.stringify(result);
          }
        }),
        betaZodTool({
          name: 'add_budget_item',
          description: "Add a new line item to this wedding's budget. Fails gracefully if Budget tracking isn't enabled on the current plan.",
          inputSchema: budgetItemInputSchema,
          run: async (input) => {
            const result = await AiTools.addBudgetItem(weddingId, userId, input);
            actions.push({
              type: 'created',
              entityType: 'budget',
              entityName: input.description,
              success: result.success,
              message: result.message
            });
            return JSON.stringify(result);
          }
        }),
        betaZodTool({
          name: 'add_vendor',
          description: "Add a new vendor to this wedding's vendor list.",
          inputSchema: vendorInputSchema,
          run: async (input) => {
            const result = await AiTools.addVendor(weddingId, userId, input);
            actions.push({
              type: 'created',
              entityType: 'vendor',
              entityName: input.vendorName,
              success: result.success,
              message: result.message
            });
            return JSON.stringify(result);
          }
        }),
        betaZodTool({
          name: 'add_event',
          description: 'Add a new function/event (e.g. Mehendi, Sangeet, Reception) to this wedding.',
          inputSchema: eventInputSchema,
          run: async (input) => {
            const result = await AiTools.addEvent(weddingId, userId, input);
            actions.push({
              type: 'created',
              entityType: 'event',
              entityName: input.title,
              success: result.success,
              message: result.message
            });
            return JSON.stringify(result);
          }
        }),
        betaZodTool({
          name: 'add_note',
          description: 'Add a shared note for this wedding.',
          inputSchema: noteInputSchema,
          run: async (input) => {
            const result = await AiTools.addNote(weddingId, userId, input);
            actions.push({
              type: 'created',
              entityType: 'note',
              entityName: input.title,
              success: result.success,
              message: result.message
            });
            return JSON.stringify(result);
          }
        }),
        betaZodTool({
          name: 'mark_task_status',
          description:
            "Update an existing task's status by matching a word or phrase against its title. If multiple tasks match, ask the user which one they meant instead of guessing.",
          inputSchema: markTaskStatusInputSchema,
          run: async (input) => {
            const result = await AiTools.markTaskStatus(weddingId, userId, input);
            actions.push({
              type: 'updated',
              entityType: 'task',
              entityName: (result.data && result.data.title) || input.taskQuery,
              success: result.success,
              message: result.message
            });
            return JSON.stringify(result);
          }
        }),
        betaZodTool({
          name: 'get_wedding_summary',
          description:
            'Get an aggregate read-only summary of this wedding: guest RSVP counts, task completion counts, vendor booking counts, and budget totals (if Budget is enabled on the plan).',
          inputSchema: z.object({}),
          run: async () => {
            const result = await AiTools.getWeddingSummary(weddingId);
            return JSON.stringify(result);
          }
        }),
        betaZodTool({
          name: 'list_guests',
          description: 'List up to 20 guests, optionally filtered by RSVP status and/or category.',
          inputSchema: listGuestsInputSchema,
          run: async (input) => {
            const result = await AiTools.listGuests(weddingId, input);
            return JSON.stringify(result);
          }
        }),
        betaZodTool({
          name: 'list_tasks',
          description: 'List up to 20 tasks, optionally filtered by status.',
          inputSchema: listTasksInputSchema,
          run: async (input) => {
            const result = await AiTools.listTasks(weddingId, input);
            return JSON.stringify(result);
          }
        })
      ];

      const finalMessage = await client.beta.messages.toolRunner({
        model: MODEL_ID,
        max_tokens: 4096,
        system,
        messages: [...(history || []), { role: 'user', content: message }],
        tools
      });

      const reply = finalMessage.content
        .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();

      ApiResponse.success(res, 200, {
        data: {
          reply: reply || "I've made the requested changes." ,
          actions
        }
      });
    } catch (error: any) {
      logger.error('AI chat error:', error);
      ApiResponse.error(res, 500, error?.message || 'Failed to process AI chat message');
    }
  }
}
