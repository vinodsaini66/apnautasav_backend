import { Request, Response } from 'express';
import { ApiResponse } from './apiResponse';
import logger from './logger';

// Shared plumbing for Track C organization routes (controllers/org/*) —
// same idea as utils/vendorOs.ts: services throw an OrgError carrying an
// HTTP status and `handle()` maps it to the usual ApiResponse envelope.

export class OrgError extends Error {
  statusCode: number;
  details?: any;

  constructor(statusCode: number, message: string, details?: any) {
    super(message);
    this.name = 'OrgError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: any) => new OrgError(400, message, details);
export const forbidden = (message = 'You do not have permission to perform this action', details?: any) =>
  new OrgError(403, message, details);
export const notFound = (what = 'Resource') => new OrgError(404, `${what} not found`);
export const conflict = (message: string, details?: any) => new OrgError(409, message, details);

type Handler = (req: Request, res: Response) => Promise<void>;

export const handle = (fn: Handler, label: string): Handler => {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (error: any) {
      if (error instanceof OrgError) {
        ApiResponse.error(res, error.statusCode, error.message, error.details);
        return;
      }
      if (error?.name === 'ValidationError' || error?.name === 'CastError') {
        ApiResponse.error(res, 400, error.message);
        return;
      }
      if (error?.code === 11000) {
        ApiResponse.error(res, 409, 'That already exists');
        return;
      }
      logger.error(`Org ${label} error:`, error);
      ApiResponse.error(res, 500, error?.message || 'Internal server error');
    }
  };
};
