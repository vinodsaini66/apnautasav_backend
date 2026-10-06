import { WeddingAccess } from '../access.service';
import { ExportBranding } from '../export.service';
import logger from '../../utils/logger';

// Logos are fetched once per URL and kept in memory (they change rarely, and
// an export shouldn't wait on S3 every time). Small cap so it can't grow unbounded.
const logoCache = new Map<string, Buffer | null>();
const MAX_CACHED = 100;

const fetchLogo = async (url?: string): Promise<Buffer | undefined> => {
  if (!url) return undefined;
  if (logoCache.has(url)) return logoCache.get(url) ?? undefined;
  let logo: Buffer | null = null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const type = res.headers.get('content-type') ?? '';
    // pdfkit embeds PNG and JPEG only.
    if (res.ok && /image\/(png|jpe?g)/.test(type)) logo = Buffer.from(await res.arrayBuffer());
  } catch (error) {
    logger.warn(`Couldn't fetch agency logo for a PDF (${url})`, error);
  }
  if (logoCache.size >= MAX_CACHED) logoCache.delete(logoCache.keys().next().value as string);
  logoCache.set(url, logo);
  return logo ?? undefined;
};

/**
 * Branding for a PDF exported from a wedding: the agency's, when the wedding
 * belongs to one whose plan includes branded exports — for its staff and its
 * client families alike. Otherwise null (the plain ApnaUtsav PDF).
 */
export const exportBrandingFor = async (access?: WeddingAccess): Promise<ExportBranding | null> => {
  const org = access?.org;
  if (!org?.brandedExports) return null;
  return {
    name: org.name,
    color: org.brandColor,
    logo: await fetchLogo(org.logoUrl),
    showPoweredBy: org.showPoweredBy,
  };
};
