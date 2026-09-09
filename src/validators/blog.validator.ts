import { z } from 'zod';
import { BlogTag } from '../models/blog.model';

const tagEnum = z.nativeEnum(BlogTag);

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Slug is required')
  .max(160, 'Slug is too long')
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug must be lowercase, alphanumeric words separated by hyphens');

export const listBlogsQuerySchema = z.object({
  query: z.object({
    tag: tagEnum.optional(),
    search: z.string().trim().max(200).optional(),
    featured: z.enum(['true', 'false']).optional(),
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
  }),
});

export const getBlogBySlugSchema = z.object({
  params: z.object({
    slug: z.string().trim().min(1),
  }),
});

export const createBlogSchema = z.object({
  body: z.object({
    slug: slugSchema.optional(),
    tag: tagEnum,
    title: z.string().trim().min(2, 'Title is required').max(200),
    excerpt: z.string().trim().min(2, 'Excerpt is required').max(500),
    body: z.array(z.string().trim().min(1)).min(1, 'At least one paragraph is required'),
    author: z.string().trim().min(1, 'Author is required').max(100),
    date: z.string().trim().min(1, 'Date is required').max(50),
    readTime: z.string().trim().min(1, 'Read time is required').max(30),
    featured: z.boolean().optional(),
    order: z.number().optional(),
    isPublished: z.boolean().optional(),
  }),
});

export const updateBlogSchema = z.object({
  params: z.object({
    slug: z.string().trim().min(1),
  }),
  body: z
    .object({
      slug: slugSchema.optional(),
      tag: tagEnum.optional(),
      title: z.string().trim().min(2).max(200).optional(),
      excerpt: z.string().trim().min(2).max(500).optional(),
      body: z.array(z.string().trim().min(1)).min(1).optional(),
      author: z.string().trim().min(1).max(100).optional(),
      date: z.string().trim().min(1).max(50).optional(),
      readTime: z.string().trim().min(1).max(30).optional(),
      featured: z.boolean().optional(),
      order: z.number().optional(),
      isPublished: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' }),
});
