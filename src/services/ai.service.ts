import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
// The SDK's zod helper is typed against the Zod 4 API, which the installed
// zod 3.25 ships under 'zod/v4'. Everything else in the codebase uses 'zod'.
import { z } from 'zod/v4';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { Wedding } from '../models/wedding.model';
import { WeddingEvent } from '../models/event.model';
import { VENDOR_CATEGORIES } from '../models/vendor.model';
import { AiUsage } from '../models/ai-usage.model';
import * as AiTools from './ai-tools.service';
import logger from '../utils/logger';

// AI Assistant: two jobs, both scoped to one wedding.
//  1. extractDrafts — turns what the user said ("add Ramesh mama, number 98…,
//     and remind me to book the pandit") into draft records. Nothing is saved
//     here; the user reviews the drafts and the controller saves the ones they
//     confirm, through the same validated writers the REST routes use.
//  2. chat — wedding ideas and planning help, answered with this wedding's
//     details in mind. Read-only, and the conversation is never stored.

// ---------------------------------------------------------------- client

let cachedClient: Anthropic | null = null;

export const isAiConfigured = (): boolean => Boolean(env.ANTHROPIC_API_KEY);

/** Token use per call, so the real cost can be watched in the logs. */
const logUsage = (kind: 'extract' | 'chat', weddingId: string, response: Anthropic.Message) => {
  const u = response.usage;
  logger.info(
    `AI ${kind} usage: wedding=${weddingId} model=${response.model} in=${u.input_tokens} out=${u.output_tokens} cache_write=${u.cache_creation_input_tokens ?? 0} cache_read=${u.cache_read_input_tokens ?? 0} stop=${response.stop_reason}`
  );
};

const getClient = (): Anthropic => {
  if (!env.ANTHROPIC_API_KEY) throw new AiNotConfiguredError();
  if (!cachedClient) cachedClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return cachedClient;
};

export class AiNotConfiguredError extends Error {
  constructor() {
    super('The AI Assistant is not configured on this server.');
  }
}

export class AiRefusedError extends Error {
  constructor() {
    super("Sorry, I can't help with that one. Try asking something about the wedding.");
  }
}

// ---------------------------------------------------------------- daily limit

/** Today's date in India (YYYY-MM-DD) — the day the daily limit resets on. */
const istDay = (date = new Date()): string =>
  new Date(date.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);

export type QuotaResult = { ok: true } | { ok: false; scope: 'user' | 'wedding'; limit: number };

/**
 * +1 on one counter row, only while it's under `limit`. Atomic: the filter
 * only matches while count < limit, so two requests at the same moment can't
 * both take the last slot.
 *
 * A duplicate-key error means one of two things: the row is full (the filter
 * missed, so the upsert tried to insert a second row), or another request
 * created today's row a moment before us (the first calls of the day racing).
 * Reading the row tells which; in the second case we simply try again.
 */
const bump = async (weddingId: mongoose.Types.ObjectId, userId: mongoose.Types.ObjectId | null, day: string, limit: number) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await AiUsage.findOneAndUpdate(
        { weddingId, userId, day, count: { $lt: limit } },
        { $inc: { count: 1 } },
        { upsert: true, setDefaultsOnInsert: true }
      );
      return true;
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      const row = await AiUsage.findOne({ weddingId, userId, day }).select('count').lean();
      if (!row || row.count >= limit) return false;
    }
  }
  return false;
};

/**
 * Counts one AI call: against this person's share on the wedding
 * (AI_USER_DAILY_LIMIT) and against the wedding's total (AI_WEDDING_DAILY_LIMIT).
 * If the wedding is full, the person's count is given back.
 */
export const consumeDailyQuota = async (weddingId: string, userId: string): Promise<QuotaResult> => {
  const day = istDay();
  const w = new mongoose.Types.ObjectId(weddingId);
  const u = new mongoose.Types.ObjectId(userId);

  if (!(await bump(w, u, day, env.AI_USER_DAILY_LIMIT))) {
    return { ok: false, scope: 'user', limit: env.AI_USER_DAILY_LIMIT };
  }
  if (!(await bump(w, null, day, env.AI_WEDDING_DAILY_LIMIT))) {
    await AiUsage.updateOne({ weddingId: w, userId: u, day }, { $inc: { count: -1 } });
    return { ok: false, scope: 'wedding', limit: env.AI_WEDDING_DAILY_LIMIT };
  }
  return { ok: true };
};

// ---------------------------------------------------------------- wedding context

interface WeddingContext {
  text: string;
  eventIds: Set<string>;
}

const fmtDate = (d?: Date | null) =>
  d
    ? new Date(d).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    : 'date not set';

