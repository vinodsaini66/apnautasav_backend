/**
 * Family squads — see models/squad.model.ts. Mirrored for the UI in
 * apnautasav_frontend/lib/squads.ts (areas + defaults) — keep both in sync.
 */

export const SQUAD_AREAS = ['guests', 'vendors', 'budget', 'events', 'fun'] as const;
export type SquadArea = (typeof SQUAD_AREAS)[number];

export const MAX_SQUADS_PER_WEDDING = 8;

/** The four squads offered (all pre-ticked) when a wedding sets squads up. */
export const DEFAULT_SQUADS: { name: string; emoji: string; color: string; areas: SquadArea[] }[] = [
  { name: 'Swagat Team', emoji: '🏨🙏', color: '#9e2b46', areas: ['guests'] },
  { name: 'Prabandh Team', emoji: '🚚📋', color: '#0f6e5b', areas: ['vendors', 'budget'] },
  { name: 'Shubh Aarambh Team', emoji: '🛍️🪔', color: '#c98a2c', areas: ['events'] },
  { name: 'Ronak Team', emoji: '🎶💃', color: '#6d3fa0', areas: ['fun'] }
];

/**
 * Reminder copy for the daily squad nudge (cron/squadNudge.ts). Several
 * variants per signal, picked at random, so nobody sees the same line every
 * time. Light Hinglish, teasing the squad — never a named person.
 * Placeholders: {squad}, {count}.
 */
export type SquadNudgeSignal = 'overdue' | 'paymentsDue' | 'unclaimed' | 'rsvpPending';

export const SQUAD_NUDGE_COPY: Record<SquadNudgeSignal, { title: string; body: string }[]> = {
  overdue: [
    { title: '{squad}, thoda dhyaan do 👀', body: '{count} kaam ki date nikal gayi hai. Aaj ek bhi ho gaya to bada farak padega!' },
    { title: 'Ye kaam ab mehmaan ban gaye hain 😅', body: '{squad} ke {count} kaam kab se intezaar kar rahe hain. Chalo, aaj nipta dete hain.' },
    { title: 'Shaadi ki ghadi tik-tik kar rahi hai ⏰', body: '{squad}: {count} kaam late chal rahe hain. Ek-ek karke khatam karo!' }
  ],
  paymentsDue: [
    { title: 'Paise ki baat, thodi boring par zaroori 💸', body: '{count} payment due hain. {squad}, ek baar dekh lo na.' },
    { title: 'Hisaab-kitaab time 🧾', body: '{squad}, {count} payment ki date aa gayi hai. Vendor khush to shaadi khush!' }
  ],
  unclaimed: [
    { title: '{count} kaam aapka intezaar kar rahe hain 🙋', body: '{squad} me kisi ne abhi tak inhe uthaya nahi. "Main karunga" dabao aur hero bano!' },
    { title: 'Kaun banega aaj ka hero? 🦸', body: '{squad} ke {count} khule kaam pade hain. Pehle aao, pehle pao!' },
    { title: '{squad}, kaam baant lo 🤝', body: '{count} kaam abhi kisi ke naam nahi hain. Ek tap me apna lo.' }
  ],
  rsvpPending: [
    { title: 'Mehmaan "shayad" bol rahe hain 🤔', body: '{count} mehmaanon ne abhi jawab nahi diya. {squad}, ek WhatsApp bhej kar faisla karwao!' },
    { title: 'Guest list aapko yaad kar rahi hai 💌', body: '{count} RSVP baaki hain. {squad}, ek reminder bhej do na.' }
  ]
};

/** Weekly digest push (Sunday). Placeholder: {days}. */
export const DIGEST_COPY: { title: string; body: string }[] = [
  { title: 'Is hafte ka Shaadi Samachar 📰', body: 'Kaun aage, kaun peeche — dekhiye squads ka haal. Bas {days} din baaki!' },
  { title: 'Shaadi Samachar aa gaya 📰', body: 'Hafte ka hero kaun bana? {days} din bache hain — ek nazar daal lo.' }
];

export const fillCopy = (text: string, vars: Record<string, string | number>): string =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => (key in vars ? String(vars[key]) : `{${key}}`));

export const pickRandom = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
