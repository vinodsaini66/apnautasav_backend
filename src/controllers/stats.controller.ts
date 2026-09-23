import { Request, Response } from 'express';
import { Wedding } from '../models/wedding.model';
import { Guest } from '../models/guest.model';
import { Task } from '../models/task.model';
import { WeddingEvent } from '../models/event.model';
import { Collaborator } from '../models/collaborator.model';
import { WeddingVendor } from '../models/wedding-vendor.model';
import { Testimonial } from '../models/testimonial.model';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';

export class StatsController {
  /**
   * GET /stats/platform — public. Real platform-wide numbers for the
   * landing page's marketing marquee/impact-stats sections, replacing what
   * used to be hardcoded fake copy there. Every field here is a genuine
   * aggregate over real collections — nothing fabricated:
   *   - weddingsPlanned/cities/budgetTrackedInr/guestsManaged: straight
   *     counts/sums over Wedding/Guest.
   *   - sangeetNightsChoreographed: real count of Event docs with
   *     eventType 'sangeet'.
   *   - familyCollaborativePercent: % of weddings with at least one
   *     accepted Collaborator (i.e. actually planned with someone else,
   *     not solo) — a real, if approximate, stand-in for the old
   *     hardcoded "100% family-collaborative" claim.
   *   - checklistCompletionPercent: % of all Task docs with
   *     status 'completed'.
   *   - vendorsListed: real count of live (`status: 'active'`) public
   *     marketplace WeddingVendor listings.
   *   - averageRating/ratingCount: real average of Testimonial.rating —
   *     honest about being derived from currently-seeded testimonial
   *     content, not a fabricated "4.9★" (see scripts/seed.ts's
   *     seedTestimonials for how those rows get their rating).
   * `cities` counts distinct non-empty Wedding.location values — that
   * field is freeform text (venue name + city, not a normalized city
   * field), so this is a real but imprecise number, not a clean city
   * lookup. Documented here rather than silently treated as exact.
   */
  static async getPlatformStats(_req: Request, res: Response): Promise<void> {
    try {
      const [
        weddingsPlanned,
        cities,
        budgetAgg,
        guestsAgg,
        sangeetNightsChoreographed,
        weddingsWithCollaborator,
        totalTasks,
        completedTasks,
        vendorsListed,
        ratingAgg,
      ] = await Promise.all([
        Wedding.countDocuments({}),
        Wedding.distinct('location'),
        Wedding.aggregate([{ $group: { _id: null, total: { $sum: '$totalBudget' } } }]),
        Guest.aggregate([
          { $group: { _id: null, total: { $sum: { $add: [1, { $ifNull: ['$plusOne', 0] }] } } } },
        ]),
        WeddingEvent.countDocuments({ eventType: 'sangeet' }),
        Collaborator.distinct('weddingId', { invitationStatus: 'accepted' }),
        Task.countDocuments({}),
        Task.countDocuments({ status: 'completed' }),
        WeddingVendor.countDocuments({ status: 'active' }),
        Testimonial.aggregate([
          { $match: { isActive: true } },
          { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
        ]),
      ]);

      const citiesCount = (cities as string[]).filter((c) => !!c && c.trim().length > 0).length;
      const budgetTrackedInr = budgetAgg[0]?.total || 0;
      const guestsManaged = guestsAgg[0]?.total || 0;
      const familyCollaborativePercent =
        weddingsPlanned > 0 ? Math.round((weddingsWithCollaborator.length / weddingsPlanned) * 100) : 0;
      const checklistCompletionPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      const averageRating = ratingAgg[0]?.avg ? Math.round(ratingAgg[0].avg * 10) / 10 : null;
      const ratingCount = ratingAgg[0]?.count || 0;

      ApiResponse.success(res, 200, {
        data: {
          weddingsPlanned,
          cities: citiesCount,
          budgetTrackedInr,
          guestsManaged,
          sangeetNightsChoreographed,
          familyCollaborativePercent,
          checklistCompletionPercent,
          vendorsListed,
          averageRating,
          ratingCount,
        },
      });
    } catch (error: any) {
      logger.error('Get platform stats error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch platform stats');
    }
  }
}
