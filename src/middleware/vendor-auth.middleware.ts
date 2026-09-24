import { Request, Response, NextFunction } from 'express';
import { VendorUser } from '../models/vendor-os/vendor-user.model';
import { WeddingVendor } from '../models/wedding-vendor.model';
import { verifyVendorAccessToken } from '../services/vendor-os/vendor-auth.service';
import { BASIC_PROFILE_SELECT, basicProfileStatus, isBusinessApproved, isLoginVerified } from '../services/vendor-os/onboarding.service';
import { ApiResponse } from '../utils/apiResponse';
import { VendorUserRole } from '../constants/vendorOs';

// Vendor OS panel auth. Verifies a Vendor OS token (separate secret +
// audience from the family app's authMiddleware) and re-reads the
// VendorUser row, so disabling a staff member, changing their role or
// resetting the password takes effect immediately.
export const vendorAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    ApiResponse.error(res, 401, 'Unauthorized access');
    return;
  }

  try {
    const decoded = verifyVendorAccessToken(token);
    const user = await VendorUser.findById(decoded.vendorUserId).select('vendorId role phone name status tokenVersion email emailVerified phoneVerified').lean();

    if (!user || user.status === 'disabled' || (decoded.tv ?? 0) !== (user.tokenVersion || 0)) {
      ApiResponse.error(res, 401, 'Session expired. Please log in again.');
      return;
    }

    req.vendorUser = {
      vendorUserId: String(user._id),
      vendorId: user.vendorId ? String(user.vendorId) : null,
      role: user.role,
      phone: user.phone,
      name: user.name,
      verified: isLoginVerified(user),
    };
    next();
  } catch {
    ApiResponse.error(res, 401, 'Invalid or expired token');
  }
};

const profileRequired = (res: Response, missingFields: string[]) =>
  ApiResponse.error(res, 403, 'Complete your basic business profile first', {
    code: 'BASIC_PROFILE_REQUIRED',
    nextStep: 'basic_profile',
    missingFields,
  });

// Loads the vendor business for the session. A suspended listing keeps read
// access (so the vendor can still see/export their data) but can't write.
// Also records whether the basic profile is complete, for requireBasicProfile.
export const requireVendor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!req.vendorUser?.vendorId) {
    profileRequired(res, basicProfileStatus(null).missingFields);
    return;
  }

  const vendor = await WeddingVendor.findOne({ _id: req.vendorUser.vendorId, isDeleted: false }).select(BASIC_PROFILE_SELECT).lean();
  if (!vendor) {
    ApiResponse.error(res, 404, 'Vendor business not found');
    return;
  }
  if (vendor.status === 'suspended' && req.method !== 'GET') {
    ApiResponse.error(res, 403, 'This business is suspended. Contact ApnaUtsav support.', { code: 'VENDOR_SUSPENDED' });
    return;
  }
  const basic = basicProfileStatus(vendor as any);
  req.vendorProfile = { basicComplete: basic.complete, missingFields: basic.missingFields, approved: isBusinessApproved(vendor) };
  next();
};

// Gate for everything past the profile page: dashboard, leads, calendar…
// stay locked until the basic profile (onboarding.service.ts) is filled.
export const requireBasicProfile = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.vendorProfile?.basicComplete) {
    profileRequired(res, req.vendorProfile?.missingFields || []);
    return;
  }
  next();
};

// Gate for the operational panel (dashboard, leads, calendar, bookings,
// money, quotes, WhatsApp, team, crew): the login must be verified (email,
// or OTP phone for phone-only accounts) and ApnaUtsav must have approved the
// listing. Profile, portfolio, packages and notifications stay open so the
// vendor can finish setup and hear about the approval.
export const requireVerifiedAccount = (req: Request, res: Response, next: NextFunction): void => {
  const emailVerified = !!req.vendorUser?.verified;
  const approved = !!req.vendorProfile?.approved;
  if (!emailVerified || !approved) {
    ApiResponse.error(
      res,
      403,
      !emailVerified ? 'Verify your email to open the dashboard' : 'Your business is waiting for ApnaUtsav approval',
      { code: 'VERIFICATION_REQUIRED', nextStep: 'verification', checks: { emailVerified, approved } }
    );
    return;
  }
  next();
};

export const requireVendorRole = (...roles: VendorUserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.vendorUser || !roles.includes(req.vendorUser.role)) {
      ApiResponse.error(res, 403, 'You do not have permission to perform this action');
      return;
    }
    next();
  };
};

// Spec section 8: staff see leads/calendar/quotes but no payment totals;
// crew see only their own assignments.
export const canSeeFinancials = (req: Request): boolean =>
  req.vendorUser?.role === 'owner' || req.vendorUser?.role === 'manager';
