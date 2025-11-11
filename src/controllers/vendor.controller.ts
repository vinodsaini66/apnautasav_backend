import { Request, Response } from 'express';
import { Vendor } from '../models/vendor.model';
import { ApiResponse } from '../utils/apiResponse';
import { ActivityService } from '../services/activity.service';
import logger from '../utils/logger';

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
      const { page = 1, limit = 50, category, bookingStatus } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const filter: any = { weddingId };

      if (category) filter.category = category;
      if (bookingStatus) filter.bookingStatus = bookingStatus;

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
}