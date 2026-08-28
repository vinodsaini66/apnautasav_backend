import { Request, Response } from 'express';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';
import { User } from '../models/user.model';
import { PlanResolutionService } from '../services/plan-resolution.service';
import { uploadBufferToS3, deleteObjectFromS3ByUrl } from '../config/s3';

export class UserController {

    /** GET /me/plan — account-level subscription status + wedding-creation cap. */
    static async getMyAccountPlan(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user!.userId;
            const summary = await PlanResolutionService.getAccountPlanSummary(userId);

            ApiResponse.success(res, 200, {
                data: summary
            });
        } catch (error: any) {
            logger.error('Get account plan error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to fetch account plan');
        }
    }

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

    static async updateFcmToken(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.userId;
            const { fcm_token } = req.body;

            const user = await User.findByIdAndUpdate(
                userId,
                { $set: { fcm_token } },
                { new: true }
            ).select('-password -__v -createdAt -updatedAt');

            if (!user) {
                ApiResponse.error(res, 404, 'User not found');
                return;
            }

            ApiResponse.success(res, 200, {
                message: 'FCM token updated successfully',
                data: user
            });
        } catch (error: any) {
            logger.error('Update FCM token error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to update FCM token');
        }
    }

    static async updateProfile(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.userId;
            const { fullName, phoneNumber } = req.body;

            const set: Record<string, unknown> = {};
            if (fullName !== undefined) set.fullName = fullName;
            if (phoneNumber !== undefined) set.phoneNumber = phoneNumber;

            const user = await User.findByIdAndUpdate(
                userId,
                { $set: set },
                { new: true, runValidators: true }
            ).select('-password -__v -createdAt -updatedAt');

            if (!user) {
                ApiResponse.error(res, 404, 'User not found');
                return;
            }

            ApiResponse.success(res, 200, {
                message: 'Profile updated successfully',
                data: user
            });
        } catch (error: any) {
            logger.error('Update profile error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to update profile');
        }
    }

    static async updatePreferences(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.userId;
            const { language } = req.body;

            const user = await User.findByIdAndUpdate(
                userId,
                { $set: { 'preferences.language': language } },
                { new: true }
            ).select('-password -__v -createdAt -updatedAt');

            if (!user) {
                ApiResponse.error(res, 404, 'User not found');
                return;
            }

            ApiResponse.success(res, 200, {
                message: 'Preferences updated successfully',
                data: user
            });
        } catch (error: any) {
            logger.error('Update preferences error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to update preferences');
        }
    }

    static async updateNotificationSettings(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.userId;
            const allowedKeys = [
                'pushEnabled',
                'emailEnabled',
                'taskReminders',
                'rsvpUpdates',
                'vendorMessages',
                'budgetAlerts'
            ] as const;

            const set: Record<string, boolean> = {};
            for (const key of allowedKeys) {
                if (req.body[key] !== undefined) {
                    set[`notificationSettings.${key}`] = req.body[key];
                }
            }

            const user = await User.findByIdAndUpdate(
                userId,
                { $set: set },
                { new: true }
            ).select('-password -__v -createdAt -updatedAt');

            if (!user) {
                ApiResponse.error(res, 404, 'User not found');
                return;
            }

            ApiResponse.success(res, 200, {
                message: 'Notification settings updated successfully',
                data: user
            });
        } catch (error: any) {
            logger.error('Update notification settings error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to update notification settings');
        }
    }

    static async uploadAvatar(req: Request, res: Response): Promise<void> {
        try {
            if (!req.file) {
                ApiResponse.error(res, 400, 'No image file provided (field name: "avatar")');
                return;
            }

            const userId = req.user?.userId;

            const previousUser = await User.findById(userId).select('avatarUrl');
            const oldAvatarUrl = previousUser?.avatarUrl;

            const url = await uploadBufferToS3(
                req.file.buffer,
                req.file.originalname,
                req.file.mimetype,
                'avatars'
            );

            const user = await User.findByIdAndUpdate(
                userId,
                { $set: { avatarUrl: url } },
                { new: true }
            ).select('-password -__v -createdAt -updatedAt');

            if (!user) {
                ApiResponse.error(res, 404, 'User not found');
                return;
            }

            if (oldAvatarUrl) {
                try {
                    await deleteObjectFromS3ByUrl(oldAvatarUrl);
                } catch (cleanupError) {
                    logger.error('Failed to delete previous avatar from S3:', cleanupError);
                }
            }

            ApiResponse.success(res, 200, {
                message: 'Avatar uploaded successfully',
                data: user
            });
        } catch (error: any) {
            logger.error('Upload avatar error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to upload avatar');
        }
    }

}