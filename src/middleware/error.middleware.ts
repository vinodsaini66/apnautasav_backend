import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { ApiResponse } from '../utils/apiResponse';

export const errorMiddleware = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  logger.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });
  
  if(false){
    next()
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  ApiResponse.error(res, statusCode, message, err.errors);
};