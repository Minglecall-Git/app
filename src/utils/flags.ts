// Country Code & Language Flag Helpers

export const COUNTRY_FLAGS: Record<string, string> = {
  US: '🇺🇸',
  USA: '🇺🇸',
  ES: '🇪🇸',
  JP: '🇯🇵',
  BR: '🇧🇷',
  FR: '🇫🇷',
  GB: '🇬🇧',
  UK: '🇬🇧',
  DE: '🇩🇪',
  KR: '🇰🇷',
  CA: '🇨🇦',
  IN: '🇮🇳',
  MX: '🇲🇽',
  IT: '🇮🇹',
  AU: '🇦🇺',
  CO: '🇨🇴',
  AR: '🇦🇷',
  TH: '🇹🇭',
  PH: '🇵🇭',
  VN: '🇻🇳',
  ID: '🇮🇩',
  RU: '🇷🇺',
  TR: '🇹🇷',
  SA: '🇸🇦',
  AE: '🇦🇪',
  EG: '🇪🇬',
  ZA: '🇿🇦',
  NG: '🇳🇬',
};

export const getCountryFlag = (countryCode?: string, nationality?: string): string => {
  if (countryCode && COUNTRY_FLAGS[countryCode.toUpperCase()]) {
    return COUNTRY_FLAGS[countryCode.toUpperCase()];
  }
  if (nationality) {
    const nat = nationality.toLowerCase();
    if (nat.includes('united states') || nat.includes('american') || nat.includes('usa')) return '🇺🇸';
    if (nat.includes('spain') || nat.includes('spanish')) return '🇪🇸';
    if (nat.includes('japan') || nat.includes('japanese')) return '🇯🇵';
    if (nat.includes('brazil') || nat.includes('brazilian')) return '🇧🇷';
    if (nat.includes('france') || nat.includes('french')) return '🇫🇷';
    if (nat.includes('united kingdom') || nat.includes('british') || nat.includes('uk')) return '🇬🇧';
    if (nat.includes('germany') || nat.includes('german')) return '🇩🇪';
    if (nat.includes('korea') || nat.includes('korean')) return '🇰🇷';
    if (nat.includes('canada') || nat.includes('canadian')) return '🇨🇦';
    if (nat.includes('india') || nat.includes('indian')) return '🇮🇳';
    if (nat.includes('mexico') || nat.includes('mexican')) return '🇲🇽';
    if (nat.includes('italy') || nat.includes('italian')) return '🇮🇹';
    if (nat.includes('australia') || nat.includes('australian')) return '🇦🇺';
    if (nat.includes('colombia') || nat.includes('colombian')) return '🇨🇴';
  }
  if (countryCode && countryCode.length === 2) {
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map((char) => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  }
  return '🌐';
};

export const getLanguageFlag = (language: string): string => {
  const l = language.toLowerCase();
  if (l.includes('english')) return '🇺🇸';
  if (l.includes('spanish')) return '🇪🇸';
  if (l.includes('japanese')) return '🇯🇵';
  if (l.includes('french')) return '🇫🇷';
  if (l.includes('portuguese')) return '🇧🇷';
  if (l.includes('german')) return '🇩🇪';
  if (l.includes('korean')) return '🇰🇷';
  if (l.includes('chinese')) return '🇨🇳';
  if (l.includes('italian')) return '🇮🇹';
  if (l.includes('hindi')) return '🇮🇳';
  if (l.includes('russian')) return '🇷🇺';
  if (l.includes('arabic')) return '🇸🇦';
  return '🌐';
};
