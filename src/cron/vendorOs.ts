import cron from 'node-cron';
import mongoose from 'mongoose';
import { VendorBooking } from '../models/vendor-os/vendor-booking.model';
import { VendorLead } from '../models/vendor-os/vendor-lead.model';
import { VendorBookingService } from '../services/vendor-os/booking.service';
import { VendorQuoteService } from '../services/vendor-os/quote.service';
import { VendorNotifyService } from '../services/vendor-os/vendor-notify.service';
import { addDays, formatDisplayDate, formatINR, round2, todayIST } from '../utils/vendorOs';
import logger from '../utils/logger';

// Vendor OS scheduled jobs. Imported for side effects from server.ts, like
// cron/wedding.ts and cron/taskReminder.ts.

const TZ = { timezone: 'Asia/Kolkata' };
const dbReady = () => mongoose.connection.readyState === 1;

// Every 15 minutes: release expired holds, expire stale quotes, surface
// follow-ups that just came due.
cron.schedule(
  '*/15 * * * *',
  async () => {
    if (!dbReady()) return;
    try {
      const holds = await VendorBookingService.expireHolds();
      const quotes = await VendorQuoteService.expireQuotes();

      const dueLeads = await VendorLead.find({
        status: { $nin: ['booked', 'lost'] },
        nextFollowUpAt: { $lte: new Date() },
        followUpNotifiedAt: { $exists: false },
      }).limit(500);
      for (const lead of dueLeads) {
        await VendorNotifyService.notify({
          vendorId: lead.vendorId,
          vendorUserId: lead.assignedTo,
          type: 'follow_up_due',
          title: `Follow up with ${lead.contact.name}`,
          body: lead.followUpNote || `Lead from ${lead.source}`,
          entityType: 'lead',
          entityId: lead._id as mongoose.Types.ObjectId,
        });
        lead.followUpNotifiedAt = new Date();
        await lead.save();
      }

      if (holds || quotes || dueLeads.length) {
        logger.info(`Vendor OS cron: ${holds} holds released, ${quotes} quotes expired, ${dueLeads.length} follow-ups notified`);
      }
    } catch (error) {
      logger.error('Vendor OS 15-minute cron failed:', error);
    }
  },
  TZ
);

// Every day at 9:00 IST: payment reminders. Spec M3 auto-reminder schedule
// (3 days before, on the due date, 3 days after) for bookings where the
// vendor opted in; "payment due today" (spec M7) for every booking. With
// wa.me deep links we can't send on the vendor's behalf, so the vendor gets
// a notification with a one-tap reminder; the BSP phase will send directly.
cron.schedule(
  '0 9 * * *',
  async () => {
    if (!dbReady()) return;
    try {
      const today = todayIST();
      const stages = [
        { offset: 3, date: addDays(today, 3) },
        { offset: 0, date: today },
        { offset: -3, date: addDays(today, -3) },
      ];

      const bookings = await VendorBooking.find({
        status: { $in: ['hold', 'tentative', 'confirmed', 'completed'] },
        paymentSchedule: { $elemMatch: { status: { $ne: 'paid' }, dueDate: { $in: stages.map((s) => s.date) } } },
      }).limit(2000);

      let sent = 0;
      for (const booking of bookings) {
        let changed = false;
        for (const milestone of booking.paymentSchedule) {
          if (milestone.status === 'paid' || !milestone.dueDate) continue;
          const stage = stages.find((s) => s.date.getTime() === milestone.dueDate!.getTime());
          if (!stage) continue;
          if (stage.offset !== 0 && !booking.autoReminders) continue;
          if (milestone.autoReminderStages.includes(stage.offset)) continue;

          const due = round2(milestone.amount - (milestone.paidAmount || 0));
          const when = stage.offset > 0 ? `due on ${formatDisplayDate(milestone.dueDate)}` : stage.offset === 0 ? 'due today' : `overdue since ${formatDisplayDate(milestone.dueDate)}`;
          await VendorNotifyService.notify({
            vendorId: booking.vendorId,
            type: stage.offset < 0 ? 'payment_overdue' : 'payment_due',
            title: `${booking.client.name}: ${formatINR(due)} ${when}`,
            body: `${milestone.label} · ${booking.bookingNumber} — tap to send a WhatsApp reminder`,
            entityType: 'booking',
            entityId: booking._id as mongoose.Types.ObjectId,
          });
          milestone.autoReminderStages.push(stage.offset);
          changed = true;
          sent++;
        }
        if (changed) {
          booking.markModified('paymentSchedule');
          await booking.save();
        }
      }

      const completed = await VendorBookingService.autoComplete();
      logger.info(`Vendor OS daily cron: ${sent} payment reminders, ${completed} bookings auto-completed`);
    } catch (error) {
      logger.error('Vendor OS daily cron failed:', error);
    }
  },
  TZ
);
