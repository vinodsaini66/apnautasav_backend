import { CategoryConfig, ICategoryConfig } from '../../models/vendor-os/category-config.model';
import { QuoteTemplate } from '../../models/vendor-os/quote-template.model';
import { CATEGORY_CONFIG_SEEDS } from './category-config.data';
import { badRequest, notFound } from '../../utils/vendorOs';
import logger from '../../utils/logger';

let defaultsEnsured = false;

export class CategoryConfigService {
  /**
   * Insert-if-missing for the 8 launch categories and their system quote
   * templates. Idempotent and cheap after the first call per process, so
   * it's called lazily from the read paths instead of requiring a separate
   * seed step before Vendor OS works.
   */
  static async ensureDefaults(): Promise<void> {
    if (defaultsEnsured) return;
    try {
      let sortOrder = 0;
      for (const seed of CATEGORY_CONFIG_SEEDS) {
        await CategoryConfig.updateOne(
          { key: seed.key },
          { $setOnInsert: { ...seed, sortOrder: sortOrder++, isActive: true } },
          { upsert: true }
        );
        await QuoteTemplate.updateOne(
          { vendorId: null, categoryKey: seed.key },
          {
            $setOnInsert: {
              vendorId: null,
              categoryKey: seed.key,
              name: `${seed.name} — standard quote`,
              items: seed.defaultQuoteItems.map((i) => ({
                name: i.name,
                unit: i.unit,
                qty: i.qty ?? 1,
                rate: i.rate ?? 0,
                taxPercent: i.taxPercent ?? 0,
              })),
              gstEnabled: false,
              validityDays: 15,
              terms: seed.defaultTerms,
              deliverables: seed.defaultDeliverables,
              paymentSchedule: [
                { label: 'Advance to block the date', percent: 30, dueOffsetDays: 0 },
                { label: '30 days before the event', percent: 50 },
                { label: 'On the event day', percent: 20 },
              ],
            },
          },
          { upsert: true }
        );
      }
      defaultsEnsured = true;
    } catch (error) {
      logger.error('Vendor OS: failed to ensure default category configs', error);
    }
  }

  static async list(includeInactive = false) {
    await this.ensureDefaults();
    return CategoryConfig.find(includeInactive ? {} : { isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
  }

  static async getByKey(key: string): Promise<ICategoryConfig> {
    await this.ensureDefaults();
    const config = await CategoryConfig.findOne({ key: key.toLowerCase() });
    if (!config) throw notFound('Category');
    return config;
  }

  static async create(data: Partial<ICategoryConfig>) {
    if (!data.key) throw badRequest('key is required');
    const exists = await CategoryConfig.exists({ key: data.key.toLowerCase() });
    if (exists) throw badRequest('A category with this key already exists');
    return CategoryConfig.create(data);
  }

  static async update(key: string, data: Partial<ICategoryConfig>) {
    const { key: _ignored, ...rest } = data as any;
    const config = await CategoryConfig.findOneAndUpdate({ key: key.toLowerCase() }, { $set: rest }, { new: true, runValidators: true });
    if (!config) throw notFound('Category');
    return config;
  }

  /**
   * Validates a vendor's category-specific profile answers against the
   * category's profileSchema: drops unknown keys, coerces types. Required
   * fields are NOT enforced here (the wizard saves partially) — they count
   * toward profile completeness instead.
   */
  static sanitizeCategoryProfile(config: ICategoryConfig, input: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const field of config.profileSchema) {
      if (!(field.key in input)) continue;
      const value = input[field.key];
      if (value === null || value === '') {
        out[field.key] = null;
        continue;
      }
      switch (field.type) {
        case 'number': {
          const n = Number(value);
          if (isNaN(n)) throw badRequest(`${field.label} must be a number`);
          out[field.key] = n;
          break;
        }
        case 'boolean':
          out[field.key] = value === true || value === 'true';
          break;
        case 'multiselect':
        case 'tags': {
          const arr = Array.isArray(value) ? value : [value];
          out[field.key] = arr.map((v) => String(v).trim()).filter(Boolean).slice(0, 50);
          break;
        }
        case 'select':
          if (field.options?.length && !field.options.includes(String(value))) {
            throw badRequest(`${field.label} must be one of: ${field.options.join(', ')}`);
          }
          out[field.key] = String(value);
          break;
        default:
          out[field.key] = String(value).slice(0, field.type === 'textarea' ? 3000 : 300);
      }
    }
    return out;
  }
}
