// ISO 3166-1 Worldwide Countries Database with Flag Emojis and ISO-2 Codes

export interface CountryItem {
  name: string;
  code: string;
  flag: string;
  region: 'North America' | 'Europe' | 'Asia' | 'South America' | 'Africa' | 'Oceania' | 'Middle East' | 'Caribbean';
  isTier1?: boolean;
}

export const ALL_WORLDWIDE_COUNTRIES: CountryItem[] = [
  { name: 'Albania', code: 'AL', flag: '🇦🇱', region: 'Europe' },
  { name: 'Algeria', code: 'DZ', flag: '🇩🇿', region: 'Middle East' },
  { name: 'Argentina', code: 'AR', flag: '🇦🇷', region: 'South America' },
  { name: 'Armenia', code: 'AM', flag: '🇦🇲', region: 'Europe' },
  { name: 'Australia', code: 'AU', flag: '🇦🇺', region: 'Oceania', isTier1: true },
  { name: 'Austria', code: 'AT', flag: '🇦🇹', region: 'Europe', isTier1: true },
  { name: 'Azerbaijan', code: 'AZ', flag: '🇦🇿', region: 'Europe' },
  { name: 'Bahrain', code: 'BH', flag: '🇧🇭', region: 'Middle East' },
  { name: 'Bangladesh', code: 'BD', flag: '🇧🇩', region: 'Asia' },
  { name: 'Belgium', code: 'BE', flag: '🇧🇪', region: 'Europe', isTier1: true },
  { name: 'Bolivia', code: 'BO', flag: '🇧🇴', region: 'South America' },
  { name: 'Bosnia and Herzegovina', code: 'BA', flag: '🇧🇦', region: 'Europe' },
  { name: 'Brazil', code: 'BR', flag: '🇧🇷', region: 'South America' },
  { name: 'Bulgaria', code: 'BG', flag: '🇧🇬', region: 'Europe' },
  { name: 'Cambodia', code: 'KH', flag: '🇰🇭', region: 'Asia' },
  { name: 'Cameroon', code: 'CM', flag: '🇨🇲', region: 'Africa' },
  { name: 'Canada', code: 'CA', flag: '🇨🇦', region: 'North America', isTier1: true },
  { name: 'Chile', code: 'CL', flag: '🇨🇱', region: 'South America' },
  { name: 'China', code: 'CN', flag: '🇨🇳', region: 'Asia' },
  { name: 'Colombia', code: 'CO', flag: '🇨🇴', region: 'South America' },
  { name: 'Costa Rica', code: 'CR', flag: '🇨🇷', region: 'North America' },
  { name: 'Croatia', code: 'HR', flag: '🇭🇷', region: 'Europe' },
  { name: 'Cyprus', code: 'CY', flag: '🇨🇾', region: 'Europe' },
  { name: 'Czech Republic', code: 'CZ', flag: '🇨🇿', region: 'Europe' },
  { name: 'Denmark', code: 'DK', flag: '🇩🇰', region: 'Europe', isTier1: true },
  { name: 'Dominican Republic', code: 'DO', flag: '🇩🇴', region: 'Caribbean' },
  { name: 'Ecuador', code: 'EC', flag: '🇪🇨', region: 'South America' },
  { name: 'Egypt', code: 'EG', flag: '🇪🇬', region: 'Middle East' },
  { name: 'El Salvador', code: 'SV', flag: '🇸🇻', region: 'North America' },
  { name: 'Estonia', code: 'EE', flag: '🇪🇪', region: 'Europe' },
  { name: 'Ethiopia', code: 'ET', flag: '🇪🇹', region: 'Africa' },
  { name: 'Fiji', code: 'FJ', flag: '🇫🇯', region: 'Oceania' },
  { name: 'Finland', code: 'FI', flag: '🇫🇮', region: 'Europe', isTier1: true },
  { name: 'France', code: 'FR', flag: '🇫🇷', region: 'Europe', isTier1: true },
  { name: 'Georgia', code: 'GE', flag: '🇬🇪', region: 'Europe' },
  { name: 'Germany', code: 'DE', flag: '🇩🇪', region: 'Europe', isTier1: true },
  { name: 'Ghana', code: 'GH', flag: '🇬🇭', region: 'Africa' },
  { name: 'Greece', code: 'GR', flag: '🇬🇷', region: 'Europe' },
  { name: 'Guatemala', code: 'GT', flag: '🇬🇹', region: 'North America' },
  { name: 'Honduras', code: 'HN', flag: '🇭🇳', region: 'North America' },
  { name: 'Hong Kong', code: 'HK', flag: '🇭🇰', region: 'Asia' },
  { name: 'Hungary', code: 'HU', flag: '🇭🇺', region: 'Europe' },
  { name: 'Iceland', code: 'IS', flag: '🇮🇸', region: 'Europe' },
  { name: 'India', code: 'IN', flag: '🇮🇳', region: 'Asia' },
  { name: 'Indonesia', code: 'ID', flag: '🇮🇩', region: 'Asia' },
  { name: 'Iraq', code: 'IQ', flag: '🇮🇶', region: 'Middle East' },
  { name: 'Ireland', code: 'IE', flag: '🇮🇪', region: 'Europe', isTier1: true },
  { name: 'Israel', code: 'IL', flag: '🇮🇱', region: 'Middle East' },
  { name: 'Italy', code: 'IT', flag: '🇮🇹', region: 'Europe', isTier1: true },
  { name: 'Ivory Coast', code: 'CI', flag: '🇨🇮', region: 'Africa' },
  { name: 'Jamaica', code: 'JM', flag: '🇯🇲', region: 'Caribbean' },
  { name: 'Japan', code: 'JP', flag: '🇯🇵', region: 'Asia', isTier1: true },
  { name: 'Jordan', code: 'JO', flag: '🇯🇴', region: 'Middle East' },
  { name: 'Kazakhstan', code: 'KZ', flag: '🇰🇿', region: 'Asia' },
  { name: 'Kenya', code: 'KE', flag: '🇰🇪', region: 'Africa' },
  { name: 'Kuwait', code: 'KW', flag: '🇰🇼', region: 'Middle East', isTier1: true },
  { name: 'Latvia', code: 'LV', flag: '🇱🇻', region: 'Europe' },
  { name: 'Lebanon', code: 'LB', flag: '🇱🇧', region: 'Middle East' },
  { name: 'Lithuania', code: 'LT', flag: '🇱🇹', region: 'Europe' },
  { name: 'Luxembourg', code: 'LU', flag: '🇱🇺', region: 'Europe' },
  { name: 'Malaysia', code: 'MY', flag: '🇲🇾', region: 'Asia' },
  { name: 'Malta', code: 'MT', flag: '🇲🇹', region: 'Europe' },
  { name: 'Mauritius', code: 'MU', flag: '🇲🇺', region: 'Africa' },
  { name: 'Mexico', code: 'MX', flag: '🇲🇽', region: 'North America' },
  { name: 'Moldova', code: 'MD', flag: '🇲🇩', region: 'Europe' },
  { name: 'Mongolia', code: 'MN', flag: '🇲🇳', region: 'Asia' },
  { name: 'Montenegro', code: 'ME', flag: '🇲🇪', region: 'Europe' },
  { name: 'Morocco', code: 'MA', flag: '🇲🇦', region: 'Middle East' },
  { name: 'Nepal', code: 'NP', flag: '🇳🇵', region: 'Asia' },
  { name: 'Netherlands', code: 'NL', flag: '🇳🇱', region: 'Europe', isTier1: true },
  { name: 'New Zealand', code: 'NZ', flag: '🇳🇿', region: 'Oceania', isTier1: true },
  { name: 'Nicaragua', code: 'NI', flag: '🇳🇮', region: 'North America' },
  { name: 'Nigeria', code: 'NG', flag: '🇳🇬', region: 'Africa' },
  { name: 'North Macedonia', code: 'MK', flag: '🇲🇰', region: 'Europe' },
  { name: 'Norway', code: 'NO', flag: '🇳🇴', region: 'Europe', isTier1: true },
  { name: 'Oman', code: 'OM', flag: '🇴🇲', region: 'Middle East' },
  { name: 'Pakistan', code: 'PK', flag: '🇵🇰', region: 'Asia' },
  { name: 'Panama', code: 'PA', flag: '🇵🇦', region: 'North America' },
  { name: 'Papua New Guinea', code: 'PG', flag: '🇵🇬', region: 'Oceania' },
  { name: 'Paraguay', code: 'PY', flag: '🇵🇾', region: 'South America' },
  { name: 'Peru', code: 'PE', flag: '🇵🇪', region: 'South America' },
  { name: 'Philippines', code: 'PH', flag: '🇵🇭', region: 'Asia' },
  { name: 'Poland', code: 'PL', flag: '🇵🇱', region: 'Europe' },
  { name: 'Portugal', code: 'PT', flag: '🇵🇹', region: 'Europe' },
  { name: 'Puerto Rico', code: 'PR', flag: '🇵🇷', region: 'Caribbean' },
  { name: 'Qatar', code: 'QA', flag: '🇶🇦', region: 'Middle East', isTier1: true },
  { name: 'Romania', code: 'RO', flag: '🇷🇴', region: 'Europe' },
  { name: 'Saudi Arabia', code: 'SA', flag: '🇸🇦', region: 'Middle East', isTier1: true },
  { name: 'Senegal', code: 'SN', flag: '🇸🇳', region: 'Africa' },
  { name: 'Serbia', code: 'RS', flag: '🇷🇸', region: 'Europe' },
  { name: 'Singapore', code: 'SG', flag: '🇸🇬', region: 'Asia', isTier1: true },
  { name: 'Slovakia', code: 'SK', flag: '🇸🇰', region: 'Europe' },
  { name: 'Slovenia', code: 'SI', flag: '🇸🇮', region: 'Europe' },
  { name: 'South Africa', code: 'ZA', flag: '🇿🇦', region: 'Africa' },
  { name: 'South Korea', code: 'KR', flag: '🇰🇷', region: 'Asia', isTier1: true },
  { name: 'Spain', code: 'ES', flag: '🇪🇸', region: 'Europe', isTier1: true },
  { name: 'Sri Lanka', code: 'LK', flag: '🇱🇰', region: 'Asia' },
  { name: 'Sweden', code: 'SE', flag: '🇸🇪', region: 'Europe', isTier1: true },
  { name: 'Switzerland', code: 'CH', flag: '🇨🇭', region: 'Europe', isTier1: true },
  { name: 'Taiwan', code: 'TW', flag: '🇹🇼', region: 'Asia' },
  { name: 'Tanzania', code: 'TZ', flag: '🇹🇿', region: 'Africa' },
  { name: 'Thailand', code: 'TH', flag: '🇹🇭', region: 'Asia' },
  { name: 'Trinidad and Tobago', code: 'TT', flag: '🇹🇹', region: 'Caribbean' },
  { name: 'Tunisia', code: 'TN', flag: '🇹🇳', region: 'Middle East' },
  { name: 'Turkey', code: 'TR', flag: '🇹🇷', region: 'Europe' },
  { name: 'Uganda', code: 'UG', flag: '🇺🇬', region: 'Africa' },
  { name: 'Ukraine', code: 'UA', flag: '🇺🇦', region: 'Europe' },
  { name: 'United Arab Emirates', code: 'AE', flag: '🇦🇪', region: 'Middle East', isTier1: true },
  { name: 'United Kingdom', code: 'GB', flag: '🇬🇧', region: 'Europe', isTier1: true },
  { name: 'United States', code: 'US', flag: '🇺🇸', region: 'North America', isTier1: true },
  { name: 'Uruguay', code: 'UY', flag: '🇺🇾', region: 'South America' },
  { name: 'Uzbekistan', code: 'UZ', flag: '🇺🇿', region: 'Asia' },
  { name: 'Venezuela', code: 'VE', flag: '🇻🇪', region: 'South America' },
  { name: 'Vietnam', code: 'VN', flag: '🇻🇳', region: 'Asia' },
  { name: 'Zimbabwe', code: 'ZW', flag: '🇿🇼', region: 'Africa' },
];

/**
 * Get active allowed countries based on admin settings, always sorted in ascending order (A to Z)
 * @param allowedCodes Optional array of enabled ISO country codes
 */
export function getAllowedCountries(allowedCodes?: string[]): CountryItem[] {
  let list = ALL_WORLDWIDE_COUNTRIES;
  if (allowedCodes && allowedCodes.length > 0) {
    const allowedSet = new Set(allowedCodes.map((c) => c.toUpperCase()));
    list = ALL_WORLDWIDE_COUNTRIES.filter((c) => allowedSet.has(c.code.toUpperCase()));
  }
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Find country item by name or ISO code
 */
export function findCountryByCodeOrName(val?: string): CountryItem | undefined {
  if (!val) return undefined;
  const clean = val.trim().toLowerCase();
  return ALL_WORLDWIDE_COUNTRIES.find(
    (c) => c.code.toLowerCase() === clean || c.name.toLowerCase() === clean
  );
}
