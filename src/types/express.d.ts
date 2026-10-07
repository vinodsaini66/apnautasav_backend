import type { WeddingAccess } from '../services/access.service';
import type { OrgMembership } from '../services/org/org-access';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        phoneNumber: string;
        role: string;
      };
      // Vendor OS panel session (middleware/vendor-auth.middleware.ts) —
      // a separate identity from `user` above.
      vendorUser?: {
        vendorUserId: string;
        vendorId: string | null;
        role: 'owner' | 'manager' | 'staff' | 'crew';
        phone?: string;
        name?: string;
        verified?: boolean;
      };
      vendorProfile?: { basicComplete: boolean; missingFields: string[]; approved?: boolean };
      weddingId?: string;
      // Set by checkWeddingAccess (middleware/authorization.middleware.ts):
      // who the caller is on req.params.weddingId and what they may do there.
      access?: WeddingAccess;
      // Set by loadOrgMember (middleware/org.middleware.ts) on /orgs/:orgId routes.
      orgMembership?: OrgMembership;
      task?: any;
    }
  }
}

export {};