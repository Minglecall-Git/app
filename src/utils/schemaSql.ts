import { ALL_WORLDWIDE_COUNTRIES, ALL_LANGUAGES, ALL_ZODIAC_SIGNS, ALL_INTERESTS, DEFAULT_CURRENCIES } from './taxonomies';

/**
 * Escapes SQL string literals safely
 */
function sqlEscape(val: string): string {
  if (!val) return '';
  return val.replace(/'/g, "''");
}

/**
 * Generates comprehensive SQL INSERT statements for all master taxonomies.
 * This remains dynamic (derived from taxonomies.ts) and is NOT a duplicate of
 * the canonical DDL in /supabase_schema.sql.
 */
export function generateTaxonomySeedSql(): string {
  // Countries
  const countryValues = ALL_WORLDWIDE_COUNTRIES.map(
    (c) =>
      `('${sqlEscape(c.code)}', '${sqlEscape(c.name)}', '${sqlEscape(c.flag)}', '${sqlEscape(c.region)}', ${
        c.isTier1 ? 'true' : 'false'
      }, true)`
  ).join(',\n');

  // Languages
  const langValues = ALL_LANGUAGES.map(
    (l) =>
      `('${sqlEscape(l.code)}', '${sqlEscape(l.name)}', '${sqlEscape(l.nativeName)}', ${
        l.popular ? 'true' : 'false'
      }, '${sqlEscape(l.region || 'Global')}', true)`
  ).join(',\n');

  // Zodiac Signs
  const zodiacValues = ALL_ZODIAC_SIGNS.map(
    (z) =>
      `('${sqlEscape(z.key)}', '${sqlEscape(z.name)}', '${sqlEscape(z.symbol)}', '${sqlEscape(z.dateRange)}', '${sqlEscape(
        z.element
      )}', true)`
  ).join(',\n');

  // Interests
  const interestValues = ALL_INTERESTS.map(
    (i) =>
      `('${sqlEscape(i.id)}', '${sqlEscape(i.name)}', '${sqlEscape(i.category)}', '${sqlEscape(
        i.iconName || 'Sparkles'
      )}', '${sqlEscape(i.color || '#6366f1')}', ${i.popular ? 'true' : 'false'}, true)`
  ).join(',\n');

  // Currencies
  const currencyValues = DEFAULT_CURRENCIES.map(
    (c, idx) =>
      `('${sqlEscape(c.code)}', '${sqlEscape(c.name)}', '${sqlEscape(c.symbol)}', ${Number(c.rateFromUsd)}, ${
        c.enabled !== false ? 'true' : 'false'
      }, ${c.orderNum != null ? Number(c.orderNum) : idx})`
  ).join(',\n');

  // Full catalog allow-lists (admin can disable later via Global Taxonomies)
  const defaultCountryCodes = ALL_WORLDWIDE_COUNTRIES.map((c) => `'${sqlEscape(c.code)}'`).join(',');
  const defaultLanguageNames = ALL_LANGUAGES.map((l) => `'${sqlEscape(l.name)}'`).join(',');
  const defaultZodiacKeys = ALL_ZODIAC_SIGNS.map((z) => `'${sqlEscape(z.key)}'`).join(',');
  const defaultInterestNames = ALL_INTERESTS.map((i) => `'${sqlEscape(i.name)}'`).join(',');

  return `-- ============================================================================
-- TAXONOMY SEED DATA (generated from src/utils/taxonomies.ts)
-- Prefer pushing via Admin "Push All Data" or running /supabase_schema.sql seeds.
-- ============================================================================

-- 1. Seed All Worldwide Countries
INSERT INTO public.country_configs (code, name, flag, region, is_tier1, enabled) VALUES
${countryValues}
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    flag = EXCLUDED.flag,
    region = EXCLUDED.region,
    is_tier1 = EXCLUDED.is_tier1;

-- 2. Seed All Spoken Languages
INSERT INTO public.language_configs (code, name, native_name, popular, region, enabled) VALUES
${langValues}
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    native_name = EXCLUDED.native_name,
    popular = EXCLUDED.popular,
    region = EXCLUDED.region;

-- 3. Seed All 12 Astrological Zodiac Signs
INSERT INTO public.zodiac_configs (key, name, symbol, date_range, element, enabled) VALUES
${zodiacValues}
ON CONFLICT (key) DO UPDATE SET
    name = EXCLUDED.name,
    symbol = EXCLUDED.symbol,
    date_range = EXCLUDED.date_range,
    element = EXCLUDED.element;

-- 4. Seed All Categorized Interests & Passions
INSERT INTO public.interest_configs (id, name, category, icon_name, color, popular, enabled) VALUES
${interestValues}
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    icon_name = EXCLUDED.icon_name,
    color = EXCLUDED.color,
    popular = EXCLUDED.popular;

-- 4b. Seed store display currencies
INSERT INTO public.currency_configs (code, name, symbol, rate_from_usd, enabled, order_num) VALUES
${currencyValues}
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    symbol = EXCLUDED.symbol,
    order_num = EXCLUDED.order_num;

-- 5. Ensure default system_configs row exists with taxonomy allow-lists
INSERT INTO public.system_configs (
    id,
    allowed_country_codes,
    allowed_languages,
    allowed_zodiac_signs,
    allowed_interests
) VALUES (
    'default',
    ARRAY[${defaultCountryCodes}],
    ARRAY[${defaultLanguageNames}],
    ARRAY[${defaultZodiacKeys}],
    ARRAY[${defaultInterestNames}]
)
ON CONFLICT (id) DO UPDATE SET
    allowed_country_codes = EXCLUDED.allowed_country_codes,
    allowed_languages = EXCLUDED.allowed_languages,
    allowed_zodiac_signs = EXCLUDED.allowed_zodiac_signs,
    allowed_interests = EXCLUDED.allowed_interests,
    updated_at = now();
`;
}

/**
 * @deprecated Canonical DDL lives in /supabase_schema.sql only.
 * Browser clients must load schema via GET /api/admin/schema.
 * Returns empty string on the client to avoid embedding duplicate SQL.
 */
export function getMasterSchemaSql(): string {
  return '';
}

/**
 * @deprecated Canonical DDL lives in /supabase_schema.sql only.
 * Browser clients must load schema via GET /api/admin/schema.
 * Returns empty string on the client to avoid embedding duplicate SQL.
 */
export function getMigrationSchemaSql(): string {
  return '';
}
