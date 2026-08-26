import { z } from 'zod';

export const COMMENT_ENTITY_TYPES = ['task', 'guest', 'budget', 'vendor', 'note', 'event'] as const;

export const createCommentSchema = z.object({
  body: z.object({
    entityType: z.enum(COMMENT_ENTITY_TYPES),
    entityId: z.string().min(1, 'entityId is required'),
    content: z.string().min(1, 'Comment content is required').max(1000),
    attachments: z.array(z.object({
      url: z.string(),
      fileName: z.string()
    })).optional()
  })
});

export const updateCommentSchema = z.object({
  body: z.object({
    content: z.string().min(1, 'Comment content is required').max(1000)
  })
});
