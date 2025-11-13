import { z } from 'zod';

export const createTaskSchema = z.object({
  body: z.object({
    title: z.string().min(3).max(200),
    description: z.string().optional(),
    category: z.enum(['venue', 'decoration', 'catering', 'logistics', 'invitations', 'music', 'photography', 'others']),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    status: z.enum(['pending', 'in-progress', 'completed', 'cancelled']).optional(),
    dueDate: z.string().date().optional(),
    assignedTo: z.array(z.string()).optional(),
    estimatedHours: z.number().positive().optional(),
    tags: z.array(z.string()).optional()
  })
});

export const updateTaskSchema = z.object({
  body: z.object({
    title: z.string().min(3).max(200),
    description: z.string().optional(),
    category: z.enum(['venue', 'decoration', 'catering', 'logistics', 'invitations', 'music', 'photography', 'others']),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    status: z.enum(['pending', 'in-progress', 'completed', 'cancelled']).optional(),
    dueDate: z.string().date().optional(),
    assignedTo: z.array(z.string()).optional(),
    estimatedHours: z.number().positive().optional(),
    tags: z.array(z.string()).optional()
  })
});