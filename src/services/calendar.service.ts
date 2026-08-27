import { createEvents, DateArray, EventAttributes } from 'ics';

// Minimal shape calendar-building needs from an Event document — decoupled
// from the Mongoose IEvent interface so this stays a plain function of
// data, not a controller helper.
export interface CalendarEventInput {
  title: string;
  description?: string;
  startDateTime?: Date;
  endDateTime?: Date;
  location?: {
    venueName?: string;
    address?: string;
  };
}

export interface CalendarWeddingInput {
  name?: string;
  weddingDate: Date;
  location?: string;
}

const DEFAULT_EVENT_DURATION_MS = 2 * 60 * 60 * 1000; // +2 hours

const toDateArray = (date: Date): DateArray => [
  date.getFullYear(),
  date.getMonth() + 1,
  date.getDate(),
  date.getHours(),
  date.getMinutes()
];

const buildLocation = (location?: { venueName?: string; address?: string }): string | undefined => {
  if (!location) return undefined;
  const parts = [location.venueName, location.address].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : undefined;
};

// One VEVENT per Event with a set startDateTime. Events without a date are
// valid "TBD" functions by design and are simply skipped — there's nothing
// to put on a calendar yet.
export const buildEventAttributes = (event: CalendarEventInput): EventAttributes | null => {
  if (!event.startDateTime) return null;

  const start = new Date(event.startDateTime);
  const end = event.endDateTime ? new Date(event.endDateTime) : new Date(start.getTime() + DEFAULT_EVENT_DURATION_MS);

  return {
    title: event.title,
    description: event.description,
    location: buildLocation(event.location),
    start: toDateArray(start),
    end: toDateArray(end)
  };
};

// The wedding day itself, from Wedding.weddingDate — rendered as an
// all-day event since the model only stores a date, not a ceremony time.
export const buildWeddingDayEventAttributes = (wedding: CalendarWeddingInput): EventAttributes => {
  const date = new Date(wedding.weddingDate);

  return {
    title: wedding.name || 'Wedding Day',
    location: wedding.location,
    start: [date.getFullYear(), date.getMonth() + 1, date.getDate()],
    duration: { days: 1 }
  };
};

// Thin sync wrapper around ics#createEvents (its non-callback overload is
// synchronous) — throws so callers can let the route's try/catch handle it
// the same way every other controller error does.
export const generateICS = (events: EventAttributes[]): string => {
  const { error, value } = createEvents(events);
  if (error) throw error;
  return value || '';
};
