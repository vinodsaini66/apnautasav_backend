import { z } from 'zod';

export const createEventSchema = z.object({
  body: z.object({
    title: z.string()
      .min(3, 'Title must be at least 3 characters')
      .max(200, 'Title cannot exceed 200 characters'),
    
    description: z.string()
      .max(1000, 'Description cannot exceed 1000 characters')
      .optional(),
    
    eventType: z.enum([
      'ceremony', 
      'reception', 
      'mehendi', 
      'sangeet', 
      'haldi', 
      'engagement', 
      'cocktail', 
      'other'
    ]),
    
    startDateTime: z.string().datetime(),
    
    endDateTime: z.string().datetime(),
    
    location: z.object({
      venueName: z.string().min(2, 'Venue name is required'),
      address: z.string().min(5, 'Address is required'),
      city: z.string().min(2, 'City is required'),
      state: z.string().min(2, 'State is required'),
      country: z.string().default('India'),
      postalCode: z.string().optional(),
      coordinates: z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180)
      }).optional()
    }).optional(),
    
    dressCode: z.string().max(100).optional(),
    
    guests: z.array(z.string()).optional(),
    
    status: z.enum(['planning', 'confirmed', 'completed', 'cancelled']).optional(),
    
    isPublic: z.boolean().optional(),
    
    notes: z.string().max(2000).optional(),
    
    imageUrl: z.string().url().optional(),
    
    contactPerson: z.object({
      name: z.string(),
      phone: z.string(),
      email: z.string().email().optional()
    }).optional(),
    
    budget: z.object({
      estimated: z.number().positive(),
      actual: z.number().positive().optional()
    }).optional(),
    
    vendors: z.array(z.string()).optional(),
    
    tasks: z.array(z.string()).optional()
  })
});

export const updateEventSchema = z.object({
  body: z.object({
    title: z.string()
      .min(3, 'Title must be at least 3 characters')
      .max(200, 'Title cannot exceed 200 characters')
      .optional(),
    
    description: z.string()
      .max(1000, 'Description cannot exceed 1000 characters')
      .optional(),
    
    eventType: z.enum([
      'ceremony', 
      'reception', 
      'mehendi', 
      'sangeet', 
      'haldi', 
      'engagement', 
      'cocktail', 
      'other'
    ]).optional(),
    
    startDateTime: z.string().datetime().optional(),
    
    endDateTime: z.string().datetime().optional(),
    
    location: z.object({
      venueName: z.string().min(2).optional(),
      address: z.string().min(5).optional(),
      city: z.string().min(2).optional(),
      state: z.string().min(2).optional(),
      country: z.string().optional(),
      postalCode: z.string().optional(),
      coordinates: z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180)
      }).optional()
    }).optional(),
    
    dressCode: z.string().max(100).optional(),
    
    guests: z.array(z.string()).optional(),
    
    status: z.enum(['planning', 'confirmed', 'completed', 'cancelled']).optional(),
    
    isPublic: z.boolean().optional(),
    
    notes: z.string().max(2000).optional(),
    
    imageUrl: z.string().url().optional(),
    
    contactPerson: z.object({
      name: z.string(),
      phone: z.string(),
      email: z.string().email().optional()
    }).optional(),
    
    budget: z.object({
      estimated: z.number().positive().optional(),
      actual: z.number().positive().optional()
    }).optional(),
    
    vendors: z.array(z.string()).optional(),
    
    tasks: z.array(z.string()).optional()
  })
});

export const addGuestsToEventSchema = z.object({
  body: z.object({
    guestIds: z.array(z.string()).min(1, 'At least one guest ID is required')
  })
});