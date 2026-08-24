import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { updateFcmTokenSchema } from '../validators/user.validator';
import { UserController } from '../controllers/user.controller';

const router: Router = Router();

router.use(authMiddleware);
router.get('/', UserController.getProfile);
router.get('/plan', UserController.getMyAccountPlan);
router.put('/fcm-token', validate(updateFcmTokenSchema), UserController.updateFcmToken);

export default router;