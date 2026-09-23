import { Router } from 'express';
import { StatsController } from '../controllers/stats.controller';

const router: Router = Router();

/** GET /stats/platform — public real platform-wide marketing numbers. */
router.get('/platform', StatsController.getPlatformStats);

export default router;
