import { CountryItem, ALL_WORLDWIDE_COUNTRIES } from './countries';
import { LanguageItem, ZodiacItem, InterestItem, InterestCategory } from '../types';

export { ALL_WORLDWIDE_COUNTRIES };
export type { CountryItem };

// Re-export countries helpers
export { getAllowedCountries, findCountryByCodeOrName } from './countries';

// ============================================================================
// 1. ALL WORLDWIDE LANGUAGES
// ============================================================================
export const ALL_LANGUAGES: LanguageItem[] = [
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans', region: 'Africa' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ', region: 'Africa' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', popular: true, region: 'Middle East & North Africa' },
  { code: 'hy', name: 'Armenian', nativeName: 'Հայերեն', region: 'Caucasus' },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycan', region: 'Central Asia' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', region: 'South Asia' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български', region: 'Europe' },
  { code: 'zh-yue', name: 'Chinese (Cantonese)', nativeName: '粵語', popular: true, region: 'East Asia' },
  { code: 'zh', name: 'Chinese (Mandarin)', nativeName: '中文 (普通话)', popular: true, region: 'East Asia' },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski', region: 'Europe' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština', region: 'Europe' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk', region: 'Europe' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', region: 'Europe' },
  { code: 'en', name: 'English', nativeName: 'English', popular: true, region: 'Global' },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti', region: 'Europe' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', region: 'Europe' },
  { code: 'fr', name: 'French', nativeName: 'Français', popular: true, region: 'Europe & Africa' },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული', region: 'Caucasus' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', popular: true, region: 'Europe' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', region: 'Europe' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', region: 'South Asia' },
  { code: 'ha', name: 'Hausa', nativeName: 'Harshen Hausa', region: 'Africa' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', region: 'Middle East' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', popular: true, region: 'South Asia' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', region: 'Europe' },
  { code: 'ig', name: 'Igbo', nativeName: 'Asụsụ Igbo', region: 'Africa' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', popular: true, region: 'Southeast Asia' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', popular: true, region: 'Europe' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', popular: true, region: 'East Asia' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', region: 'South Asia' },
  { code: 'kk', name: 'Kazakh', nativeName: 'Қазақша', region: 'Central Asia' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', popular: true, region: 'East Asia' },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu', region: 'Europe' },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių', region: 'Europe' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', popular: true, region: 'Southeast Asia' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', region: 'South Asia' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', region: 'South Asia' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', region: 'South Asia' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk', region: 'Europe' },
  { code: 'ps', name: 'Pashto', nativeName: 'پښتو', region: 'South Asia' },
  { code: 'fa', name: 'Persian (Farsi)', nativeName: 'فارسی', region: 'Middle East' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', region: 'Europe' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', popular: true, region: 'Europe & Americas' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', region: 'South Asia' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', region: 'Europe' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', popular: true, region: 'Eurasia' },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски', region: 'Europe' },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල', region: 'South Asia' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', region: 'Europe' },
  { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina', region: 'Europe' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', popular: true, region: 'Europe & Americas' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', region: 'Africa' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', region: 'Europe' },
  { code: 'tl', name: 'Tagalog (Filipino)', nativeName: 'Tagalog', popular: true, region: 'Southeast Asia' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', region: 'South Asia' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', region: 'South Asia' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', popular: true, region: 'Southeast Asia' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', popular: true, region: 'Middle East & Europe' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', region: 'Europe' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', popular: true, region: 'South Asia' },
  { code: 'uz', name: 'Uzbek', nativeName: 'Oʻzbek', region: 'Central Asia' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', popular: true, region: 'Southeast Asia' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Èdè Yorùbá', region: 'Africa' },
  { code: 'zu', name: 'Zulu', nativeName: 'isiZulu', region: 'Africa' },
];

