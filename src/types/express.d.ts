import { JwtPayload } from 'jsonwebtoken';

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
      task?: any;
    }
  }
}

export {};