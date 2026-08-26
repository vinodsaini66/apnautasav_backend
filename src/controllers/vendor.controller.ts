import { Request, Response } from 'express';
import { Vendor } from '../models/vendor.model';
import { WeddingVendor } from '../models/wedding-vendor.model';
import { VendorCategoryMapping } from '../models/vendor-category-mapping.model';
import { VendorCategory } from '../models/vendor-category.model';
import { VendorInquiry } from '../models/vendor-enquery.model';
import { User } from '../models/user.model';
import { ApiResponse } from '../utils/apiResponse';
import { ActivityService } from '../services/activity.service';
import { uploadBufferToS3, deleteObjectFromS3ByUrl } from '../config/s3';
import logger from '../utils/logger';

// Wedding-scoped Vendor.category enum values, in priority order for
// keyword matching below.
const WEDDING_VENDOR_CATEGORIES = [
  'catering',
  'photography',
  'decoration',
  'music',
  'venue',
  'invitations',
  'logistics',
  'others'
] as const;
type WeddingVendorCategory = (typeof WEDDING_VENDOR_CATEGORIES)[number];

// Best-effort mapping from a free-text public VendorCategory name (e.g.
// "Wedding Photographers", "Banquet Halls") to the closest wedding-scoped
// category enum value. Falls back to 'others' when nothing matches
// confidently — the request body can always override with an explicit
// `category`.
const mapMarketplaceCategoryToVendorCategory = (categoryName?: string): WeddingVendorCategory => {
  if (!categoryName) return 'others';

  const name = categoryName.toLowerCase();

  const keywordMap: Record<WeddingVendorCategory, string[]> = {
    catering: ['catering', 'caterer', 'food'],
    photography: ['photo', 'video', 'cinemat'],
    decoration: ['decor', 'florist', 'flower', 'mandap'],
    music: ['music', 'dj', 'band', 'sangeet', 'orchestra'],
    venue: ['venue', 'banquet', 'hall', 'hotel', 'resort', 'lawn', 'farmhouse'],
    invitations: ['invit', 'card', 'stationery'],
    logistics: ['transport', 'logistic', 'cab', 'car rental'],
    others: []
  };

  for (const category of WEDDING_VENDOR_CATEGORIES) {
    if (category === 'others') continue;
    if (keywordMap[category].some((keyword) => name.includes(keyword))) {
      return category;
    }
  }

  return 'others';
};

