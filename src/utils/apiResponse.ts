import { Response } from 'express';

interface ApiResponseData {
  message?: string;
  status?: boolean;
  data?: any;
  meta?: any;
}

export class ApiResponse {
  static success(res: Response, statusCode: number, data: ApiResponseData) {
    return res.status(statusCode).json({
      status: 'success',
      ...data
    });
  }

  static error(res: Response, statusCode: number, message: string, errors?: any) {
    return res.status(statusCode).json({
      status: 'error',
      message,
      errors
    });
  }

  static paginated(res: Response, data: any[], page: number, limit: number, total: number) {
    return res.status(200).json({
      status: 'success',
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
  }
}