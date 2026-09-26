import mongoose from 'mongoose';
import { VendorUser } from '../../models/vendor-os/vendor-user.model';
import { WeddingVendor } from '../../models/wedding-vendor.model';
import { VendorAuthService } from './vendor-auth.service';
import { CrewMember } from '../../models/vendor-os/crew-member.model';
import { assertWithinPlan } from './plan-limits';
import { SMSService } from '../sms.service';
import { VendorUserRole } from '../../constants/vendorOs';
import { badRequest, buildWhatsAppLink, notFound, toObjectId, VENDOR_OS_PUBLIC_URL } from '../../utils/vendorOs';
import { VendorResource } from '../../models/vendor-os/vendor-resource.model';
import logger from '../../utils/logger';
import { disconnectVendorUser } from './vendor-realtime';

type Id = mongoose.Types.ObjectId;

// Spec M7 roles: owner + manager/staff/crew. Team members log in with their
// own phone + OTP; an invite just pre-creates their VendorUser row.
export class VendorTeamService {
  static async list(vendorId: Id) {
    const users = await VendorUser.find({ vendorId }).select('name phone email role status lastLoginAt createdAt').sort({ role: 1, createdAt: 1 }).lean();
    // Crew logins: show the roster entry they're linked to (their team / role).
    const crew = await CrewMember.find({ vendorId, vendorUserId: { $in: users.filter((u) => u.role === 'crew').map((u) => u._id) } })
      .select('vendorUserId role defaultResourceId')
      .populate('defaultResourceId', 'name')
      .lean();
    const byUser = new Map(crew.map((c: any) => [String(c.vendorUserId), c]));
    const order: Record<string, number> = { owner: 0, manager: 1, staff: 2, crew: 3 };
    return users
      .map((u) => {
        const c: any = byUser.get(String(u._id));
        return { ...u, crewMember: c ? { _id: c._id, role: c.role, team: c.defaultResourceId?.name } : undefined };
      })
      .sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9));
  }

  /** WhatsApp invite the owner can send themselves (SMS may not be configured). */
  static inviteMessage(businessName: string, name: string, phone: string) {
    const message = `Namaste ${name} ji, ${businessName} ne aapko ApnaUtsav VendorOS team mein add kiya hai. Is number se login karein (OTP): ${VENDOR_OS_PUBLIC_URL}/login`;
    return { message, waLink: buildWhatsAppLink(phone, message) };
  }

  static async invite(
    vendorId: Id,
    data: {
      name: string;
      phone: string;
      email?: string;
      role: Exclude<VendorUserRole, 'owner'>;
      /** Crew logins: create / update their roster entry (team they work in, usual role). */
      crew?: { defaultResourceId?: string | null; role?: string };
    },
    invitedBy: string
  ) {
    const phone = VendorAuthService.assertPhone(data.phone);
    if ((data.role as string) === 'owner') throw badRequest('There can be only one owner');

    const existing = await VendorUser.findOne({ phone });
    if (existing?.vendorId && String(existing.vendorId) !== String(vendorId)) {
      throw badRequest('This phone number is already registered with another business on Vendor OS');
    }
    if (existing?.vendorId && existing.status !== 'disabled') throw badRequest('This person is already on your team');

    const email = data.email?.trim().toLowerCase() || undefined;
    if (email && (await VendorUser.exists({ email, _id: { $ne: existing?._id } }))) {
      throw badRequest('This email is already used by another Vendor OS login');
    }
    await assertWithinPlan(vendorId, 'users');

    let member;
    if (existing) {
      existing.vendorId = vendorId;
      existing.role = data.role;
      existing.name = existing.name || data.name;
      if (email && !existing.email) existing.email = email;
      existing.status = existing.lastLoginAt ? 'active' : 'invited';
      existing.invitedBy = new mongoose.Types.ObjectId(invitedBy);
      member = await existing.save();
    } else {
      member = await VendorUser.create({ vendorId, phone, email, name: data.name, role: data.role, status: 'invited', invitedBy });
    }

    // A crew login links to the roster entry with the same phone, so they
    // see their own assignments (crew.service.ts#myAssignments).
    await CrewMember.updateMany({ vendorId, phone }, { $set: { vendorUserId: member._id } });
    if (data.role === 'crew') {
      const resourceId = data.crew?.defaultResourceId ? toObjectId(data.crew.defaultResourceId, 'Team') : undefined;
      if (resourceId && !(await VendorResource.exists({ _id: resourceId, vendorId }))) throw badRequest('Unknown team');
      const roster = await CrewMember.findOne({ vendorId, phone });
      if (roster) {
        if (resourceId) roster.defaultResourceId = resourceId;
        if (data.crew?.role) roster.role = data.crew.role;
        roster.isActive = true;
        await roster.save();
      } else {
        await CrewMember.create({ vendorId, phone, name: data.name, role: data.crew?.role, type: 'staff', defaultResourceId: resourceId, vendorUserId: member._id });
      }
    }

    const vendor = await WeddingVendor.findById(vendorId).select('businessName').lean();
    SMSService.sendSMS(
      `+91${phone}`,
      `${vendor?.businessName || 'A business'} added you to their ApnaUtsav Vendor OS team. Log in with this number: ${VENDOR_OS_PUBLIC_URL}`
    ).catch((err) => logger.warn(`Vendor OS invite SMS failed: ${err.message}`));

    return { ...VendorAuthService.toPublicUser(member), invite: this.inviteMessage(vendor?.businessName || 'Your business', data.name, phone) };
  }

  static async update(vendorId: Id, memberId: string, data: { name?: string; role?: VendorUserRole; status?: 'active' | 'disabled' }, actorId: string) {
    const member = await VendorUser.findOne({ _id: toObjectId(memberId, 'Team member'), vendorId });
    if (!member) throw notFound('Team member');
    if (member.role === 'owner') throw badRequest("The owner's role and access can't be changed");
    if (String(member._id) === actorId) throw badRequest("You can't change your own role or access");
    if (data.role === 'owner') throw badRequest('There can be only one owner');

    if (data.status === 'active' && member.status === 'disabled') await assertWithinPlan(vendorId, 'users');
    if (data.name !== undefined) member.name = data.name;
    const roleChanged = !!data.role && data.role !== member.role;
    if (data.role) member.role = data.role;
    if (data.status) member.status = data.status === 'active' ? (member.lastLoginAt ? 'active' : 'invited') : 'disabled';
    await member.save();
    // Live notifications follow the new rights: reconnect (or stay out, if paused).
    if (roleChanged || data.status === 'disabled') disconnectVendorUser(String(member._id));
    return VendorAuthService.toPublicUser(member);
  }

  /** WhatsApp message to (re)send someone their invite. */
  static async reinvite(vendorId: Id, memberId: string) {
    const member = await VendorUser.findOne({ _id: toObjectId(memberId, 'Team member'), vendorId }).select('name phone status').lean();
    if (!member) throw notFound('Team member');
    if (!member.phone) throw badRequest('This team member has no mobile number');
    const vendor = await WeddingVendor.findById(vendorId).select('businessName').lean();
    return this.inviteMessage(vendor?.businessName || 'Your business', member.name || 'there', member.phone);
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
    disconnectVendorUser(String(member._id));
  }
}