export class VendorController {
  static async createVendor(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const userId = req.user?.userId;
      const vendorData = req.body;

      const vendor = await Vendor.create({
        ...vendorData,
        weddingId,
        addedBy: userId
      });

      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'created',
        entityType: 'vendor',
        entityId: String(vendor._id),
        entityName: vendor.vendorName,
        description: `Added vendor: ${vendor.vendorName}`
      });

      ApiResponse.success(res, 201, {
        message: 'Vendor added successfully',
        data: vendor
      });
    } catch (error: any) {
      logger.error('Create vendor error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to add vendor');
    }
  }

  static async getVendors(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId } = req.params;
      const { page = 1, limit = 50, category, bookingStatus, eventId } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const filter: any = { weddingId };

      if (category) filter.category = category;
      if (bookingStatus) filter.bookingStatus = bookingStatus;
      if (eventId) filter.eventIds = eventId;

      const vendors = await Vendor.find(filter)
        .populate('addedBy', 'fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

      const total = await Vendor.countDocuments(filter);

      ApiResponse.paginated(res, vendors, Number(page), Number(limit), total);
    } catch (error: any) {
      logger.error('Get vendors error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch vendors');
    }
  }

  static async updateVendor(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, vendorId } = req.params;
      const userId = req.user?.userId;
      const updateData = req.body;

      const vendor = await Vendor.findOneAndUpdate(
        { _id: vendorId, weddingId },
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!vendor) {
        ApiResponse.error(res, 404, 'Vendor not found');
        return;
      }

      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'updated',
        entityType: 'vendor',
        entityId: String(vendor._id),
        entityName: vendor.vendorName,
        description: `Updated vendor: ${vendor.vendorName}`
      });

      ApiResponse.success(res, 200, {
        message: 'Vendor updated successfully',
        data: vendor
      });
    } catch (error: any) {
      logger.error('Update vendor error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to update vendor');
    }
  }

  static async deleteVendor(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, vendorId } = req.params;
      const userId = req.user?.userId;

      const vendor = await Vendor.findOneAndDelete({ _id: vendorId, weddingId });

      if (!vendor) {
        ApiResponse.error(res, 404, 'Vendor not found');
        return;
      }

      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'deleted',
        entityType: 'vendor',
        entityName: vendor.vendorName,
        description: `Deleted vendor: ${vendor.vendorName}`
      });

      ApiResponse.success(res, 200, {
        message: 'Vendor deleted successfully'
      });
    } catch (error: any) {
      logger.error('Delete vendor error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to delete vendor');
    }
  }

  static async uploadContracts(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, vendorId } = req.params;
      const userId = req.user?.userId;
      const documentType = ['contract', 'invoice', 'other'].includes(req.body?.documentType)
        ? req.body.documentType
        : 'other';

      if (!userId) {
        ApiResponse.error(res, 401, 'Unauthorized');
        return;
      }

      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        ApiResponse.error(res, 400, 'No files provided (field name: "files")');
        return;
      }

      const vendor = await Vendor.findOne({ _id: vendorId, weddingId });
      if (!vendor) {
        ApiResponse.error(res, 404, 'Vendor not found');
        return;
      }

      const uploaded = await Promise.all(
        files.map(async (file) => {
          const url = await uploadBufferToS3(
            file.buffer,
            file.originalname,
            file.mimetype,
            `vendors/${vendorId}/contracts`
          );

          return {
            url,
            fileName: file.originalname,
            documentType,
            uploadedBy: userId,
            uploadedAt: new Date()
          };
        })
      );

      vendor.contracts.push(...(uploaded as any[]));
      await vendor.save();

      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'updated',
        entityType: 'vendor',
        entityId: String(vendor._id),
        entityName: vendor.vendorName,
        description: `Uploaded ${uploaded.length} document(s) for vendor: ${vendor.vendorName}`
      });

      ApiResponse.success(res, 201, {
        message: 'Documents uploaded successfully',
        data: vendor
      });
    } catch (error: any) {
      logger.error('Upload vendor contracts error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to upload documents');
    }
  }

  static async deleteContract(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, vendorId, documentId } = req.params;
      const userId = req.user?.userId;

      const vendor = await Vendor.findOne({ _id: vendorId, weddingId });
      if (!vendor) {
        ApiResponse.error(res, 404, 'Vendor not found');
        return;
      }

      const document = vendor.contracts.find((doc: any) => String(doc._id) === documentId);
      if (!document) {
        ApiResponse.error(res, 404, 'Document not found');
        return;
      }

      vendor.contracts = vendor.contracts.filter((doc: any) => String(doc._id) !== documentId);
      await vendor.save();

      try {
        await deleteObjectFromS3ByUrl(document.url);
      } catch (s3Error) {
        logger.error('Best-effort S3 delete failed for vendor contract:', s3Error);
      }

      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'updated',
        entityType: 'vendor',
        entityId: String(vendor._id),
        entityName: vendor.vendorName,
        description: `Removed document "${document.fileName}" from vendor: ${vendor.vendorName}`
      });

      ApiResponse.success(res, 200, {
        message: 'Document deleted successfully',
        data: vendor
      });
    } catch (error: any) {
      logger.error('Delete vendor contract error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to delete document');
    }
  }

  static async addFromMarketplace(req: Request, res: Response): Promise<void> {
    try {
      const { weddingId, weddingVendorId } = req.params;
      const userId = req.user?.userId;

      const weddingVendor = await WeddingVendor.findOne({
        _id: weddingVendorId,
        status: 'active',
        isDeleted: { $ne: true }
      });

      if (!weddingVendor) {
        ApiResponse.error(res, 404, 'Vendor not found in marketplace');
        return;
      }

      let category = req.body?.category as WeddingVendorCategory | undefined;
      if (!category) {
        const primaryMapping = await VendorCategoryMapping.findOne({
          vendorId: weddingVendor._id,
          isPrimary: true,
          isActive: true
        });

        const vendorCategory = primaryMapping
          ? await VendorCategory.findById(primaryMapping.categoryId)
          : null;

        category = mapMarketplaceCategoryToVendorCategory(vendorCategory?.name);
      }

      const vendor = await Vendor.create({
        weddingId,
        vendorName: weddingVendor.displayName || weddingVendor.businessName,
        category,
        contactPerson: weddingVendor.contactPerson,
        phoneNumber: weddingVendor.phone || '',
        email: weddingVendor.email,
        website: weddingVendor.website,
        estimatedCost: weddingVendor.pricing?.startingPrice || 0,
        bookingStatus: 'inquiry',
        marketplaceVendorId: weddingVendor._id,
        addedBy: userId
      });

      await WeddingVendor.updateOne({ _id: weddingVendor._id }, { $inc: { inquiryCount: 1 } });

      // req.user only carries userId/phoneNumber/role from the JWT (see
      // types/express.d.ts) — fetch the full profile for the inquiry's
      // fullName/phone, same as CollaboratorController does when it needs
      // more than the token gives it.
      const user = await User.findById(userId);

      await VendorInquiry.create({
        weddingVendorId: weddingVendor._id,
        weddingId,
        userId,
        fullName: req.body?.fullName || user?.fullName || 'Wedding organizer',
        phone: req.body?.phone || user?.phoneNumber || req.user?.phoneNumber || '',
        source: 'wedding_dashboard',
        status: 'new'
      });

      await ActivityService.logActivity({
        weddingId,
        userId: userId!,
        actionType: 'created',
        entityType: 'vendor',
        entityId: String(vendor._id),
        entityName: vendor.vendorName,
        description: `Added vendor from marketplace: ${vendor.vendorName}`
      });

      ApiResponse.success(res, 201, {
        message: 'Vendor added from marketplace successfully',
        data: vendor
      });
    } catch (error: any) {
      logger.error('Add vendor from marketplace error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to add vendor from marketplace');
    }
  }
}