/**
 * A short plain-text brief of this wedding for the model: couple, date,
 * place, functions (with ids, so "invite Priya to Haldi" can link the guest)
 * and headline counts. `includeBudget` is false for people who can't see the
 * budget, so the chat can't reveal it to them.
 */
export const loadWeddingContext = async (weddingId: string, includeBudget: boolean): Promise<WeddingContext> => {
  const [wedding, events, summary] = await Promise.all([
    Wedding.findById(weddingId).select('name brideName groomName weddingDate location venueAddress totalBudget currency').lean<any>(),
    WeddingEvent.find({ weddingId }).select('title eventType startDateTime').sort({ startDateTime: 1 }).limit(30).lean<any[]>(),
    AiTools.getWeddingSummary(weddingId)
  ]);

  const now = new Date();
  const lines: string[] = [];
  lines.push(`Today: ${fmtDate(now).replace(/, \d+:\d+.*$/, '')} (India time). Today's date as YYYY-MM-DD: ${istDay(now)}.`);
  if (wedding) {
    const couple = [wedding.brideName, wedding.groomName].filter(Boolean).join(' & ') || wedding.name;
    lines.push(`Wedding: ${wedding.name}${couple && couple !== wedding.name ? ` (${couple})` : ''}.`);
    lines.push(`Wedding date: ${wedding.weddingDate ? fmtDate(wedding.weddingDate).replace(/, \d+:\d+.*$/, '') : 'not set yet'}.`);
    const place = [wedding.location, wedding.venueAddress].filter(Boolean).join(', ');
    if (place) lines.push(`Place: ${place}.`);
    if (includeBudget && wedding.totalBudget) lines.push(`Total budget: ${wedding.currency || 'INR'} ${wedding.totalBudget}.`);
  }

  if (events.length) {
    lines.push('Functions (id | name | type | when):');
    for (const e of events) lines.push(`- ${e._id} | ${e.title} | ${e.eventType} | ${fmtDate(e.startDateTime)}`);
  } else {
    lines.push('Functions: none added yet.');
  }

  const s = summary.success ? summary.data : null;
  if (s) {
    lines.push(`Guests: ${s.guests.total} total, ${s.guests.confirmed} confirmed, ${s.guests.pending} pending, ${s.guests.declined} declined.`);
    lines.push(`Tasks: ${s.tasks.total} total, ${s.tasks.done} done.`);
    lines.push(`Vendors: ${s.vendors.total} total, ${s.vendors.booked} booked.`);
    if (includeBudget && s.budget.enabled) lines.push(`Budget items: estimated ${s.budget.estimated}, spent ${s.budget.spent}.`);
  }

  return { text: lines.join('\n'), eventIds: new Set(events.map((e) => String(e._id))) };
};

// ---------------------------------------------------------------- 1. extract drafts

const GUEST_CATEGORIES = ['family', 'friends', 'colleagues', 'others'] as const;
const WORK_CATEGORIES = ['venue', 'decoration', 'catering', 'logistics', 'invitations', 'music', 'photography', 'others'] as const;
const EVENT_TYPES = ['ceremony', 'reception', 'mehendi', 'sangeet', 'haldi', 'engagement', 'cocktail', 'baraat', 'other'] as const;

// Every field is required-but-nullable rather than optional: structured
// outputs then always return the same shape, and "not said" is an explicit
// null the review screen can show as missing.
const extractionSchema = z.object({
  guests: z.array(
    z.object({
      name: z.string(),
      phoneNumber: z.string().nullable(),
      category: z.enum(GUEST_CATEGORIES),
      plusOne: z.number().nullable(),
      isVIP: z.boolean(),
      eventIds: z.array(z.string()),
      notes: z.string().nullable()
    })
  ),
  tasks: z.array(
    z.object({
      title: z.string(),
      category: z.enum(WORK_CATEGORIES),
      priority: z.enum(['low', 'medium', 'high', 'urgent']),
      dueDate: z.string().nullable(),
      description: z.string().nullable()
    })
  ),
  vendors: z.array(
    z.object({
      vendorName: z.string(),
      category: z.enum(VENDOR_CATEGORIES),
      contactPerson: z.string().nullable(),
      phoneNumber: z.string().nullable(),
      estimatedCost: z.number().nullable(),
      bookingStatus: z.enum(['inquiry', 'negotiating', 'booked', 'confirmed', 'cancelled']),
      notes: z.string().nullable()
    })
  ),
  events: z.array(
    z.object({
      title: z.string(),
      eventType: z.enum(EVENT_TYPES),
      date: z.string().nullable(),
      time: z.string().nullable(),
      venueName: z.string().nullable()
    })
  ),
  budgetItems: z.array(
    z.object({
      description: z.string(),
      category: z.enum(WORK_CATEGORIES),
      estimatedCost: z.number(),
      status: z.enum(['estimated', 'approved', 'paid', 'pending'])
    })
  ),
  notes: z.array(z.object({ title: z.string(), content: z.string() })),
  reply: z.string()
});

