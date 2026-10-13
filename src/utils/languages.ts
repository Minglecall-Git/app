// Worldwide Spoken Languages Directory

export interface LanguageItem {
  code: string;
  name: string;
  nativeName: string;
  popular?: boolean;
}

export const ALL_WORLDWIDE_LANGUAGES: LanguageItem[] = [
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans' },
  { code: 'sq', name: 'Albanian', nativeName: 'Shqip' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', popular: true },
  { code: 'hy', name: 'Armenian', nativeName: 'Հայերեն' },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycan' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български' },
  { code: 'zh-yue', name: 'Chinese (Cantonese)', nativeName: '粵語', popular: true },
  { code: 'zh', name: 'Chinese (Mandarin)', nativeName: '中文 (普通话)', popular: true },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'en', name: 'English', nativeName: 'English', popular: true },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
  { code: 'fr', name: 'French', nativeName: 'Français', popular: true },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', popular: true },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'ha', name: 'Hausa', nativeName: 'Harshen Hausa' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', popular: true },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar' },
  { code: 'ig', name: 'Igbo', nativeName: 'Asụsụ Igbo' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', popular: true },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', popular: true },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', popular: true },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'kk', name: 'Kazakh', nativeName: 'Қазақша' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', popular: true },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu' },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', popular: true },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk' },
  { code: 'ps', name: 'Pashto', nativeName: 'پښتو' },
  { code: 'fa', name: 'Persian (Farsi)', nativeName: 'فارسی' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', popular: true },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ / پنجابی' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', popular: true },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски' },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' },
  { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', popular: true },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
  { code: 'tl', name: 'Tagalog (Filipino)', nativeName: 'Tagalog', popular: true },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', popular: true },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', popular: true },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', popular: true },
  { code: 'uz', name: 'Uzbek', nativeName: 'Oʻzbek' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', popular: true },
  { code: 'yo', name: 'Yoruba', nativeName: 'Èdè Yorùbá' },
  { code: 'zu', name: 'Zulu', nativeName: 'isiZulu' },
];

export function getLanguageName(code: string): string {
  const found = ALL_WORLDWIDE_LANGUAGES.find(
    (l) => l.code.toLowerCase() === code.toLowerCase() || l.name.toLowerCase() === code.toLowerCase()
  );
  return found ? found.name : code;
}
