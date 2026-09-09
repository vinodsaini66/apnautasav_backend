import { Request, Response } from 'express';
import { Blog } from '../models/blog.model';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class BlogController {
  /**
   * GET /blogs — public listing. Supports ?tag=, ?search= (title/excerpt
   * text match), ?featured=true|false, ?page=, ?limit=. Only published
   * posts are ever returned here (admin editing happens via the same
   * create/update endpoints, gated separately).
   */
  static async getBlogs(req: Request, res: Response): Promise<void> {
    try {
      const { tag, search, featured, page = '1', limit = '20' } = req.query;

      const filter: Record<string, unknown> = { isPublished: true };
      if (tag) filter.tag = tag;
      if (featured !== undefined) filter.featured = featured === 'true';
      if (search) filter.$text = { $search: search as string };

      const pageNum = Number(page);
      const limitNum = Number(limit);

      const [blogs, total] = await Promise.all([
        Blog.find(filter)
          .sort({ order: 1, createdAt: -1 })
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum),
        Blog.countDocuments(filter),
      ]);

      ApiResponse.paginated(res, blogs, pageNum, limitNum, total);
    } catch (error: any) {
      logger.error('Get blogs error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch blogs');
    }
  }

  /** GET /blogs/:slug — public. */
  static async getBlogBySlug(req: Request, res: Response): Promise<void> {
    try {
      const blog = await Blog.findOne({ slug: req.params.slug, isPublished: true });
      if (!blog) {
        ApiResponse.error(res, 404, 'Blog not found');
        return;
      }

      ApiResponse.success(res, 200, { data: blog });
    } catch (error: any) {
      logger.error('Get blog error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to fetch blog');
    }
  }

  /** POST /blogs — admin only. */
  static async createBlog(req: Request, res: Response): Promise<void> {
    try {
      const slug = req.body.slug ? slugify(req.body.slug) : slugify(req.body.title);

      const existing = await Blog.findOne({ slug });
      if (existing) {
        ApiResponse.error(res, 409, 'A blog with this slug already exists');
        return;
      }

      const blog = await Blog.create({
        ...req.body,
        slug,
        createdBy: req.user!.userId,
      });

      ApiResponse.success(res, 201, { message: 'Blog created successfully', data: blog });
    } catch (error: any) {
      logger.error('Create blog error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to create blog');
    }
  }

  /** PUT /blogs/:slug — admin only. */
  static async updateBlog(req: Request, res: Response): Promise<void> {
    try {
      const update = { ...req.body };
      if (update.slug) update.slug = slugify(update.slug);

      const blog = await Blog.findOneAndUpdate({ slug: req.params.slug }, { $set: update }, { new: true, runValidators: true });

      if (!blog) {
        ApiResponse.error(res, 404, 'Blog not found');
        return;
      }

      ApiResponse.success(res, 200, { message: 'Blog updated successfully', data: blog });
    } catch (error: any) {
      logger.error('Update blog error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to update blog');
    }
  }

  /** DELETE /blogs/:slug — admin only. */
  static async deleteBlog(req: Request, res: Response): Promise<void> {
    try {
      const blog = await Blog.findOneAndDelete({ slug: req.params.slug });
      if (!blog) {
        ApiResponse.error(res, 404, 'Blog not found');
        return;
      }

      ApiResponse.success(res, 200, { message: 'Blog deleted successfully' });
    } catch (error: any) {
      logger.error('Delete blog error:', error);
      ApiResponse.error(res, 500, error.message || 'Failed to delete blog');
    }
  }
}
