import { Request, Response } from 'express';
import fs from 'fs';
import { VendorProfileService } from '../../services/vendor-os/profile.service';
import { VendorPackageService } from '../../services/vendor-os/package.service';
import { VendorPortfolioService } from '../../services/vendor-os/portfolio.service';
import { CategoryConfigService } from '../../services/vendor-os/category-config.service';
import { getPlanUsage } from '../../services/vendor-os/plan-limits';
import { uploadBufferToS3, uploadFileToS3 } from '../../config/s3';
import { ApiResponse } from '../../utils/apiResponse';
import { badRequest, handle } from '../../utils/vendorOs';
import { q, vendorIdOf } from './_context';

export class VendorOsProfileController {
  // ---- categories (also used before onboarding) ----------------------
  static listCategories = handle(async (_req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await CategoryConfigService.list() });
  }, 'list categories');

  static getCategory = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await CategoryConfigService.getByKey(req.params.key) });
  }, 'get category');

  // ---- profile --------------------------------------------------------
  static getProfile = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorProfileService.getProfile(vendorIdOf(req)) });
  }, 'get profile');

  static updateProfile = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Profile updated', data: await VendorProfileService.updateProfile(vendorIdOf(req), req.body) });
  }, 'update profile');

  static completeness = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorProfileService.computeCompleteness(vendorIdOf(req)) });
  }, 'completeness');

  static submit = handle(async (req: Request, res: Response) => {
    const result = await VendorProfileService.submitForReview(vendorIdOf(req));
    ApiResponse.success(res, 200, { message: result.message, data: result });
  }, 'submit profile');

  static unpublish = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Profile hidden from ApnaUtsav', data: await VendorProfileService.unpublish(vendorIdOf(req)) });
  }, 'unpublish');

  static preview = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorProfileService.preview(vendorIdOf(req)) });
  }, 'preview');

  static plan = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await getPlanUsage(vendorIdOf(req)) });
  }, 'plan');

  // ---- packages -------------------------------------------------------
  static listPackages = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorPackageService.list(vendorIdOf(req)) });
  }, 'list packages');

  static createPackage = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 201, { message: 'Package added', data: await VendorPackageService.create(vendorIdOf(req), req.body) });
  }, 'create package');

  static updatePackage = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Package updated', data: await VendorPackageService.update(vendorIdOf(req), req.params.packageId, req.body) });
  }, 'update package');

  static deletePackage = handle(async (req: Request, res: Response) => {
    await VendorPackageService.remove(vendorIdOf(req), req.params.packageId);
    ApiResponse.success(res, 200, { message: 'Package deleted' });
  }, 'delete package');

  // ---- portfolio ------------------------------------------------------
  static listAlbums = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorPortfolioService.listAlbums(vendorIdOf(req)) });
  }, 'list albums');

  static getAlbum = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorPortfolioService.getAlbum(vendorIdOf(req), req.params.albumId) });
  }, 'get album');

  static createAlbum = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 201, { message: 'Album created', data: await VendorPortfolioService.createAlbum(vendorIdOf(req), req.body) });
  }, 'create album');

  static updateAlbum = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Album updated', data: await VendorPortfolioService.updateAlbum(vendorIdOf(req), req.params.albumId, req.body) });
  }, 'update album');

  static deleteAlbum = handle(async (req: Request, res: Response) => {
    await VendorPortfolioService.deleteAlbum(vendorIdOf(req), req.params.albumId);
    ApiResponse.success(res, 200, { message: 'Album deleted' });
  }, 'delete album');

  static listMedia = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { data: await VendorPortfolioService.listMedia(vendorIdOf(req), { albumId: q(req, 'albumId'), type: q(req, 'type') }) });
  }, 'list media');

  static addMedia = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 201, { message: 'Media added', data: await VendorPortfolioService.addMedia(vendorIdOf(req), req.body.items) });
  }, 'add media');

  static updateMedia = handle(async (req: Request, res: Response) => {
    ApiResponse.success(res, 200, { message: 'Media updated', data: await VendorPortfolioService.updateMedia(vendorIdOf(req), req.params.mediaId, req.body) });
  }, 'update media');

  static deleteMedia = handle(async (req: Request, res: Response) => {
    await VendorPortfolioService.deleteMedia(vendorIdOf(req), req.params.mediaId);
    ApiResponse.success(res, 200, { message: 'Media deleted' });
  }, 'delete media');

  // ---- uploads (return a URL; the caller then saves it on the profile,
  //      a media item, a payment proof, …) ------------------------------
  static uploadImage = handle(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No file uploaded (field name: "file")');
    const url = await uploadBufferToS3(req.file.buffer, req.file.originalname, req.file.mimetype, `vendor-os/${vendorIdOf(req)}/images`);
    ApiResponse.success(res, 201, { message: 'Uploaded', data: { url } });
  }, 'upload image');

  static uploadDocument = handle(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No file uploaded (field name: "file")');
    const url = await uploadBufferToS3(req.file.buffer, req.file.originalname, req.file.mimetype, `vendor-os/${vendorIdOf(req)}/documents`);
    ApiResponse.success(res, 201, { message: 'Uploaded', data: { url, fileName: req.file.originalname } });
  }, 'upload document');

  static uploadVideo = handle(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No file uploaded (field name: "file")');
    try {
      const url = await uploadFileToS3(req.file.path, req.file.originalname, req.file.mimetype, `vendor-os/${vendorIdOf(req)}/videos`);
      ApiResponse.success(res, 201, { message: 'Uploaded', data: { url } });
    } finally {
      fs.promises.unlink(req.file.path).catch(() => undefined);
    }
  }, 'upload video');
}