export function getAllowedLanguages(allowedCodesOrNames?: string[]): LanguageItem[] {
  let list = ALL_LANGUAGES;
  if (allowedCodesOrNames && allowedCodesOrNames.length > 0) {
    const allowedSet = new Set(allowedCodesOrNames.map((s) => s.trim().toLowerCase()));
    list = ALL_LANGUAGES.filter(
      (l) => allowedSet.has(l.code.toLowerCase()) || allowedSet.has(l.name.toLowerCase())
    );
  }
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

export function findLanguageByCodeOrName(val?: string): LanguageItem | undefined {
  if (!val) return undefined;
  const clean = val.trim().toLowerCase();
  return ALL_LANGUAGES.find(
    (l) => l.code.toLowerCase() === clean || l.name.toLowerCase() === clean || l.nativeName.toLowerCase() === clean
  );
}

// ============================================================================
// 2. ALL 12 ZODIAC SIGNS
// ============================================================================
export const ALL_ZODIAC_SIGNS: ZodiacItem[] = [
  {
    key: 'aries',
    name: 'Aries',
    symbol: '♈',
    dateRange: 'Mar 21 - Apr 19',
    element: 'fire',
    traits: ['Courageous', 'Passionate', 'Dynamic'],
  },
  {
    key: 'taurus',
    name: 'Taurus',
    symbol: '♉',
    dateRange: 'Apr 20 - May 20',
    element: 'earth',
    traits: ['Reliable', 'Patient', 'Devoted'],
  },
  {
    key: 'gemini',
    name: 'Gemini',
    symbol: '♊',
    dateRange: 'May 21 - Jun 20',
    element: 'air',
    traits: ['Adaptable', 'Curious', 'Affectionate'],
  },
  {
    key: 'cancer',
    name: 'Cancer',
    symbol: '♋',
    dateRange: 'Jun 21 - Jul 22',
    element: 'water',
    traits: ['Intuitive', 'Emotional', 'Protective'],
  },
  {
    key: 'leo',
    name: 'Leo',
    symbol: '♌',
    dateRange: 'Jul 23 - Aug 22',
    element: 'fire',
    traits: ['Creative', 'Generous', 'Warm-hearted'],
  },
  {
    key: 'virgo',
    name: 'Virgo',
    symbol: '♍',
    dateRange: 'Aug 23 - Sep 22',
    element: 'earth',
    traits: ['Analytical', 'Kind', 'Hardworking'],
  },
  {
    key: 'libra',
    name: 'Libra',
    symbol: '♎',
    dateRange: 'Sep 23 - Oct 22',
    element: 'air',
    traits: ['Diplomatic', 'Gracious', 'Social'],
  },
  {
    key: 'scorpio',
    name: 'Scorpio',
    symbol: '♏',
    dateRange: 'Oct 23 - Nov 21',
    element: 'water',
    traits: ['Resourceful', 'Powerful', 'Brave'],
  },
  {
    key: 'sagittarius',
    name: 'Sagittarius',
    symbol: '♐',
    dateRange: 'Nov 22 - Dec 21',
    element: 'fire',
    traits: ['Generous', 'Idealistic', 'Humorous'],
  },
  {
    key: 'capricorn',
    name: 'Capricorn',
    symbol: '♑',
    dateRange: 'Dec 22 - Jan 19',
    element: 'earth',
    traits: ['Responsible', 'Disciplined', 'Self-control'],
  },
  {
    key: 'aquarius',
    name: 'Aquarius',
    symbol: '♒',
    dateRange: 'Jan 20 - Feb 18',
    element: 'air',
    traits: ['Progressive', 'Original', 'Independent'],
  },
  {
    key: 'pisces',
    name: 'Pisces',
    symbol: '♓',
    dateRange: 'Feb 19 - Mar 20',
    element: 'water',
    traits: ['Compassionate', 'Artistic', 'Intuitive'],
  },
];

export function getAllowedZodiacs(allowedKeys?: string[]): ZodiacItem[] {
  if (!allowedKeys || allowedKeys.length === 0) {
    return ALL_ZODIAC_SIGNS;
  }
  const allowedSet = new Set(allowedKeys.map((k) => k.trim().toLowerCase()));
  return ALL_ZODIAC_SIGNS.filter(
    (z) => allowedSet.has(z.key.toLowerCase()) || allowedSet.has(z.name.toLowerCase())
  );
}

export function findZodiacByKeyOrName(val?: string): ZodiacItem | undefined {
  if (!val) return undefined;
  const clean = val.trim().toLowerCase();
  return ALL_ZODIAC_SIGNS.find(
    (z) => z.key.toLowerCase() === clean || z.name.toLowerCase() === clean || z.symbol === val.trim()
  );
}

// ============================================================================
// 3. CATEGORIZED INTERESTS & PASSIONS
// ============================================================================
export interface InterestCategoryInfo {
  key: InterestCategory;
  name: string;
  icon: string;
  description: string;
  badgeColor: string;
}

export const INTEREST_CATEGORIES: InterestCategoryInfo[] = [
  { key: 'lifestyle', name: 'Lifestyle & Vibe', icon: 'Sparkles', description: 'Daily routines, philosophy & living well', badgeColor: 'from-pink-500 to-rose-600' },
  { key: 'sports', name: 'Sports & Fitness', icon: 'Flame', description: 'Athletics, workouts & outdoor action', badgeColor: 'from-amber-500 to-orange-600' },
  { key: 'music', name: 'Music & Audio', icon: 'Headphones', description: 'Concerts, genres & producing', badgeColor: 'from-purple-500 to-indigo-600' },
  { key: 'art', name: 'Art & Creativity', icon: 'Palette', description: 'Design, fashion, crafts & cinema', badgeColor: 'from-teal-500 to-emerald-600' },
  { key: 'tech', name: 'Tech & Gaming', icon: 'Gamepad2', description: 'Video games, coding, AI & gadgets', badgeColor: 'from-blue-500 to-cyan-600' },
  { key: 'food', name: 'Food & Drinks', icon: 'Coffee', description: 'Culinary adventures, cafes & wine', badgeColor: 'from-yellow-500 to-amber-600' },
  { key: 'wellness', name: 'Wellness & Mind', icon: 'HeartPulse', description: 'Yoga, mindfulness & self-growth', badgeColor: 'from-emerald-500 to-teal-600' },
  { key: 'social', name: 'Social & Nightlife', icon: 'Users', description: 'Parties, conversations & traveling', badgeColor: 'from-violet-500 to-purple-600' },
];

export const ALL_INTERESTS: InterestItem[] = [
  // Lifestyle
  { id: 'travel', name: 'Travel & Adventure', category: 'lifestyle', iconName: 'Compass', color: '#38bdf8', popular: true },
  { id: 'photography', name: 'Photography & Stories', category: 'lifestyle', iconName: 'Camera', color: '#f472b6', popular: true },
  { id: 'fashion', name: 'Fashion & Style', category: 'lifestyle', iconName: 'Shirt', color: '#ec4899', popular: true },
  { id: 'pets', name: 'Dogs & Cat Lovers', category: 'lifestyle', iconName: 'PawPrint', color: '#fb923c' },
  { id: 'nature', name: 'Nature & Camping', category: 'lifestyle', iconName: 'Trees', color: '#4ade80' },
  { id: 'roadtrips', name: 'Road Trips', category: 'lifestyle', iconName: 'Car', color: '#60a5fa' },

  // Sports & Fitness
  { id: 'fitness', name: 'Fitness & Gym', category: 'sports', iconName: 'Dumbbell', color: '#f97316', popular: true },
  { id: 'running', name: 'Running & Marathons', category: 'sports', iconName: 'Activity', color: '#ef4444' },
  { id: 'swimming', name: 'Swimming & Beach', category: 'sports', iconName: 'Waves', color: '#06b6d4' },
  { id: 'cycling', name: 'Cycling & Biking', category: 'sports', iconName: 'Bike', color: '#84cc16' },
  { id: 'football', name: 'Soccer & Football', category: 'sports', iconName: 'Trophy', color: '#22c55e' },
  { id: 'basketball', name: 'Basketball', category: 'sports', iconName: 'Target', color: '#f59e0b' },
  { id: 'martial_arts', name: 'Martial Arts & Boxing', category: 'sports', iconName: 'Shield', color: '#dc2626' },

  // Music & Audio
  { id: 'music_concerts', name: 'Music & Concerts', category: 'music', iconName: 'Music', color: '#a855f7', popular: true },
  { id: 'karaoke', name: 'Singing & Karaoke', category: 'music', iconName: 'Mic', color: '#d946ef', popular: true },
  { id: 'dj_edm', name: 'DJing & EDM Festivals', category: 'music', iconName: 'Radio', color: '#8b5cf6' },
  { id: 'rock_metal', name: 'Rock & Indie Bands', category: 'music', iconName: 'Guitar', color: '#6366f1' },
  { id: 'hiphop_rnb', name: 'Hip-Hop & R&B', category: 'music', iconName: 'Disc', color: '#ec4899' },
  { id: 'classical', name: 'Classical & Jazz', category: 'music', iconName: 'Piano', color: '#3b82f6' },

  // Art & Creativity
  { id: 'art_design', name: 'Art & Design', category: 'art', iconName: 'Palette', color: '#14b8a6', popular: true },
  { id: 'movies_cinema', name: 'Movies & Cinema', category: 'art', iconName: 'Film', color: '#0ea5e9', popular: true },
  { id: 'anime_manga', name: 'Anime & Manga', category: 'art', iconName: 'Sparkles', color: '#f43f5e', popular: true },
  { id: 'dancing', name: 'Dancing & Choreography', category: 'art', iconName: 'Footprints', color: '#e11d48' },
  { id: 'writing_poetry', name: 'Writing & Books', category: 'art', iconName: 'BookOpen', color: '#10b981' },
  { id: 'cosplay', name: 'Cosplay & Conventions', category: 'art', iconName: 'Mask', color: '#a21caf' },

  // Tech & Gaming
  { id: 'gaming', name: 'Gaming & Esports', category: 'tech', iconName: 'Gamepad2', color: '#3b82f6', popular: true },
  { id: 'streaming', name: 'Live Streaming & Twitch', category: 'tech', iconName: 'Tv', color: '#9333ea', popular: true },
  { id: 'tech_coding', name: 'Tech & Programming', category: 'tech', iconName: 'Code', color: '#0284c7' },
  { id: 'crypto_web3', name: 'Crypto & Investing', category: 'tech', iconName: 'Coins', color: '#eab308' },
  { id: 'ai_future', name: 'AI & Gadgets', category: 'tech', iconName: 'Cpu', color: '#6366f1' },
  { id: 'board_games', name: 'Board Games & Trivia', category: 'tech', iconName: 'Dice', color: '#f59e0b' },

  // Food & Drinks
  { id: 'cooking', name: 'Cooking & Foodie', category: 'food', iconName: 'Utensils', color: '#f97316', popular: true },
  { id: 'coffee_cafes', name: 'Coffee & Cozy Cafes', category: 'food', iconName: 'Coffee', color: '#b45309', popular: true },
  { id: 'baking', name: 'Baking & Desserts', category: 'food', iconName: 'Cake', color: '#f472b6' },
  { id: 'wine_cocktails', name: 'Wine Tasting & Cocktails', category: 'food', iconName: 'Wine', color: '#be123c' },
  { id: 'street_food', name: 'Street Food Exploring', category: 'food', iconName: 'Pizza', color: '#ea580c' },

  // Wellness & Mind
  { id: 'yoga_meditation', name: 'Yoga & Meditation', category: 'wellness', iconName: 'Smile', color: '#10b981', popular: true },
  { id: 'mental_health', name: 'Mindfulness & Growth', category: 'wellness', iconName: 'Heart', color: '#ec4899' },
  { id: 'spa_skincare', name: 'Skincare & Self-Care', category: 'wellness', iconName: 'Flower', color: '#f43f5e' },
  { id: 'astrology', name: 'Astrology & Crystals', category: 'wellness', iconName: 'Moon', color: '#8b5cf6' },

  // Social & Nightlife
  { id: 'late_night_chats', name: 'Late Night Talks', category: 'social', iconName: 'MessageCircle', color: '#6366f1', popular: true },
  { id: 'nightlife_dining', name: 'Nightlife & Lounges', category: 'social', iconName: 'PartyPopper', color: '#d946ef', popular: true },
  { id: 'language_exchange', name: 'Language Exchange', category: 'social', iconName: 'Globe', color: '#06b6d4', popular: true },
  { id: 'volunteering', name: 'Volunteering & Causes', category: 'social', iconName: 'HeartHandshake', color: '#10b981' },
];

export function getAllowedInterests(allowedIdsOrNames?: string[]): InterestItem[] {
  if (!allowedIdsOrNames || allowedIdsOrNames.length === 0) {
    return ALL_INTERESTS;
  }
  const allowedSet = new Set(allowedIdsOrNames.map((s) => s.trim().toLowerCase()));
  return ALL_INTERESTS.filter(
    (i) => allowedSet.has(i.id.toLowerCase()) || allowedSet.has(i.name.toLowerCase())
  );
}

export function findInterestByIdOrName(val?: string): InterestItem | undefined {
  if (!val) return undefined;
  const clean = val.trim().toLowerCase();
  return ALL_INTERESTS.find(
    (i) => i.id.toLowerCase() === clean || i.name.toLowerCase() === clean
  );
}

// ============================================================================
// 5. STORE DISPLAY CURRENCIES (canonical package prices remain USD)
// rateFromUsd = local currency units per 1 USD (admin-editable placeholders)
// ============================================================================

export interface CurrencyItem {
  code: string;
  name: string;
  symbol: string;
  /** Local units per 1 USD */
  rateFromUsd: number;
  enabled: boolean;
  orderNum?: number;
}

/** Default / fallback catalogue — also used when DB is empty. */
export const DEFAULT_CURRENCIES: CurrencyItem[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', rateFromUsd: 1, enabled: true, orderNum: 0 },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', rateFromUsd: 3.6725, enabled: true, orderNum: 1 },
  { code: 'EUR', name: 'Euro', symbol: '€', rateFromUsd: 0.92, enabled: true, orderNum: 2 },
  { code: 'GBP', name: 'British Pound', symbol: '£', rateFromUsd: 0.79, enabled: true, orderNum: 3 },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', rateFromUsd: 3.75, enabled: true, orderNum: 4 },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: 'Rs', rateFromUsd: 278, enabled: true, orderNum: 5 },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', rateFromUsd: 83, enabled: true, orderNum: 6 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', rateFromUsd: 1.36, enabled: true, orderNum: 7 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', rateFromUsd: 1.52, enabled: true, orderNum: 8 },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺', rateFromUsd: 32, enabled: true, orderNum: 9 },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£', rateFromUsd: 48, enabled: true, orderNum: 10 },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', rateFromUsd: 5.0, enabled: true, orderNum: 11 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', rateFromUsd: 150, enabled: true, orderNum: 12 },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', rateFromUsd: 7.2, enabled: false, orderNum: 13 },
];

export const USD_CURRENCY: CurrencyItem = DEFAULT_CURRENCIES[0];

/**
 * Enabled currencies for the customer store dropdown.
 * Falls back to USD if the list is empty/missing.
 */
export function getEnabledCurrencies(list?: CurrencyItem[] | null): CurrencyItem[] {
  const source = list && list.length > 0 ? list : DEFAULT_CURRENCIES;
  const enabled = source
    .filter((c) => c && c.enabled !== false && Number(c.rateFromUsd) > 0)
    .slice()
    .sort(
      (a, b) =>
        (Number(a.orderNum) || 0) - (Number(b.orderNum) || 0) ||
        String(a.code).localeCompare(String(b.code))
    );
  if (enabled.length === 0) return [{ ...USD_CURRENCY }];
  return enabled;
}

export function findCurrencyByCode(
  code?: string | null,
  list?: CurrencyItem[] | null
): CurrencyItem {
  const source = list && list.length > 0 ? list : DEFAULT_CURRENCIES;
  const clean = String(code || 'USD').trim().toUpperCase();
  const found = source.find((c) => String(c.code).toUpperCase() === clean);
  if (found && Number(found.rateFromUsd) > 0) return found;
  return { ...USD_CURRENCY };
}

