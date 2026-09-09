import { Router } from 'express';
import { BlogController } from '../controllers/blog.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/authorization.middleware';
import { validate } from '../middleware/validation.middleware';
import { listBlogsQuerySchema, getBlogBySlugSchema, createBlogSchema, updateBlogSchema } from '../validators/blog.validator';

const router: Router = Router();

/**
 * GET /blogs, GET /blogs/:slug — public wedding-journal listing/detail
 * (like the public vendor directory — see wedding-vendor.routes.ts).
 */
router.get('/', validate(listBlogsQuerySchema), BlogController.getBlogs);
router.get('/:slug', validate(getBlogBySlugSchema), BlogController.getBlogBySlug);

/**
 * Create/update/delete — platform content, not scoped to any one wedding,
 * so admin-only (mirrors wedding-vendor.routes.ts). Attached per-route
 * rather than via `router.use(...)` for the same reason documented there.
 */
router.post('/', authMiddleware, requireAdmin, validate(createBlogSchema), BlogController.createBlog);
router.put('/:slug', authMiddleware, requireAdmin, validate(updateBlogSchema), BlogController.updateBlog);
router.delete('/:slug', authMiddleware, requireAdmin, BlogController.deleteBlog);

export default router;