export type ExtractedDrafts = z.infer<typeof extractionSchema>;

const EXTRACT_INSTRUCTIONS = `You turn what a family member said about their Indian wedding into records for the wedding planning app. The text usually comes from speech-to-text, so expect Hinglish, Hindi in Devanagari, mixed scripts, filler words and spelling slips in names.

Pick out every guest, task, vendor, function (event), budget item and note the person asked to add, and fill the fields from their words only:
- Never invent a phone number, price, date or name. If something wasn't said, use null (or [] for lists).
- Write names in proper case in Latin script ("Ramesh Mama" -> "Ramesh Mama", "रमेश" -> "Ramesh"). Keep relationship words such as Mama, Chachi, Bua with the name.
- Phone numbers: digits only, keep the leading +91 or 0 only if said. Join digits spoken in groups.
- Money: "2 lakh" = 200000, "50 hazaar"/"50k" = 50000, "1.5 lakh" = 150000.
- Dates: YYYY-MM-DD, worked out from today's date given below ("next Sunday", "15 tarikh", "shaadi se ek hafta pehle" using the wedding date). Times: 24-hour HH:mm.
- Guest category: relatives -> family, friends -> friends, office/work people -> colleagues, otherwise others.
- When a guest is invited to a function that already exists, put that function's id in eventIds. Only use ids from the list below.
- A task is something the family has to do ("book the pandit", "order cards"). Pick the closest category and a sensible priority (default medium).
- A vendor is a business or person they're hiring. Default bookingStatus is inquiry; use booked/confirmed only if they said so.
- A function is Haldi, Mehendi, Sangeet, Baraat, Pheras (type ceremony), Reception, Engagement, Cocktail or similar.
- Budget items only when they talk about an expense or estimate that isn't a vendor quote.
- Notes only when they explicitly ask to note or remember something that fits nowhere else.

Do not create anything twice. Do not turn questions or chit-chat into records.

"reply" is one short, friendly line in the same language and script the person used: what you found (English: "Found 3 guests and 1 task — check and save."; Hinglish: "3 guests aur 1 task mile — check karke save karein."), or, if nothing could be added, what they could say instead. Nothing has been saved yet — the person reviews and saves next — so never say you added, saved or booked anything.`;

export const extractDrafts = async (weddingId: string, text: string, includeBudget: boolean): Promise<ExtractedDrafts> => {
  const client = getClient();
  const context = await loadWeddingContext(weddingId, includeBudget);

  // The schema steers the output shape; the result is then normalised by
  // hand rather than strictly parsed, so one odd value (an unknown category,
  // "50k" as a string) degrades to a default instead of failing everything.
  const response = await client.messages.create({
    model: env.AI_MODEL,
    max_tokens: 4000,
    // The instructions are identical for every wedding, so they're cached
    // (one shared entry, ~10% of the price on a hit). This wedding's details
    // come after the breakpoint so they never break the cache.
    system: [
      { type: 'text', text: EXTRACT_INSTRUCTIONS, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `<wedding>\n${context.text}\n</wedding>` }
    ],
    messages: [{ role: 'user', content: text }],
    output_config: { effort: 'low', format: zodOutputFormat(extractionSchema) }
  });

  logUsage('extract', weddingId, response);
  if (response.stop_reason === 'refusal') throw new AiRefusedError();
  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('The AI response could not be read. Please try again.');
  }

  const drafts = normaliseDrafts(json, context.eventIds);
  if (!includeBudget) drafts.budgetItems = [];
  return drafts;
};

// ---------------------------------------------------------------- normalising

const str = (v: unknown, max = 500): string | null => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const t = String(v).trim();
  return t ? t.slice(0, max) : null;
};

const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.]/g, ''));
    return v.trim() && Number.isFinite(n) ? n : null;
  }
  return null;
};

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => {
  const t = typeof v === 'string' ? (v.trim().toLowerCase() as T) : null;
  return t && allowed.includes(t) ? t : fallback;
};

const isoDate = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null);
const hhmm = (v: unknown): string | null => (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v.trim()) ? v.trim().padStart(5, '0') : null);
const list = (v: unknown): any[] => (Array.isArray(v) ? v.slice(0, 25) : []);

