import { z } from 'zod';
import { CLIENT_SECTION_LEVELS } from '../constants/client-access';

const level = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values).optional();

/** Body shape for a client-access setting (per wedding, or the agency default). */
export const clientAccessBody = z
  .object({
    preset: z.enum(['view_only', 'collaborate', 'custom']),
    sections: z
      .object({
        events: level(CLIENT_SECTION_LEVELS.events),
        guests: level(CLIENT_SECTION_LEVELS.guests),
        tasks: level(CLIENT_SECTION_LEVELS.tasks),
        budget: level(CLIENT_SECTION_LEVELS.budget),
        vendors: level(CLIENT_SECTION_LEVELS.vendors),
        activity: level(CLIENT_SECTION_LEVELS.activity),
      })
      .strict()
      .optional(),
    allowJoinByCode: z.boolean().optional(),
  })
  .strict();

export const updateClientAccessSchema = z.object({
  params: z.object({ weddingId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid wedding') }),
  // `null` resets the wedding to the agency's default.
  body: z.union([clientAccessBody, z.object({ reset: z.literal(true) }).strict()]),
});
