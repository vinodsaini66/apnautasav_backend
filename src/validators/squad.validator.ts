import { z } from 'zod';
import { SQUAD_AREAS, MAX_SQUADS_PER_WEDDING } from '../constants/squads';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, 'Colour must be a hex value like #9e2b46');

const squadFields = {
  name: z.string().trim().min(2, 'Squad name must be at least 2 characters').max(40),
  emoji: z.string().trim().min(1).max(16).optional(),
  color: hexColor.optional(),
  areas: z.array(z.enum(SQUAD_AREAS)).max(SQUAD_AREAS.length).optional()
};

export const setupSquadsSchema = z.object({
  body: z.object({
    squads: z.array(z.object(squadFields)).min(1, 'Pick at least one squad').max(MAX_SQUADS_PER_WEDDING)
  })
});

export const createSquadSchema = z.object({
  body: z.object(squadFields)
});

export const updateSquadSchema = z.object({
  body: z.object({
    name: squadFields.name.optional(),
    emoji: squadFields.emoji,
    color: squadFields.color,
    areas: squadFields.areas,
    captainId: objectId.nullable().optional(),
    memberIds: z.array(objectId).max(100).optional()
  })
});
