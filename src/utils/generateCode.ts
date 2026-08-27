export const generateWeddingCode = (): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return code;
};

export const generateOTP = (length: number = 6): string => {
  const digits = '0123456789';
  let otp = '';
  
  for (let i = 0; i < length; i++) {
    otp += digits.charAt(Math.floor(Math.random() * digits.length));
  }
  
  return otp;
};

export const generateInvitationCode = (): string => {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
};

// Short base36 suffix appended to auto-generated public wedding-website
// slugs (e.g. "priya-rahul-4f2a") — keeps the slug human-readable while
// making collisions unlikely; retried a few times on a real collision.
export const generateSlugSuffix = (length: number = 4): string => {
  let suffix = '';
  while (suffix.length < length) {
    suffix += Math.random().toString(36).substring(2);
  }
  return suffix.substring(0, length);
};

// Lowercase, hyphenated, URL-safe slug fragment from free text (e.g. a
// bride/groom name) — strips anything that isn't alphanumeric.
export const slugify = (input: string): string => {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

// Ensures a wedding has a publicSlug, generating and saving one (from
// bride+groom names, retried on a duplicate-key collision) if it doesn't
// already have one. Does NOT touch isPublic — shared by
// WeddingController.updatePublicSettings (Phase 8, when a wedding is first
// made public) and the guest compose/rsvpLink flow (Phase 2), which needs a
// stable public URL for a guest's RSVP link even for a wedding that has
// never been made public.
export const ensurePublicSlug = async (wedding: {
  publicSlug?: string;
  brideName: string;
  groomName: string;
  save: () => Promise<any>;
}): Promise<string> => {
  if (wedding.publicSlug) return wedding.publicSlug;

  const base = slugify(`${wedding.brideName}-${wedding.groomName}`) || 'wedding';
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    wedding.publicSlug = `${base}-${generateSlugSuffix(4)}`;
    try {
      await wedding.save();
      return wedding.publicSlug;
    } catch (err: any) {
      // E11000 duplicate-key on publicSlug — regenerate and retry.
      if (err?.code === 11000 && attempt < maxAttempts - 1) continue;
      throw err;
    }
  }

  throw new Error('Failed to generate a unique public slug');
};