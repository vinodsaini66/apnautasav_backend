import { Request, Response } from 'express';
import { Wedding } from '../models/wedding.model';
import { Collaborator } from '../models/collaborator.model';
import { Guest } from '../models/guest.model';
import { Task } from '../models/task.model';
import { Budget } from '../models/budget.model';
import { Vendor } from '../models/vendor.model';
import { WeddingVendor } from '../models/wedding-vendor.model';
import { VendorCategoryMapping } from '../models/vendor-category-mapping.model';
import { VendorCategory } from '../models/vendor-category.model';
import { WeddingEvent } from '../models/event.model';
import { SharedNote } from '../models/sharedNote.model';
import { Comment } from '../models/comment.model';
import { Activity } from '../models/activity.model';
import { Notification } from '../models/notification.model';
import CollaborationInvitation from '../models/collaborationInvitation';
import { generateWeddingCode, ensurePublicSlug } from '../utils/generateCode';
import { mapMarketplaceCategoryToVendorCategory } from '../utils/vendorCategoryMapping';
import { ApiResponse } from '../utils/apiResponse';
import { ActivityService } from '../services/activity.service';
import { PlanResolutionService } from '../services/plan-resolution.service';
import { buildEventAttributes, buildWeddingDayEventAttributes, generateICS } from '../services/calendar.service';
import logger from '../utils/logger';
import mongoose from 'mongoose';

const DEFAULT_FUNCTION_TITLES: Record<string, string> = {
  mehendi: 'Mehendi',
  haldi: 'Haldi',
  sangeet: 'Sangeet',
  reception: 'Reception',
  engagement: 'Engagement',
  cocktail: 'Cocktail',
  ceremony: 'Ceremony',
  other: 'Function'
};

