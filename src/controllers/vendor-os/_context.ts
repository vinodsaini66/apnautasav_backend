import { Request } from 'express';
import mongoose from 'mongoose';
import { canSeeFinancials } from '../../middleware/vendor-auth.middleware';
import { VendorOsError } from '../../utils/vendorOs';

// Per-request accessors for Vendor OS controllers (populated by
// middleware/vendor-auth.middleware.ts).

export const vendorIdOf = (req: Request): mongoose.Types.ObjectId => {
  if (!req.vendorUser?.vendorId) throw new VendorOsError(403, 'Complete your basic business profile first', { code: 'BASIC_PROFILE_REQUIRED', nextStep: 'basic_profile' });
  return new mongoose.Types.ObjectId(req.vendorUser.vendorId);
};

export const userIdOf = (req: Request): string => req.vendorUser!.vendorUserId;

export const financials = (req: Request): boolean => canSeeFinancials(req);

export const q = (req: Request, key: string): string | undefined => {
  const v = req.query[key];
  return typeof v === 'string' && v.length ? v : undefined;
};
