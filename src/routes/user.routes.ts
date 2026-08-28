import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import {
  updateFcmTokenSchema,
  updateProfileSchema,
  updatePreferencesSchema,
  updateNotificationSettingsSchema
} from '../validators/user.validator';
import { imageUpload } from '../middleware/upload.middleware';
import { UserController } from '../controllers/user.controller';

const router: Router = Router();

router.use(authMiddleware);
router.get('/', UserController.getProfile);
router.get('/plan', UserController.getMyAccountPlan);
router.put('/fcm-token', validate(updateFcmTokenSchema), UserController.updateFcmToken);
router.patch('/profile', validate(updateProfileSchema), UserController.updateProfile);
router.patch('/preferences', validate(updatePreferencesSchema), UserController.updatePreferences);
router.patch('/notification-settings', validate(updateNotificationSettingsSchema), UserController.updateNotificationSettings);
router.post('/avatar', imageUpload.single('avatar'), UserController.uploadAvatar);

export default router;