export class WeddingController {
  /**
   * GET /:weddingId/plan — the effective plan/limits currently in force for
   * this wedding plus current usage, resolved from the wedding OWNER's
   * account (not the requester's, if they're only a collaborator). Powers
   * usage bars and tab gating on the frontend.
   */
  static async getWeddingPlan(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;

      const wedding = await Wedding.findById(weddingId).select('createdBy');
      if (!wedding) {
        ApiResponse.error(res, 404, 'Wedding not found');
        return;
      }

      const [effective, usage] = await Promise.all([
        PlanResolutionService.getEffectivePlanForWedding(String(wedding.createdBy), weddingId),
        PlanResolutionService.getCurrentUsage(weddingId),
      ]);

      ApiResponse.success(res, 200, {
        message: 'Wedding plan fetched successfully',
        data: {
          planKey: effective.planKey,
          source: effective.source,
          limits: effective.limits,
          budgetEnabled: effective.budgetEnabled,
          usage,
        },
      });
    } catch (error: any) {
      logger.error('Get wedding plan error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch wedding plan');
    }
  }

  static async createWedding(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { brideName, groomName, weddingDate, location, totalBudget, currency, description, imageUrl, name, functions } = req.body;

      const weddingCode = generateWeddingCode();

      const wedding = await Wedding.create({
        weddingCode,
        name,
        brideName,
        groomName,
        weddingDate,
        location,
        totalBudget,
        currency: currency || 'INR',
        description,
        imageUrl,
        createdBy: userId,
        status: 'planning'
      });

      // Log activity
      await ActivityService.logActivity({
        weddingId: String(wedding._id),
        userId: userId!,
        actionType: 'created',
        entityType: 'wedding',
        entityId: String(wedding._id),
        entityName: `${brideName} & ${groomName}`,
        description: `Created wedding for ${brideName} and ${groomName}`
      });

      // Optional "which functions are you planning?" onboarding step —
      // bulk-creates the Mehendi/Haldi/Sangeet/Reception (etc.) Events
      // alongside the wedding in one request. The main wedding day itself
      // is deliberately NOT one of these — it stays the weddingDate/location
      // fields above, so there's only ever one place that date lives.
      let events: any[] = [];
      if (Array.isArray(functions) && functions.length > 0) {
        const docs = functions.map((fn: { eventType: string; title?: string; startDateTime?: string }) => {
          const startDateTime = fn.startDateTime ? new Date(fn.startDateTime) : undefined;
          return {
            weddingId: wedding._id,
            eventType: fn.eventType,
            title: fn.title || DEFAULT_FUNCTION_TITLES[fn.eventType] || 'Function',
            startDateTime,
            // A sensible default window so the event isn't left with a
            // start but no end — easy to adjust later from the Event
            // detail page.
            endDateTime: startDateTime ? new Date(startDateTime.getTime() + 4 * 60 * 60 * 1000) : undefined,
            createdBy: userId,
            status: 'planning'
          };
        });

        events = await WeddingEvent.insertMany(docs);
      }

      ApiResponse.success(res, 201, {
        message: 'Wedding created successfully',
        data: { ...wedding.toObject(), events }
      });
    } catch (error: any) {
      logger.error('Create wedding error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to create wedding');
    }
  }

  static async getWeddings(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { page = 1, limit = 200, status } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const filter: any = {};

      if (status) {
        filter.status = status;
      }

      // Get weddings created by user
      const createdWeddings = await Wedding.find({
        ...filter,
        createdBy: userId
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

      // Get weddings where user is collaborator
      const collaborations = await Collaborator.find({
        userId,
        invitationStatus: 'accepted'
      }).select('weddingId');

      const collaboratorWeddingIds = collaborations.map(c => c.weddingId);

      const collaboratorWeddings = await Wedding.find({
        ...filter,
        _id: { $in: collaboratorWeddingIds }
      })
        .sort({ createdAt: -1 })
        .lean();

      const allWeddings = [...createdWeddings, ...collaboratorWeddings];
      const total = allWeddings.length;

      ApiResponse.paginated(res, allWeddings, Number(page), Number(limit), total);
    } catch (error: any) {
      logger.error('Get weddings error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch weddings');
    }
  }

  static async getWeddingInvitation(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { page = 1, limit = 200, } = req.query;

      const skip = (Number(page) - 1) * Number(limit);

      const invitations = await Collaborator.find({
        userId,
        invitationStatus: 'pending'
      }).populate('weddingId', 'name location brideName groomName weddingDate').sort({ createdAt: -1 })
        .skip(skip).limit(Number(limit))
        .lean();


      ApiResponse.paginated(res, invitations, Number(page), Number(limit), invitations.length);
    } catch (error: any) {
      logger.error('Get weddings error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch weddings');
    }
  }

  static async getWeddingById(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;

      const wedding = await Wedding.findById(weddingId)
        .populate('createdBy', 'fullName email phoneNumber')
        .lean();

      const [totalGuest, totalTask, spent] = await Promise.all([
        Guest.countDocuments({ weddingId }),
        Task.countDocuments({ weddingId }),
        Budget.aggregate([
          { $match: { weddingId: new mongoose.Types.ObjectId(weddingId as any), status: 'paid' } },
          { $group: { _id: null, total: { $sum: '$actualCost' } } }
        ]).then(result => result[0]?.total || 0)
      ]); // Placeholder for any future parallel operations

      if (!wedding) {
        ApiResponse.error(res, 404, 'Wedding not found');
        return;
      }

      // Get collaborators
      const collaborators = await Collaborator.find({
        weddingId,
        invitationStatus: 'accepted'
      })
        .populate('userId', 'fullName email phoneNumber')
        .lean();

      ApiResponse.success(res, 200, {
        data: {
          ...wedding,
          collaborators,
          totalGuest, totalTask, spent
        }
      });
    } catch (error: any) {
      logger.error('Get wedding error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch wedding');
    }
  }

  static async updateWedding(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const userId = req.user?.userId;
      const updateData = req.body;

      const wedding = await Wedding.findByIdAndUpdate(
        weddingId,
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!wedding) {
        ApiResponse.error(res, 404, 'Wedding not found');
        return;
      }

      // Log activity
      await ActivityService.logActivity({
        weddingId: String(wedding._id),
        userId: userId!,
        actionType: 'updated',
        entityType: 'wedding',
        entityId: String(wedding._id),
        entityName: `${wedding.brideName} & ${wedding.groomName}`,
        description: 'Updated wedding details'
      });

      ApiResponse.success(res, 200, {
        message: 'Wedding updated successfully',
        data: wedding
      });
    } catch (error: any) {
      logger.error('Update wedding error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to update wedding');
    }
  }

  static async updateWeddingInvitation(req: Request, res: Response): Promise<void> {
    try {
      const { inviteId } = req.params;
      const userId = req.user?.userId;
      const updateData = {
        invitationStatus : req.body.status ?? 'pending',
      }
      console.log({ updateData });


      const wedding = await Collaborator.findByIdAndUpdate(
        inviteId,
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!wedding) {
        ApiResponse.error(res, 404, 'Invitation not found');
        return;
      }

      // Log activity
      await ActivityService.logActivity({
        weddingId: String(wedding._id),
        userId: userId!,
        actionType: 'updated',
        entityType: 'collaborator',
        entityId: String(wedding._id),
        entityName: `Collaborator for wedding ${wedding.weddingId}`,
        description: 'Updated collaborator details'
      });

      ApiResponse.success(res, 200, {
        message: 'Collaborator updated successfully',
        data: wedding
      });
    } catch (error: any) {
      logger.error('Update wedding error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to update wedding');
    }
  }

  static async deleteWedding(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;

      const wedding = await Wedding.findByIdAndDelete(weddingId);

      if (!wedding) {
        ApiResponse.error(res, 404, 'Wedding not found');
        return;
      }

      // Delete related data — every collection that carries a weddingId,
      // so deleting a wedding never leaves orphaned documents behind.
      await Promise.all([
        Guest.deleteMany({ weddingId }),
        Task.deleteMany({ weddingId }),
        Budget.deleteMany({ weddingId }),
        Collaborator.deleteMany({ weddingId }),
        Vendor.deleteMany({ weddingId }),
        WeddingEvent.deleteMany({ weddingId }),
        SharedNote.deleteMany({ weddingId }),
        Comment.deleteMany({ weddingId }),
        Activity.deleteMany({ weddingId }),
        Notification.deleteMany({ weddingId }),
        CollaborationInvitation.deleteMany({ weddingId })
      ]);

      ApiResponse.success(res, 200, {
        message: 'Wedding deleted successfully'
      });
    } catch (error: any) {
      logger.error('Delete wedding error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to delete wedding');
    }
  }

  static async joinWedding(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { weddingCode } = req.body;

      const wedding = await Wedding.findOne({ weddingCode });

      if (!wedding) {
        ApiResponse.error(res, 404, 'Invalid wedding code');
        return;
      }

      // Check if already a collaborator
      const existingCollaborator = await Collaborator.findOne({
        weddingId: wedding._id,
        userId
      });

      if (existingCollaborator) {
        ApiResponse.error(res, 400, 'You are already a member of this wedding');
        return;
      }

      // Add as collaborator. Join-by-code is instant (no approval step), so
      // default to the least-privileged role — a wedding admin can promote
      // the collaborator afterwards via the collaborator management screen.
      const collaborator = await Collaborator.create({
        weddingId: wedding._id,
        userId,
        role: 'viewer',
        invitationStatus: 'accepted',
        joinedAt: new Date()
      });

      // Log activity
      await ActivityService.logActivity({
        weddingId: String(wedding._id),
        userId: userId!,
        actionType: 'member_joined',
        entityType: 'collaborator',
        description: 'Joined the wedding using code'
      });

      ApiResponse.success(res, 200, {
        message: 'Successfully joined the wedding',
        data: {
          wedding,
          collaborator
        }
      });
    } catch (error: any) {
      logger.error('Join wedding error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to join wedding');
    }
  }

  static async getWeddingStats(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;

      const [
        guestCount,
        confirmedGuestCount,
        taskCount,
        completedTasks,
        budgetItems,
        trackedBudgetItems,
        totalSpent,
        vendorCount,
        bookedVendorCount
      ] = await Promise.all([
        Guest.countDocuments({ weddingId }),
        Guest.countDocuments({ weddingId, rsvpStatus: 'confirmed' }),
        Task.countDocuments({ weddingId }),
        Task.countDocuments({ weddingId, status: 'completed' }),
        Budget.countDocuments({ weddingId }),
        Budget.countDocuments({ weddingId, actualCost: { $ne: null, $exists: true } }),
        Budget.aggregate([
          { $match: { weddingId: new mongoose.Types.ObjectId(weddingId) } },
          { $group: { _id: null, total: { $sum: '$actualCost' } } }
        ]),
        Vendor.countDocuments({ weddingId }),
        Vendor.countDocuments({ weddingId, bookingStatus: { $in: ['booked', 'confirmed'] } })
      ]);

      const wedding = await Wedding.findById(weddingId).select('totalBudget');

      // Four 0-100 sub-rates that roll up into one overview progress bar.
      // First-pass formula: simple unweighted average, easy to retune later.
      const completionRate = taskCount > 0 ? (completedTasks / taskCount) * 100 : 0;
      const rsvpRate = guestCount > 0 ? (confirmedGuestCount / guestCount) * 100 : 0;
      const trackedRate = budgetItems > 0 ? (trackedBudgetItems / budgetItems) * 100 : 0;
      const bookedRate = vendorCount > 0 ? (bookedVendorCount / vendorCount) * 100 : 0;

      const planningProgress = Math.round((completionRate + rsvpRate + trackedRate + bookedRate) / 4);

      const stats = {
        guests: {
          total: guestCount,
          rsvpRate: guestCount > 0 ? Number(rsvpRate.toFixed(2)) : 0
        },
        tasks: {
          total: taskCount,
          completed: completedTasks,
          pending: taskCount - completedTasks,
          completionRate: taskCount > 0 ? completionRate.toFixed(2) : 0
        },
        budget: {
          total: wedding?.totalBudget || 0,
          spent: totalSpent[0]?.total || 0,
          remaining: (wedding?.totalBudget || 0) - (totalSpent[0]?.total || 0),
          items: budgetItems,
          trackedRate: budgetItems > 0 ? Number(trackedRate.toFixed(2)) : 0
        },
        vendors: {
          total: vendorCount,
          bookedRate: vendorCount > 0 ? Number(bookedRate.toFixed(2)) : 0
        },
        planningProgress
      };

      ApiResponse.success(res, 200, { data: stats });
    } catch (error: any) {
      logger.error('Get wedding stats error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch wedding statistics');
    }
  }

  /**
   * PUT /:weddingId/public-settings — toggles the wedding website on/off
   * and optionally sets/changes its publicSlug. Auto-generates a slug from
   * bride+groom names on first enable if none is supplied, retrying on a
   * duplicate-key collision.
   */
  static async updatePublicSettings(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const { isPublic, publicSlug } = req.body as { isPublic: boolean; publicSlug?: string };

      const wedding = await Wedding.findById(weddingId);
      if (!wedding) {
        ApiResponse.error(res, 404, 'Wedding not found');
        return;
      }

      // An explicitly-supplied slug (new or edited) must not collide with
      // another wedding's.
      if (publicSlug && publicSlug !== wedding.publicSlug) {
        const taken = await Wedding.findOne({ publicSlug, _id: { $ne: weddingId } }).select('_id').lean();
        if (taken) {
          ApiResponse.error(res, 400, 'This link is already taken — please choose another');
          return;
        }
        wedding.publicSlug = publicSlug;
      }

      wedding.isPublic = !!isPublic;

      if (isPublic && !wedding.publicSlug) {
        await ensurePublicSlug(wedding);
      } else {
        await wedding.save();
      }

      ApiResponse.success(res, 200, {
        message: 'Public settings updated successfully',
        data: { isPublic: wedding.isPublic, publicSlug: wedding.publicSlug }
      });
    } catch (error: any) {
      logger.error('Update public settings error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to update public settings');
    }
  }

  /**
   * GET /public/:slug — unauthenticated. Returns a curated, guest-safe
   * subset only. 404 (generic) for both "no such slug" and "not public" —
   * never leaks a wedding's existence either way.
   */
  static async getPublicWeddingBySlug(req: Request, res: Response): Promise<void> {
    try {
      const { slug } = req.params;

      const wedding = await Wedding.findOne({ publicSlug: slug, isPublic: true }).lean();
      if (!wedding) {
        ApiResponse.error(res, 404, 'Wedding page not found');
        return;
      }

      ApiResponse.success(res, 200, {
        data: {
          name: wedding.name,
          brideName: wedding.brideName,
          groomName: wedding.groomName,
          weddingDate: wedding.weddingDate,
          location: wedding.location,
          description: wedding.description,
          imageUrl: wedding.imageUrl,
          status: wedding.status
        }
      });
    } catch (error: any) {
      logger.error('Get public wedding error:', error);
      ApiResponse.error(res, 500, 'Failed to fetch wedding page');
    }
  }

  /**
   * GET /public/:slug/events — same lookup-then-check-isPublic pattern,
   * then the public event schedule only (no budget/vendor/task linkage).
   */
  static async getPublicWeddingEvents(req: Request, res: Response): Promise<void> {
    try {
      const { slug } = req.params;

      const wedding = await Wedding.findOne({ publicSlug: slug, isPublic: true }).select('_id').lean();
      if (!wedding) {
        ApiResponse.error(res, 404, 'Wedding page not found');
        return;
      }

      const events = await WeddingEvent.find({ weddingId: wedding._id })
        .select('title eventType startDateTime endDateTime location dressCode status')
        .sort({ startDateTime: 1 })
        .lean();

      ApiResponse.success(res, 200, { data: events });
    } catch (error: any) {
      logger.error('Get public wedding events error:', error);
      ApiResponse.error(res, 500, 'Failed to fetch wedding events');
    }
  }

  /**
   * GET /:weddingId/search?q= — fans out parallel case-insensitive regex
   * queries across every resource, capped at 5 hits each, and returns a
   * single flattened array tagged with `type` (the frontend command
   * palette groups by this field client-side rather than the API
   * pre-grouping the response).
   */
  static async globalSearch(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

      if (!q) {
        ApiResponse.success(res, 200, { data: [] });
        return;
      }

      const regex = { $regex: q, $options: 'i' };

      const [guests, tasks, budgetItems, vendors, events, notes] = await Promise.all([
        Guest.find({ weddingId, $or: [{ name: regex }, { email: regex }, { phoneNumber: regex }] })
          .select('name category')
          .limit(5)
          .lean(),
        Task.find({ weddingId, $or: [{ title: regex }, { description: regex }] })
          .select('title status')
          .limit(5)
          .lean(),
        Budget.find({ weddingId, description: regex })
          .select('description category')
          .limit(5)
          .lean(),
        Vendor.find({ weddingId, vendorName: regex })
          .select('vendorName category')
          .limit(5)
          .lean(),
        WeddingEvent.find({ weddingId, title: regex })
          .select('title eventType')
          .limit(5)
          .lean(),
        SharedNote.find({ weddingId, $or: [{ title: regex }, { content: regex }] })
          .select('title content')
          .limit(5)
          .lean()
      ]);

      const results = [
        ...guests.map((g) => ({ _id: g._id, type: 'guest', title: g.name, subtitle: g.category })),
        ...tasks.map((t) => ({ _id: t._id, type: 'task', title: t.title, subtitle: t.status })),
        ...budgetItems.map((b) => ({ _id: b._id, type: 'budget', title: b.description, subtitle: b.category })),
        ...vendors.map((v) => ({ _id: v._id, type: 'vendor', title: v.vendorName, subtitle: v.category })),
        ...events.map((e) => ({ _id: e._id, type: 'event', title: e.title, subtitle: e.eventType })),
        ...notes.map((n) => ({
          _id: n._id,
          type: 'note',
          title: n.title,
          subtitle: n.content ? n.content.slice(0, 80) : ''
        }))
      ];

      ApiResponse.success(res, 200, { data: results });
    } catch (error: any) {
      logger.error('Global search error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to search');
    }
  }

  /**
   * GET /:weddingId/recommended-vendors — top 4 highest-rated active
   * marketplace listings whose primary category isn't already covered by
   * one of this wedding's own booked/confirmed vendors. Category for each
   * candidate is resolved via its primary VendorCategoryMapping, the same
   * lookup VendorController#addFromMarketplace uses, batched into 2 queries
   * up front rather than looked up per-candidate.
   */
  static async getRecommendedVendors(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;

      const bookedCategories = await Vendor.find({
        weddingId,
        bookingStatus: { $in: ['booked', 'confirmed'] }
      }).distinct('category');

      // A capped pool of the highest-rated active listings — plenty to
      // find 4 unmatched-category recommendations from without scanning
      // the whole marketplace.
      const candidates = await WeddingVendor.find({ status: 'active', isDeleted: { $ne: true } })
        .sort({ rating: -1 })
        .limit(50)
        .select('businessName displayName rating reviewCount pricing coverImage slug location')
        .lean();

      const candidateIds = candidates.map((c) => c._id);

      const mappings = await VendorCategoryMapping.find({
        vendorId: { $in: candidateIds },
        isPrimary: true,
        isActive: true
      }).lean();

      const categoryIds = mappings.map((m) => m.categoryId);
      const categories = await VendorCategory.find({ _id: { $in: categoryIds } }).select('name').lean();

      const categoryNameById = new Map(categories.map((c) => [String(c._id), c.name]));
      const categoryNameByVendorId = new Map(
        mappings.map((m) => [String(m.vendorId), categoryNameById.get(String(m.categoryId))])
      );

      const recommended: any[] = [];
      for (const candidate of candidates) {
        if (recommended.length >= 4) break;

        const mappedCategory = mapMarketplaceCategoryToVendorCategory(categoryNameByVendorId.get(String(candidate._id)));
        if (bookedCategories.includes(mappedCategory)) continue;

        recommended.push({
          _id: candidate._id,
          slug: candidate.slug,
          businessName: candidate.businessName,
          displayName: candidate.displayName,
          category: mappedCategory,
          rating: candidate.rating,
          reviewCount: candidate.reviewCount,
          pricing: candidate.pricing,
          coverImage: candidate.coverImage,
          // Frontend's recommended-vendor card (Overview tab) reads
          // vendor.location?.area/.city for the subtitle line, matching the
          // real marketplace card's convention — include it so that line
          // isn't silently blank.
          location: candidate.location
        });
      }

      ApiResponse.success(res, 200, { data: recommended });
    } catch (error: any) {
      logger.error('Get recommended vendors error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch recommended vendors');
    }
  }

  /**
   * GET /:weddingId/calendar.ics — one VEVENT per dated Event plus one for
   * the wedding day itself (Wedding.weddingDate).
   */
  static async getWeddingCalendar(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;

      const wedding = await Wedding.findById(weddingId).select('name weddingDate location').lean();
      if (!wedding) {
        ApiResponse.error(res, 404, 'Wedding not found');
        return;
      }

      const events = await WeddingEvent.find({ weddingId }).lean();

      const eventAttrs = events
        .map((event) => buildEventAttributes(event))
        .filter((attrs): attrs is NonNullable<typeof attrs> => attrs !== null);

      eventAttrs.push(buildWeddingDayEventAttributes(wedding));

      const ics = generateICS(eventAttrs);

      res.setHeader('Content-Type', 'text/calendar');
      res.setHeader('Content-Disposition', 'attachment; filename="wedding.ics"');
      res.send(ics);
    } catch (error: any) {
      logger.error('Get wedding calendar error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to generate calendar');
    }
  }
}