import { CollaboratorRole } from '../types';
import { WeddingPermission } from './permissions';

/**
 * Track C: what a client family sees on a wedding their planner runs. Set per
 * wedding (Wedding.clientAccess) by staff with `client.manage`, falling back
 * to the agency's default (Organization.settings.defaultClientAccess), then
 * to the "collaborate" preset. See
 * apnautasav_frontend/docs/TrackC_Planner_Organization_Plan.md §6.
 *
 * Mirrored for the UI in apnautasav_frontend/lib/client-access.ts.
 */
export const CLIENT_SECTION_LEVELS = {
  events: ['hidden', 'view', 'edit'],
  guests: ['hidden', 'view', 'edit'],
  tasks: ['hidden', 'view', 'complete'],
  budget: ['hidden', 'summary', 'full'],
  vendors: ['hidden', 'basic', 'full'],
  activity: ['hidden', 'view'],
} as const;

export type ClientSection = keyof typeof CLIENT_SECTION_LEVELS;
export type ClientSections = { [K in ClientSection]: (typeof CLIENT_SECTION_LEVELS)[K][number] };
export type ClientAccessPreset = 'view_only' | 'collaborate' | 'custom';

export interface ClientAccessSettings {
  preset: ClientAccessPreset;
  sections: ClientSections;
  /** Whether the 6-character wedding code lets someone join as a viewer. Off by default on agency weddings. */
  allowJoinByCode: boolean;
}

export const CLIENT_PRESETS: Record<Exclude<ClientAccessPreset, 'custom'>, ClientSections> = {
  view_only: { events: 'view', guests: 'view', tasks: 'view', budget: 'hidden', vendors: 'basic', activity: 'hidden' },
  collaborate: { events: 'view', guests: 'edit', tasks: 'complete', budget: 'hidden', vendors: 'basic', activity: 'hidden' },
};

export const DEFAULT_CLIENT_ACCESS: ClientAccessSettings = {
  preset: 'collaborate',
  sections: CLIENT_PRESETS.collaborate,
  allowJoinByCode: false,
};

const levelOk = (section: ClientSection, level: unknown): boolean =>
  (CLIENT_SECTION_LEVELS[section] as readonly string[]).includes(level as string);

/** Fills gaps and drops invalid values, so a partly-set document always yields a full settings object. */
export const normaliseClientAccess = (raw?: Partial<ClientAccessSettings> | null, fallback = DEFAULT_CLIENT_ACCESS): ClientAccessSettings => {
  const preset = raw?.preset && ['view_only', 'collaborate', 'custom'].includes(raw.preset) ? raw.preset : fallback.preset;
  const base = preset === 'custom' ? fallback.sections : CLIENT_PRESETS[preset];
  const sections = { ...base } as Record<ClientSection, string>;
  if (preset === 'custom') {
    for (const key of Object.keys(CLIENT_SECTION_LEVELS) as ClientSection[]) {
      const level = raw?.sections?.[key];
      if (levelOk(key, level)) sections[key] = level as string;
    }
  }
  return {
    preset,
    sections: sections as ClientSections,
    allowJoinByCode: typeof raw?.allowJoinByCode === 'boolean' ? raw.allowJoinByCode : fallback.allowJoinByCode,
  };
};

/** The effective settings for one wedding: its own, else the agency default, else the built-in default. */
export const effectiveClientAccess = (
  weddingSetting?: Partial<ClientAccessSettings> | null,
  orgDefault?: Partial<ClientAccessSettings> | null
): ClientAccessSettings => {
  const agency = normaliseClientAccess(orgDefault);
  return weddingSetting ? normaliseClientAccess(weddingSetting, agency) : agency;
};

/**
 * A client's wedding permissions: what their section settings allow, capped
 * by their collaborator role (a viewer client never edits, whatever the
 * section says). Never budget/vendor/collaborator management, AI or wedding
 * settings — those stay with the agency.
 */
export const clientPermissions = (role: CollaboratorRole, sections: ClientSections): Set<WeddingPermission> => {
  const canEdit = role === CollaboratorRole.EDITOR || role === CollaboratorRole.ADMIN;
  const p = new Set<WeddingPermission>();

  if (sections.events !== 'hidden') p.add('events.view');
  if (sections.events === 'edit' && canEdit) p.add('events.manage');
  if (sections.guests !== 'hidden') p.add('guests.view');
  if (sections.guests === 'edit' && canEdit) p.add('guests.manage');
  if (sections.tasks !== 'hidden') p.add('tasks.view');
  if (sections.tasks === 'complete' && canEdit) p.add('tasks.complete');
  if (sections.budget !== 'hidden') p.add('budget.summary');
  if (sections.budget === 'full') p.add('budget.view');
  if (sections.vendors !== 'hidden') p.add('vendors.view');
  if (sections.vendors === 'full') p.add('vendors.details');
  if (sections.activity === 'view') p.add('activity.view');
  if (canEdit) p.add('notes.manage');
  return p;
};
