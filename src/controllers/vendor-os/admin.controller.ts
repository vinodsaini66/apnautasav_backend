import { Request, Response } from 'express';
import { VendorOsAdminService } from '../../services/vendor-os/admin.service';
import { CategoryConfigService } from '../../services/vendor-os/category-config.service';
import { ApiResponse } from '../../utils/apiResponse';
import { handle, parsePagination } from '../../utils/vendorOs';
import { q } from './_context';

export class VendorOsAdminController {
  static listVendors = handle(async (req: Request, res: Response) => {
    const { page, limit, skip } = parsePagination(req.query);
    const result = await VendorOsAdminService.listVendors({
      status: q(req, 'status'),
      osCategory: q(req, 'osCategory'),
      search: q(req, 'search'),
      osEnabled: q(req, 'osEnabled'),
      skip,
      limit,
    });
    res.status(200).json({
      status: 'success',
      data: result.items,
      meta: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit), hasMore: page * limit < result.total, statusCounts: result.statusCounts },
    });
  }, 'admin list vendors');

  static getVendor = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorOsAdminService.getVendor(req.params.vendorId) });
  }, 'admin get vendor');

  static approve = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Vendor approved and live', data: await VendorOsAdminService.approve(req.params.vendorId) });
  }, 'admin approve');

  static reject = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Vendor sent back for changes', data: await VendorOsAdminService.reject(req.params.vendorId, req.body.reason) });
  }, 'admin reject');

  static suspend = handle(async (req: Request, res: Response) => {
    const vendor = await VendorOsAdminService.setSuspended(req.params.vendorId, req.body.suspended, req.body.reason);
    ApiResponse.success(res, 200, { message: req.body.suspended ? 'Vendor suspended' : 'Vendor reinstated', data: vendor });
  }, 'admin suspend');

  static verification = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Verification updated', data: await VendorOsAdminService.setVerification(req.params.vendorId, req.body) });
  }, 'admin verification');

  static plan = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Plan updated', data: await VendorOsAdminService.setPlan(req.params.vendorId, req.body.plan) });
  }, 'admin plan');

  static assignOwner = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Listing handed over to the vendor', data: await VendorOsAdminService.assignOwner(req.params.vendorId, req.body) });
  }, 'admin assign owner');

  static listCategories = handle(async (_req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await CategoryConfigService.list(true) });
  }, 'admin list categories');

  static createCategory = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 201, { message: 'Category created', data: await CategoryConfigService.create(req.body) });
  }, 'admin create category');

  static updateCategory = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Category updated', data: await CategoryConfigService.update(req.params.key, req.body) });
  }, 'admin update category');
}
