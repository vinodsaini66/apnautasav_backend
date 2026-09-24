import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { ApiResponse } from './apiResponse';
import logger from './logger';

// Shared plumbing for the Vendor OS panel (controllers/vendor-os/*). The
// rest of the codebase writes a try/catch per controller method; Vendor OS
// has ~100 endpoints, so services throw a VendorOsError with an HTTP status
// instead and `handle()` maps it — same ApiResponse envelope either way.

export class VendorOsError extends Error {
  statusCode: number;
  details?: any;

  constructor(statusCode: number, message: string, details?: any) {
    super(message);
    this.name = 'VendorOsError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: any) => new VendorOsError(400, message, details);
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new VendorOsError(403, message);
export const notFound = (what = 'Resource') => new VendorOsError(404, `${what} not found`);
export const conflict = (message: string, details?: any) => new VendorOsError(409, message, details);

type Handler = (req: Request, res: Response) => Promise<void>;

export const handle = (fn: Handler, label: string): Handler => {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (error: any) {
      if (error instanceof VendorOsError) {
        ApiResponse.error(res, error.statusCode, error.message, error.details);
        return;
      }
      if (error?.name === 'ValidationError' || error?.name === 'CastError') {
        ApiResponse.error(res, 400, error.message);
        return;
      }
      logger.error(`Vendor OS ${label} error:`, error);
      ApiResponse.error(res, 500, error?.message || 'Internal server error');
    }
  };
};

export const toObjectId = (id: string | mongoose.Types.ObjectId, what = 'Resource'): mongoose.Types.ObjectId => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.Types.ObjectId.isValid(id)) throw notFound(what);
  return new mongoose.Types.ObjectId(id);
};

export const parsePagination = (query: any, defaultLimit = 20) => {
  const page = Math.max(1, parseInt(query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit as string, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------------------
// Phone numbers — stored as the bare 10-digit Indian mobile number; wa.me
// links and SMS get the 91 country code prepended.
// ---------------------------------------------------------------------------

export const normalizePhone = (input?: string | null): string => {
  const digits = String(input || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
};

export const toInternationalPhone = (phone: string): string => {
  const normalized = normalizePhone(phone);
  return normalized.length === 10 ? `91${normalized}` : normalized;
};

export const buildWhatsAppLink = (phone: string | undefined, message: string): string => {
  const text = encodeURIComponent(message);
  return phone ? `https://wa.me/${toInternationalPhone(phone)}?text=${text}` : `https://wa.me/?text=${text}`;
};

// ---------------------------------------------------------------------------
// Calendar dates — a booking date is a calendar day, not an instant, so it
// is stored as UTC midnight of the "YYYY-MM-DD" the client sent. Never do
// local-timezone math on these.
// ---------------------------------------------------------------------------

export const DAY_MS = 24 * 60 * 60 * 1000;

export const toDateOnly = (input: string | Date): Date => {
  if (input instanceof Date) {
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(input));
  if (!match) {
    const parsed = new Date(input);
    if (isNaN(parsed.getTime())) throw badRequest(`Invalid date: ${input}`);
    return toDateOnly(parsed);
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
};

export const formatDateKey = (date: Date): string => date.toISOString().slice(0, 10);

export const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);

// "Today" as a calendar day in India, where every vendor on the platform is.
export const todayIST = (): Date => toDateOnly(new Date(Date.now() + 5.5 * 60 * 60 * 1000));

export const formatDisplayDate = (date?: Date | null): string =>
  date
    ? new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : '';

export const formatINR = (amount?: number | null): string =>
  `Rs. ${Math.round(Number(amount || 0)).toLocaleString('en-IN')}`;

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export const renderTemplate = (body: string, vars: Record<string, any>): string =>
  body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => (vars[key] === undefined || vars[key] === null ? '' : String(vars[key])));

export const VENDOR_OS_PUBLIC_URL = (
  process.env.VENDOR_OS_PUBLIC_URL ||
  process.env.FRONTEND_URL ||
  'http://localhost:3000'
).replace(/\/+$/, '');
