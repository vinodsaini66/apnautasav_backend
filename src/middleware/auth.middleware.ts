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