import { Request, Response } from 'express';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';
import { User } from '../models/user.model';

export class UserController {

    static async getProfile(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.userId;

            const data = await User.findById(userId).select('-password -__v -createdAt -updatedAt');
            if (!data) {
                ApiResponse.error(res, 404, 'User not found');
                return;
            }

            ApiResponse.success(res, 200, {
                data: data
            });
        } catch (error: any) {
            logger.error('Get wedding error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to fetch wedding');
        }
    }

}