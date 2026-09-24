import mongoose from 'mongoose';
import { VendorAlbum } from '../../models/vendor-album.model';
import { VendorMedia } from '../../models/vendor-media.model';
import { assertWithinPlan } from './plan-limits';
import { VendorProfileService } from './profile.service';
import { badRequest, notFound, toObjectId } from '../../utils/vendorOs';

// Vendor-scoped portfolio management over the existing marketplace
// VendorAlbum/VendorMedia collections — the same rows the public profile
// already reads, so nothing needs syncing.
export class VendorPortfolioService {
  static async listAlbums(vendorId: mongoose.Types.ObjectId) {
    return VendorAlbum.find({ vendorId, isDeleted: false }).sort({ sortOrder: 1, createdAt: -1 }).lean();
  }

  static async getAlbum(vendorId: mongoose.Types.ObjectId, albumId: string) {
    const album = await VendorAlbum.findOne({ _id: toObjectId(albumId, 'Album'), vendorId, isDeleted: false }).lean();
    if (!album) throw notFound('Album');
    const media = await VendorMedia.find({ vendorId, albumId: album._id, isDeleted: false }).sort({ sortOrder: 1, createdAt: 1 }).lean();
    return { ...album, media };
  }

  static async createAlbum(vendorId: mongoose.Types.ObjectId, data: any) {
    return VendorAlbum.create({ ...data, vendorId, mediaCount: 0 });
  }

  static async updateAlbum(vendorId: mongoose.Types.ObjectId, albumId: string, data: any) {
    const { vendorId: _v, mediaCount: _m, isDeleted: _d, ...rest } = data;
    const album = await VendorAlbum.findOneAndUpdate(
      { _id: toObjectId(albumId, 'Album'), vendorId, isDeleted: false },
      { $set: rest },
      { new: true, runValidators: true }
    );
    if (!album) throw notFound('Album');
    return album;
  }

  static async deleteAlbum(vendorId: mongoose.Types.ObjectId, albumId: string) {
    const album = await VendorAlbum.findOneAndUpdate(
      { _id: toObjectId(albumId, 'Album'), vendorId, isDeleted: false },
      { $set: { isDeleted: true } }
    );
    if (!album) throw notFound('Album');
    await VendorMedia.updateMany({ vendorId, albumId: album._id }, { $set: { isDeleted: true } });
    await VendorProfileService.refreshCompleteness(vendorId);
  }

  static async listMedia(vendorId: mongoose.Types.ObjectId, query: { albumId?: string; type?: string }) {
    const filter: any = { vendorId, isDeleted: false };
    if (query.albumId) filter.albumId = toObjectId(query.albumId, 'Album');
    if (query.type) filter.type = query.type;
    return VendorMedia.find(filter).sort({ sortOrder: 1, createdAt: -1 }).lean();
  }

  /** Adds one or more already-uploaded (or embed) media items. */
  static async addMedia(vendorId: mongoose.Types.ObjectId, items: any[]) {
    if (!items.length) throw badRequest('No media to add');
    const images = items.filter((i) => i.type === 'image').length;
    if (images) await assertWithinPlan(vendorId, 'photos', images);

    const albumIds = [...new Set(items.map((i) => i.albumId).filter(Boolean).map(String))];
    if (albumIds.length) {
      const owned = await VendorAlbum.countDocuments({ _id: { $in: albumIds }, vendorId, isDeleted: false });
      if (owned !== albumIds.length) throw notFound('Album');
    }

    const created = await VendorMedia.insertMany(items.map((i) => ({ ...i, vendorId })));
    await this.recountAlbums(vendorId, albumIds);
    await VendorProfileService.refreshCompleteness(vendorId);
    return created;
  }

  static async updateMedia(vendorId: mongoose.Types.ObjectId, mediaId: string, data: any) {
    const { vendorId: _v, isDeleted: _d, url: _u, type: _t, ...rest } = data;
    const before = await VendorMedia.findOne({ _id: toObjectId(mediaId, 'Media'), vendorId, isDeleted: false }).lean();
    if (!before) throw notFound('Media');
    if (rest.albumId) {
      const owned = await VendorAlbum.exists({ _id: rest.albumId, vendorId, isDeleted: false });
      if (!owned) throw notFound('Album');
    }
    const media = await VendorMedia.findByIdAndUpdate(before._id, { $set: rest }, { new: true, runValidators: true });
    await this.recountAlbums(vendorId, [before.albumId, rest.albumId].filter(Boolean).map(String));
    return media;
  }

  static async deleteMedia(vendorId: mongoose.Types.ObjectId, mediaId: string) {
    const media = await VendorMedia.findOneAndUpdate(
      { _id: toObjectId(mediaId, 'Media'), vendorId, isDeleted: false },
      { $set: { isDeleted: true } }
    );
    if (!media) throw notFound('Media');
    if (media.albumId) await this.recountAlbums(vendorId, [String(media.albumId)]);
    await VendorProfileService.refreshCompleteness(vendorId);
  }

  private static async recountAlbums(vendorId: mongoose.Types.ObjectId, albumIds: string[]) {
    for (const albumId of [...new Set(albumIds)]) {
      const count = await VendorMedia.countDocuments({ vendorId, albumId, isDeleted: false });
      const first = await VendorMedia.findOne({ vendorId, albumId, isDeleted: false, type: 'image' }).sort({ sortOrder: 1, createdAt: 1 }).lean();
      const album = await VendorAlbum.findById(albumId);
      if (!album) continue;
      album.mediaCount = count;
      if (!album.coverImage && first) album.coverImage = first.url;
      await album.save();
    }
  }
}
