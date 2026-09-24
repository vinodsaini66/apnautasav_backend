import mongoose from 'mongoose';
import { VendorUser } from '../../models/vendor-os/vendor-user.model';
import { WeddingVendor } from '../../models/wedding-vendor.model';
import { VendorAuthService } from './vendor-auth.service';
import { CrewMember } from '../../models/vendor-os/crew-member.model';
import { assertWithinPlan } from './plan-limits';
import { SMSService } from '../sms.service';
import { VendorUserRole } from '../../constants/vendorOs';
import { badRequest, notFound, toObjectId, VENDOR_OS_PUBLIC_URL } from '../../utils/vendorOs';
import logger from '../../utils/logger';

type Id = mongoose.Types.ObjectId;

// Spec M7 roles: owner + manager/staff/crew. Team members log in with their
// own phone + OTP; an invite just pre-creates their VendorUser row.
export class VendorTeamService {
  static async list(vendorId: Id) {
    return VendorUser.find({ vendorId }).select('name phone email role status lastLoginAt createdAt').sort({ role: 1, createdAt: 1 }).lean();
  }

  static async invite(vendorId: Id, data: { name: string; phone: string; role: Exclude<VendorUserRole, 'owner'> }, invitedBy: string) {
    const phone = VendorAuthService.assertPhone(data.phone);
    if ((data.role as string) === 'owner') throw badRequest('There can be only one owner');

    const existing = await VendorUser.findOne({ phone });
    if (existing?.vendorId && String(existing.vendorId) !== String(vendorId)) {
      throw badRequest('This phone number is already registered with another business on Vendor OS');
    }
    if (existing?.vendorId && existing.status !== 'disabled') throw badRequest('This person is already on your team');

    await assertWithinPlan(vendorId, 'users');

    let member;
    if (existing) {
      existing.vendorId = vendorId;
      existing.role = data.role;
      existing.name = existing.name || data.name;
      existing.status = existing.lastLoginAt ? 'active' : 'invited';
      existing.invitedBy = new mongoose.Types.ObjectId(invitedBy);
      member = await existing.save();
    } else {
      member = await VendorUser.create({ vendorId, phone, name: data.name, role: data.role, status: 'invited', invitedBy });
    }

    // A crew login links to the roster entry with the same phone, so they
    // see their own assignments (crew.service.ts#myAssignments).
    await CrewMember.updateMany({ vendorId, phone }, { $set: { vendorUserId: member._id } });

    const vendor = await WeddingVendor.findById(vendorId).select('businessName').lean();
    SMSService.sendSMS(
      `+91${phone}`,
      `${vendor?.businessName || 'A business'} added you to their ApnaUtsav Vendor OS team. Log in with this number: ${VENDOR_OS_PUBLIC_URL}`
    ).catch((err) => logger.warn(`Vendor OS invite SMS failed: ${err.message}`));

    return VendorAuthService.toPublicUser(member);
  }

  static async update(vendorId: Id, memberId: string, data: { name?: string; role?: VendorUserRole; status?: 'active' | 'disabled' }, actorId: string) {
    const member = await VendorUser.findOne({ _id: toObjectId(memberId, 'Team member'), vendorId });
    if (!member) throw notFound('Team member');
    if (member.role === 'owner') throw badRequest("The owner's role and access can't be changed");
    if (String(member._id) === actorId) throw badRequest("You can't change your own role or access");
    if (data.role === 'owner') throw badRequest('There can be only one owner');

    if (data.status === 'active' && member.status === 'disabled') await assertWithinPlan(vendorId, 'users');
    if (data.name !== undefined) member.name = data.name;
    if (data.role) member.role = data.role;
    if (data.status) member.status = data.status === 'active' ? (member.lastLoginAt ? 'active' : 'invited') : 'disabled';
    await member.save();
    return VendorAuthService.toPublicUser(member);
  }

  /** Removes the member from the business; their phone can then join another. */
  static async remove(vendorId: Id, memberId: string, actorId: string) {
    const member = await VendorUser.findOne({ _id: toObjectId(memberId, 'Team member'), vendorId });
    if (!member) throw notFound('Team member');
    if (member.role === 'owner') throw badRequest("The owner can't be removed");
    if (String(member._id) === actorId) throw badRequest("You can't remove yourself");
    member.vendorId = null;
    member.role = 'owner';
    member.status = 'active';
    await member.save();
  }
}
