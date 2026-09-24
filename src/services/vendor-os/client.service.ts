import mongoose from 'mongoose';
import { VendorClient } from '../../models/vendor-os/vendor-client.model';
import { VendorLead } from '../../models/vendor-os/vendor-lead.model';
import { VendorBooking } from '../../models/vendor-os/vendor-booking.model';
import { VendorQuote } from '../../models/vendor-os/vendor-quote.model';
import { badRequest, escapeRegex, normalizePhone, notFound, toObjectId } from '../../utils/vendorOs';

export class VendorClientService {
  /**
   * Finds the vendor's client by phone, creating one if needed. Fills in
   * blanks (email/city/familyUserId) on an existing client but never
   * overwrites what the vendor already typed.
   */
  static async upsertByPhone(
    vendorId: mongoose.Types.ObjectId,
    data: { name: string; phone: string; email?: string; city?: string; familyUserId?: mongoose.Types.ObjectId | string }
  ) {
    const phone = normalizePhone(data.phone);
    if (phone.length < 10) throw badRequest('A valid client phone number is required');

    const existing = await VendorClient.findOne({ vendorId, phone });
    if (existing) {
      let changed = false;
      if (!existing.email && data.email) { existing.email = data.email; changed = true; }
      if (!existing.city && data.city) { existing.city = data.city; changed = true; }
      if (!existing.familyUserId && data.familyUserId) {
        existing.familyUserId = new mongoose.Types.ObjectId(String(data.familyUserId));
        changed = true;
      }
      if (changed) await existing.save();
      return existing;
    }

    try {
      return await VendorClient.create({
        vendorId,
        name: data.name,
        phone,
        email: data.email,
        city: data.city,
        familyUserId: data.familyUserId,
      });
    } catch (err: any) {
      // Concurrent create for the same phone — the other one won.
      if (err?.code === 11000) return (await VendorClient.findOne({ vendorId, phone }))!;
      throw err;
    }
  }

  static async list(vendorId: mongoose.Types.ObjectId, query: { search?: string; skip: number; limit: number }) {
    const filter: any = { vendorId };
    if (query.search) {
      const rx = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ name: rx }, { phone: rx }, { email: rx }, { city: rx }];
    }
    const [items, total] = await Promise.all([
      VendorClient.find(filter).sort({ updatedAt: -1 }).skip(query.skip).limit(query.limit).lean(),
      VendorClient.countDocuments(filter),
    ]);
    return { items, total };
  }

  static async get(vendorId: mongoose.Types.ObjectId, clientId: string, includeFinancials: boolean) {
    const client = await VendorClient.findOne({ _id: toObjectId(clientId, 'Client'), vendorId }).lean();
    if (!client) throw notFound('Client');

    const bookingProjection = includeFinancials ? {} : { totalAmount: 0, amountPaid: 0, balanceDue: 0, paymentSchedule: 0 };
    const [leads, bookings, quotes] = await Promise.all([
      VendorLead.find({ vendorId, clientId: client._id }).sort({ createdAt: -1 }).lean(),
      VendorBooking.find({ vendorId, clientId: client._id }, bookingProjection).sort({ createdAt: -1 }).lean(),
      VendorQuote.find({ vendorId, clientId: client._id }).select('-history').sort({ createdAt: -1 }).lean(),
    ]);
    return { ...client, leads, bookings, quotes };
  }

  static async create(vendorId: mongoose.Types.ObjectId, data: any) {
    const phone = normalizePhone(data.phone);
    if (await VendorClient.exists({ vendorId, phone })) throw badRequest('A client with this phone already exists');
    return VendorClient.create({ ...data, vendorId, phone });
  }

  static async update(vendorId: mongoose.Types.ObjectId, clientId: string, data: any) {
    const update = { ...data };
    if (update.phone) {
      update.phone = normalizePhone(update.phone);
      const dup = await VendorClient.exists({ vendorId, phone: update.phone, _id: { $ne: toObjectId(clientId, 'Client') } });
      if (dup) throw badRequest('Another client already has this phone');
    }
    const client = await VendorClient.findOneAndUpdate(
      { _id: toObjectId(clientId, 'Client'), vendorId },
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!client) throw notFound('Client');
    return client;
  }
}
