// System (global) checklist templates: visible to every account, read-only
// through the API, and kept in sync from this file on every server start
// (services/system-templates.service.ts). Change a template here and the
// next boot updates it; `key` is the stable identity.
//
// dueOffsetDays: days relative to the day the task belongs to (negative =
// before). For an item with an `eventType`, that is the matching function's
// date on the wedding when it has one, otherwise the wedding date (see
// TaskController.applyTemplate). Items without an eventType always count
// from the wedding date.
//
// Categories must be one of the Task/TaskTemplate enums: venue, decoration,
// catering, logistics, invitations, music, photography, others.

type Priority = 'low' | 'medium' | 'high' | 'urgent';
type Category = 'venue' | 'decoration' | 'catering' | 'logistics' | 'invitations' | 'music' | 'photography' | 'others';
type EventType = 'ceremony' | 'reception' | 'mehendi' | 'sangeet' | 'haldi';

interface SeedItem {
  title: string;
  description?: string;
  category: Category;
  priority: Priority;
  dueOffsetDays: number;
  eventType?: EventType;
}

export interface SystemTemplateSeed {
  key: string;
  name: string;
  description: string;
  /** Position in the picker, smallest first. */
  sortOrder: number;
  items: SeedItem[];
}

const forEvent = (eventType: EventType, items: Omit<SeedItem, 'eventType'>[]): SeedItem[] =>
  items.map((item) => ({ ...item, eventType }));

