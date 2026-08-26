import cron from 'node-cron';
import { Task } from '../models/task.model';
import { NotificationService } from '../services/notification.service';
import logger from '../utils/logger';

// Strip time-of-day so "days until due" is a pure calendar-date diff, not
// skewed by the time the cron happens to run at.
function toDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(a: Date, b: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((toDateOnly(b).getTime() - toDateOnly(a).getTime()) / MS_PER_DAY);
}

// ⏰ Every day at 8:00 AM — send due-date reminders (#24) for tasks whose
// dueDate minus reminderOffsetDays lands on today, then mark them sent so
// they never fire twice.
cron.schedule('0 8 * * *', async () => {
  try {
    logger.info('Task due-reminder cron started');

    const today = toDateOnly(new Date());

    const candidates = await Task.find({
      reminderOffsetDays: { $exists: true },
      reminderSent: { $ne: true },
      status: { $nin: ['completed', 'cancelled'] },
      dueDate: { $exists: true }
    });

    let sent = 0;

    for (const task of candidates) {
      if (!task.dueDate || task.reminderOffsetDays === undefined || task.reminderOffsetDays === null) continue;

      const daysUntilDue = daysBetween(today, toDateOnly(task.dueDate));

      if (daysUntilDue === task.reminderOffsetDays) {
        try {
          const assigneeIds = (task.assignedTo || []).map((id: any) => id.toString());

          if (assigneeIds.length > 0) {
            await NotificationService.notifyTaskDueReminder(
              String(task._id),
              assigneeIds,
              String(task.weddingId),
              task.title,
              task.dueDate
            );
          }

          await Task.updateOne({ _id: task._id }, { $set: { reminderSent: true } });
          sent += 1;
        } catch (error) {
          logger.error(`Task due-reminder failed for task ${task._id}:`, error);
        }
      }
    }

    logger.info(`Task due-reminder cron finished: ${sent} reminder(s) sent`);
  } catch (error) {
    logger.error('Task due-reminder cron error:', error);
  }
});
