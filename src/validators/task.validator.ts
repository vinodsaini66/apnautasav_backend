import { z } from 'zod';

const recurrenceSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  interval: z.number().int().positive(),
  endDate: z.coerce.date().optional()
});

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
    tags: z.array(z.string()).optional(),
    eventId: z.string().optional(),
    reminderOffsetDays: z.number().int().min(0).optional(),
    recurrence: recurrenceSchema.optional(),
    dependsOn: z.array(z.string()).optional()
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
    tags: z.array(z.string()).optional(),
    eventId: z.string().optional(),
    reminderOffsetDays: z.number().int().min(0).optional(),
    recurrence: recurrenceSchema.optional(),
    dependsOn: z.array(z.string()).optional()
  })
});

export const assignTaskSchema = z.object({
  body: z.object({
    assignedTo: z.array(z.string()).min(1, 'assignedTo must include at least one user')
  })
});

export const updateTaskStatusSchema = z.object({
  body: z.object({
    status: z.enum(['pending', 'in-progress', 'completed', 'cancelled']),
    actualHours: z.number().positive().optional()
  })
});

export const addSubtaskSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200)
  })
});

export const updateSubtaskSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200).optional(),
    completed: z.boolean().optional()
  })
});