export const SYSTEM_TASK_TEMPLATES: SystemTemplateSeed[] = [
  {
    key: 'standard-indian-wedding',
    name: 'Standard Indian Wedding Checklist',
    description:
      'A general-purpose checklist covering the essentials for a multi-day Indian wedding, from venue booking to the big day.',
    sortOrder: 0,
    items: [
      { title: 'Book the wedding venue', category: 'venue', priority: 'urgent', dueOffsetDays: -120 },
      { title: 'Finalize guest list', category: 'others', priority: 'high', dueOffsetDays: -90 },
      { title: 'Book photographer & videographer', category: 'photography', priority: 'high', dueOffsetDays: -90 },
      { title: 'Shortlist and book caterer', category: 'catering', priority: 'high', dueOffsetDays: -75 },
      { title: 'Send invitations', category: 'invitations', priority: 'high', dueOffsetDays: -45 },
      { title: 'Finalize decoration theme', category: 'decoration', priority: 'medium', dueOffsetDays: -45 },
      { title: 'Book DJ / live music', category: 'music', priority: 'medium', dueOffsetDays: -30 },
      { title: 'Arrange guest travel & accommodation', category: 'logistics', priority: 'high', dueOffsetDays: -21 },
      { title: 'Confirm final headcount with caterer', category: 'catering', priority: 'urgent', dueOffsetDays: -7 },
      { title: 'Pack essentials for the big day', category: 'others', priority: 'medium', dueOffsetDays: -2 },
      { title: 'Send thank-you notes to guests', category: 'others', priority: 'low', dueOffsetDays: 7 },
    ],
  },
  {
    // Key kept from the original seed so existing databases update in place.
    key: 'mehendi-ceremony',
    name: 'Mehendi Checklist',
    description: 'Artists, decor, menu and music for the Mehendi. Due dates count back from your Mehendi date.',
    sortOrder: 1,
    items: forEvent('mehendi', [
      { title: 'Book mehendi artist(s)', description: 'Count the hands to be done, not hours. Confirm how many artists and the bride\'s design time.', category: 'others', priority: 'high', dueOffsetDays: -45 },
      { title: 'Book dhol / DJ and make the mehendi playlist', category: 'music', priority: 'medium', dueOffsetDays: -21 },
      { title: 'Choose bridal mehendi design and bridesmaids\' designs', category: 'others', priority: 'medium', dueOffsetDays: -21 },
      { title: 'Plan mehendi decor: swings, floral umbrellas, floor cushions', category: 'decoration', priority: 'medium', dueOffsetDays: -20 },
      { title: 'Plan mehendi menu: chaat counters, snacks, mocktails', category: 'catering', priority: 'medium', dueOffsetDays: -18 },
      { title: 'Arrange guest favours (bangles, potli bags)', category: 'others', priority: 'low', dueOffsetDays: -10 },
      { title: 'Arrange low seating and shade for artists and guests', category: 'logistics', priority: 'medium', dueOffsetDays: -7 },
      { title: 'Buy fresh henna cones and aftercare (lemon-sugar, cotton, tissue)', category: 'others', priority: 'medium', dueOffsetDays: -3 },
      { title: 'Brief photographer on mehendi candids and close-ups', category: 'photography', priority: 'low', dueOffsetDays: -3 },
    ]),
  },
  {
    key: 'haldi-ceremony',
    name: 'Haldi Checklist',
    description: 'Muhurat, ubtan, decor and clean-up for the Haldi. Due dates count back from your Haldi date.',
    sortOrder: 2,
    items: forEvent('haldi', [
      { title: 'Fix the haldi muhurat with the family pandit', category: 'others', priority: 'high', dueOffsetDays: -30 },
      { title: 'Plan haldi decor: marigold backdrop, phoolon ki chadar', category: 'decoration', priority: 'medium', dueOffsetDays: -20 },
      { title: 'Tell guests the yellow dress code', category: 'invitations', priority: 'medium', dueOffsetDays: -14 },
      { title: 'Plan haldi brunch menu', category: 'catering', priority: 'medium', dueOffsetDays: -14 },
      { title: 'Book dhol for the haldi', category: 'music', priority: 'low', dueOffsetDays: -14 },
      { title: 'Arrange haldi ubtan ingredients, bowls and flowers', category: 'others', priority: 'high', dueOffsetDays: -3 },
      { title: 'Ask photographer for a waterproof cover and candid shots', category: 'photography', priority: 'low', dueOffsetDays: -3 },
      { title: 'Arrange old towels, floor covering and a clean-up crew', category: 'logistics', priority: 'medium', dueOffsetDays: -2 },
    ]),
  },
  {
    key: 'sangeet-night',
    name: 'Sangeet Checklist',
    description: 'Choreography, sound, stage and dinner for the Sangeet. Due dates count back from your Sangeet date.',
    sortOrder: 3,
    items: forEvent('sangeet', [
      { title: 'Book sangeet venue or banquet hall', category: 'venue', priority: 'high', dueOffsetDays: -60 },
      { title: 'Hire a choreographer and fix the performance list', category: 'music', priority: 'high', dueOffsetDays: -45 },
      { title: 'Book DJ, anchor/emcee and stage lighting', category: 'music', priority: 'high', dueOffsetDays: -30 },
      { title: 'Set rehearsal schedule for family performances', category: 'music', priority: 'medium', dueOffsetDays: -30 },
      { title: 'Plan sangeet dinner menu and bar', category: 'catering', priority: 'high', dueOffsetDays: -21 },
      { title: 'Plan stage and dance-floor decor', category: 'decoration', priority: 'medium', dueOffsetDays: -21 },
      { title: 'Make the couple\'s story slideshow and final song list', category: 'music', priority: 'medium', dueOffsetDays: -10 },
      { title: 'Share the performance order with the photo and video team', category: 'photography', priority: 'medium', dueOffsetDays: -3 },
      { title: 'Sound check and tech rehearsal at the venue', category: 'logistics', priority: 'high', dueOffsetDays: -1 },
    ]),
  },
  {
    key: 'wedding-ceremony',
    name: 'Wedding Ceremony (Pheras) Checklist',
    description: 'Muhurat, pandit, mandap, baraat and rituals for the main ceremony. Due dates count back from your ceremony date.',
    sortOrder: 4,
    items: forEvent('ceremony', [
      { title: 'Fix the wedding muhurat with the pandit', category: 'others', priority: 'urgent', dueOffsetDays: -90 },
      { title: 'Book the pandit and get the puja samagri list', category: 'others', priority: 'high', dueOffsetDays: -60 },
      { title: 'Plan wedding lunch/dinner menu and do a tasting', category: 'catering', priority: 'high', dueOffsetDays: -30 },
      { title: 'Finalise mandap design and decor', category: 'decoration', priority: 'high', dueOffsetDays: -30 },
      { title: 'Plan the baraat: ghodi or car, band, dhol, route and timing', category: 'logistics', priority: 'high', dueOffsetDays: -21 },
      { title: 'Arrange varmala/jaimala and stage for it', category: 'decoration', priority: 'medium', dueOffsetDays: -10 },
      { title: 'Collect puja samagri: havan kund, ghee, kalash, coconut, rice', category: 'others', priority: 'high', dueOffsetDays: -7 },
      { title: 'Reserve family seating close to the mandap', category: 'logistics', priority: 'medium', dueOffsetDays: -7 },
      { title: 'Give the photographer a shot list for every ritual', category: 'photography', priority: 'medium', dueOffsetDays: -5 },
      { title: 'Prepare kanyadaan and vidaai items, and decorate the vidaai car', category: 'others', priority: 'medium', dueOffsetDays: -5 },
      { title: 'Pack a day-of emergency kit (safety pins, tape, medicines)', category: 'others', priority: 'low', dueOffsetDays: -1 },
    ]),
  },
  {
    key: 'reception-party',
    name: 'Reception Checklist',
    description: 'Venue, stage, dinner and guest flow for the Reception. Due dates count back from your Reception date.',
    sortOrder: 5,
    items: forEvent('reception', [
      { title: 'Book the reception venue', category: 'venue', priority: 'urgent', dueOffsetDays: -90 },
      { title: 'Send reception invites to extended family and colleagues', category: 'invitations', priority: 'high', dueOffsetDays: -30 },
      { title: 'Plan reception dinner menu and do a tasting', category: 'catering', priority: 'high', dueOffsetDays: -30 },
      { title: 'Plan reception stage decor and couple backdrop', category: 'decoration', priority: 'high', dueOffsetDays: -30 },
      { title: 'Book live band or DJ, and pick the first-dance song', category: 'music', priority: 'medium', dueOffsetDays: -21 },
      { title: 'Order return gifts for guests', category: 'others', priority: 'medium', dueOffsetDays: -14 },
      { title: 'Plan guest transport and parking', category: 'logistics', priority: 'medium', dueOffsetDays: -10 },
      { title: 'Plan the stage photo queue or a photo booth', category: 'photography', priority: 'low', dueOffsetDays: -7 },
      { title: 'Ask a trusted person to manage the shagun/gift counter', category: 'logistics', priority: 'medium', dueOffsetDays: -3 },
      { title: 'Send thank-you messages after the reception', category: 'others', priority: 'low', dueOffsetDays: 3 },
    ]),
  },
];