const normaliseDrafts = (json: any, eventIds: Set<string>): ExtractedDrafts => ({
  guests: list(json?.guests)
    .map((g) => ({
      name: str(g?.name, 50) ?? '',
      phoneNumber: str(g?.phoneNumber, 20)?.replace(/[^\d+]/g, '') || null,
      category: pick(g?.category, GUEST_CATEGORIES, 'others'),
      plusOne: num(g?.plusOne),
      isVIP: g?.isVIP === true,
      eventIds: list(g?.eventIds).filter((id) => typeof id === 'string' && eventIds.has(id)),
      notes: str(g?.notes)
    }))
    .filter((g) => g.name),
  tasks: list(json?.tasks)
    .map((t) => ({
      title: str(t?.title, 200) ?? '',
      category: pick(t?.category, WORK_CATEGORIES, 'others'),
      priority: pick(t?.priority, ['low', 'medium', 'high', 'urgent'] as const, 'medium'),
      dueDate: isoDate(t?.dueDate),
      description: str(t?.description, 1000)
    }))
    .filter((t) => t.title),
  vendors: list(json?.vendors)
    .map((v) => ({
      vendorName: str(v?.vendorName, 100) ?? '',
      category: pick(v?.category, VENDOR_CATEGORIES, 'artist'),
      contactPerson: str(v?.contactPerson, 100),
      phoneNumber: str(v?.phoneNumber, 20)?.replace(/[^\d+]/g, '') || null,
      estimatedCost: num(v?.estimatedCost),
      bookingStatus: pick(v?.bookingStatus, ['inquiry', 'negotiating', 'booked', 'confirmed', 'cancelled'] as const, 'inquiry'),
      notes: str(v?.notes)
    }))
    .filter((v) => v.vendorName),
  events: list(json?.events)
    .map((e) => ({
      title: str(e?.title, 200) ?? '',
      eventType: pick(e?.eventType, EVENT_TYPES, 'other'),
      date: isoDate(e?.date),
      time: hhmm(e?.time),
      venueName: str(e?.venueName, 200)
    }))
    .filter((e) => e.title),
  budgetItems: list(json?.budgetItems)
    .map((b) => ({
      description: str(b?.description, 200) ?? '',
      category: pick(b?.category, WORK_CATEGORIES, 'others'),
      estimatedCost: num(b?.estimatedCost) ?? 0,
      status: pick(b?.status, ['estimated', 'approved', 'paid', 'pending'] as const, 'estimated')
    }))
    .filter((b) => b.description),
  notes: list(json?.notes)
    .map((n) => ({ title: str(n?.title, 200) ?? '', content: str(n?.content, 5000) ?? '' }))
    .filter((n) => n.title && n.content),
  reply: str(json?.reply, 300) ?? ''
});

// ---------------------------------------------------------------- 2. ideas chat

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const CHAT_INSTRUCTIONS = `You are the ideas and planning companion inside ApnaUtsav, an Indian family wedding planning app. You help this one family with their wedding: themes, decor, outfits, rituals and their meaning, function flow, music and games for Sangeet, food menus, guest experience, checklists, timelines, budget-saving tips and vendor questions to ask.

- Use the wedding details below to make answers specific (their date, functions, guest count). Don't claim to know anything about the wedding beyond them.
- Reply in the same language and script the person writes in — Hinglish if they write Hinglish.
- Keep it short and easy to read on a phone: a one-line answer first, then at most 5-6 bullet points. Use **bold** sparingly. No tables, no headings.
- Give prices only as rough ranges in INR and say they vary by city.
- You can't add or change anything in their plan from this chat. If they want to save something (a guest, task, vendor), tell them to switch to "Add by voice" and say it there.
- Stay on weddings and family celebrations; politely steer anything else back.`;

const MAX_TURNS = 12;
const MAX_CHARS = 4000;

const cleanHistory = (history: unknown): Anthropic.MessageParam[] => {
  if (!Array.isArray(history)) return [];
  const turns = history
    .filter((m): m is ChatTurn => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim() !== '')
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  // The conversation must start with the user.
  while (turns.length && turns[0].role !== 'user') turns.shift();
  return turns;
};

export const chat = async (weddingId: string, message: string, history: unknown, includeBudget: boolean): Promise<string> => {
  const client = getClient();
  const context = await loadWeddingContext(weddingId, includeBudget);

  const response = await client.messages.create({
    model: env.AI_MODEL,
    max_tokens: 2000,
    // Two cache points: the instructions + this wedding's brief (the same for
    // the whole conversation), and the newest message — so each follow-up
    // re-reads everything before it from the cache instead of paying for it.
    system: [
      { type: 'text', text: CHAT_INSTRUCTIONS },
      { type: 'text', text: `<wedding>\n${context.text}\n</wedding>`, cache_control: { type: 'ephemeral' } }
    ],
    messages: [
      ...cleanHistory(history),
      { role: 'user', content: [{ type: 'text', text: message.slice(0, MAX_CHARS), cache_control: { type: 'ephemeral' } }] }
    ],
    output_config: { effort: 'low' }
  });

  logUsage('chat', weddingId, response);
  if (response.stop_reason === 'refusal') throw new AiRefusedError();
  const reply = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!reply) throw new Error('No reply from the AI. Please try again.');
  return reply;
};
