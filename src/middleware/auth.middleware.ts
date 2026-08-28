import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { TokenPayload } from '../types';
import { ApiResponse } from '../utils/apiResponse';
import { ERROR_MESSAGES } from '../constants';

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      ApiResponse.error(res, 401, ERROR_MESSAGES.UNAUTHORIZED);
      return;
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as TokenPayload;

    req.user = {
      userId: decoded.userId,
      phoneNumber: decoded.phoneNumber,
      role: decoded.role
    };

    next();
  } catch (error) {
    ApiResponse.error(res, 401, ERROR_MESSAGES.INVALID_TOKEN);
  }
};

/**
 * Like authMiddleware, but never blocks the request — used on public routes
 * that behave differently for logged-in vs anonymous callers (e.g. the
 * public vendor directory, which shows contact info only once req.user is
 * populated). A missing, expired, or malformed token just leaves req.user
 * unset instead of returning 401.
 */
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      next();
      return;
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as TokenPayload;

    req.user = {
      userId: decoded.userId,
      phoneNumber: decoded.phoneNumber,
      role: decoded.role
    };
  } catch (error) {
    // Invalid/expired token on an optional-auth route — treat as anonymous
    // rather than failing the request.
  }

  next();
};