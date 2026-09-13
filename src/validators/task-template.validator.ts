import { z } from 'zod';

const templateItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  category: z.enum(['venue', 'decoration', 'catering', 'logistics', 'invitations', 'music', 'photography', 'others']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  // Offset in days from the wedding's own date — negative = before.
  dueOffsetDays: z.number().int(),
  eventType: z.enum(['ceremony', 'reception', 'mehendi', 'sangeet', 'haldi', 'engagement', 'cocktail', 'other']).optional()
});

export const createTaskTemplateSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(150),
    description: z.string().max(500).optional(),
    items: z.array(templateItemSchema).min(1, 'At least one checklist item is required')
  })
});

export const updateTaskTemplateSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(150).optional(),
    description: z.string().max(500).optional(),
    items: z.array(templateItemSchema).min(1).optional()
  })
});
