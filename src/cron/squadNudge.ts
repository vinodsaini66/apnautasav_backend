import cron from 'node-cron';
import mongoose from 'mongoose';
import { Squad, ISquad } from '../models/squad.model';
import { Wedding } from '../models/wedding.model';
import { NotificationService } from '../services/notification.service';
import { SquadService, SquadTaskStats } from '../services/squad.service';
import { computeWeddingStats } from '../services/wedding-stats.service';
import { DIGEST_COPY, SQUAD_NUDGE_COPY, SquadNudgeSignal, fillCopy, pickRandom } from '../constants/squads';
import logger from '../utils/logger';

// Family squad reminders. Imported for side effects from server.ts, like
// cron/taskReminder.ts.
//
// Rules that keep these from turning into spam:
// - a squad is nudged at most once every two days (Squad.lastNudgedAt);
// - a person gets at most one squad nudge a day, even if they're in several;
// - only squads with something real to act on are nudged, with one line
//   about their most pressing thing;
// - sent mid-morning IST, never at night.

const TZ = { timezone: 'Asia/Kolkata' };
const dbReady = () => mongoose.connection.readyState === 1;
const NUDGE_GAP_MS = 2 * 24 * 60 * 60 * 1000;

/** Weddings still being planned: not completed, main day today or later. */
const activeWeddingIds = async (weddingIds: mongoose.Types.ObjectId[]) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const weddings = await Wedding.find({ _id: { $in: weddingIds }, status: { $ne: 'completed' }, weddingDate: { $gte: startOfToday } })
    .select('totalBudget')
    .lean();
  return new Map(weddings.map((w) => [String(w._id), w.totalBudget ?? 0]));
};

const ACTION_TAB: Record<SquadNudgeSignal, string> = {
  overdue: 'tasks',
  unclaimed: 'tasks',
  paymentsDue: 'budget',
  rsvpPending: 'guests'
};

/** The single most pressing thing for this squad, or null if there's nothing to say. */
function pickSignal(
  squad: ISquad,
  stats: SquadTaskStats,
  wedding: { paymentsDue: number; rsvpPending: number }
): { signal: SquadNudgeSignal; count: number } | null {
  if (stats.overdue > 0) return { signal: 'overdue', count: stats.overdue };
  if (squad.areas.includes('budget') && wedding.paymentsDue > 0) return { signal: 'paymentsDue', count: wedding.paymentsDue };
  if (stats.unclaimed > 0) return { signal: 'unclaimed', count: stats.unclaimed };
  if (squad.areas.includes('guests') && wedding.rsvpPending > 0) return { signal: 'rsvpPending', count: wedding.rsvpPending };
  return null;
}

export interface PlannedNudge {
  squadId: mongoose.Types.ObjectId;
  weddingId: string;
  recipients: string[];
  title: string;
  message: string;
  actionUrl: string;
}

/** Works out today's squad nudges without sending anything (also used to test the rules). */
export async function planSquadNudges(): Promise<PlannedNudge[]> {
  const cutoff = new Date(Date.now() - NUDGE_GAP_MS);
  const squads = await Squad.find({
    'memberIds.0': { $exists: true },
    $or: [{ lastNudgedAt: { $exists: false } }, { lastNudgedAt: { $lte: cutoff } }]
  });
  if (squads.length === 0) return [];

  const budgets = await activeWeddingIds([...new Set(squads.map((s) => String(s.weddingId)))].map((id) => new mongoose.Types.ObjectId(id)));
  const nudgedToday = new Set<string>();
  const plan: PlannedNudge[] = [];

  for (const [weddingId, totalBudget] of budgets) {
    try {
      const weddingSquads = squads.filter((s) => String(s.weddingId) === weddingId);
      const [taskStats, weddingStats] = await Promise.all([
        SquadService.taskStats(weddingId, undefined, true),
        computeWeddingStats(weddingId, totalBudget, { excludeInternal: true })
      ]);
      const counts = { paymentsDue: weddingStats.payments.dueCount, rsvpPending: weddingStats.guests.pending };

      for (const squad of weddingSquads) {
        const picked = pickSignal(squad, SquadService.statsFor(taskStats, String(squad._id)), counts);
        if (!picked) continue;

        const members = await SquadService.withWeddingAccess(weddingId, squad.memberIds.map(String));
        const recipients = members.filter((id) => !nudgedToday.has(id));
        if (recipients.length === 0) continue;

        const copy = pickRandom(SQUAD_NUDGE_COPY[picked.signal]);
        const vars = { squad: squad.name, count: picked.count };
        plan.push({
          squadId: squad._id as mongoose.Types.ObjectId,
          weddingId,
          recipients,
          title: fillCopy(copy.title, vars),
          message: fillCopy(copy.body, vars),
          actionUrl: `/wedding/${weddingId}/${ACTION_TAB[picked.signal]}`
        });
        recipients.forEach((id) => nudgedToday.add(id));
      }
    } catch (error) {
      logger.error(`Squad nudge planning failed for wedding ${weddingId}:`, error);
    }
  }
  return plan;
}

// Every day at 11:00 IST — one witty nudge per squad that has something to do.
cron.schedule(
  '0 11 * * *',
  async () => {
    if (!dbReady()) return;
    try {
      const plan = await planSquadNudges();
      for (const nudge of plan) {
        await Promise.all(
          nudge.recipients.map((recipientId) =>
            NotificationService.createNotification({
              recipientId,
              weddingId: nudge.weddingId,
              type: 'squad_nudge',
              title: nudge.title,
              message: nudge.message,
              actionUrl: nudge.actionUrl
            }).catch((error) => logger.warn(`Squad nudge failed for user ${recipientId}:`, error))
          )
        );
        await Squad.updateOne({ _id: nudge.squadId }, { $set: { lastNudgedAt: new Date() } });
      }
      logger.info(`Squad nudge cron finished: ${plan.length} squad(s) nudged`);
    } catch (error) {
      logger.error('Squad nudge cron error:', error);
    }
  },
  TZ
);

// Sundays at 10:00 IST — "Shaadi Samachar": tell everyone on a squad-run
// wedding that the week's digest is ready to read and share.
cron.schedule(
  '0 10 * * 0',
  async () => {
    if (!dbReady()) return;
    try {
      const weddingIds = (await Squad.distinct('weddingId')) as mongoose.Types.ObjectId[];
      const active = await activeWeddingIds(weddingIds);
      let sent = 0;

      for (const weddingId of active.keys()) {
        try {
          const digest = await SquadService.weeklyDigest(weddingId);
          const recipients = await NotificationService.getWeddingRecipientIds(weddingId);
          const copy = pickRandom(DIGEST_COPY);
          const vars = { days: digest.daysToGo ?? '' };
          await Promise.all(
            recipients.map((recipientId) =>
              NotificationService.createNotification({
                recipientId,
                weddingId,
                type: 'weekly_digest',
                title: fillCopy(copy.title, vars),
                message: fillCopy(copy.body, vars),
                actionUrl: `/wedding/${weddingId}/collaboration?view=squads`
              }).catch((error) => logger.warn(`Weekly digest failed for user ${recipientId}:`, error))
            )
          );
          sent += 1;
        } catch (error) {
          logger.error(`Weekly digest failed for wedding ${weddingId}:`, error);
        }
      }

      logger.info(`Weekly digest cron finished: ${sent} wedding(s)`);
    } catch (error) {
      logger.error('Weekly digest cron error:', error);
    }
  },
  TZ
);
