/**
 * Password policy for Vercel API handlers — kept inside api/ so the serverless
 * bundle never needs to resolve ../../shared (outside the function root).
 * Keep in sync with shared/passwordPolicy.ts.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_STRONG_LENGTH = 12;
export const PASSWORD_SPECIAL_CHAR_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

export type PasswordRuleId =
  | 'minLength'
  | 'uppercase'
  | 'lowercase'
  | 'digit'
  | 'special'
  | 'noWeakPattern';

export interface PasswordRuleResult {
  id: PasswordRuleId;
  label: string;
  met: boolean;
}

const COMMON_WEAK_PASSWORDS = new Set(
  [
    'password',
    'password1',
    'password123',
    'passw0rd',
    '123456',
    '1234567',
    '12345678',
    '123456789',
    '1234567890',
    'qwerty',
    'qwerty123',
    'abc123',
    'abcdef',
    'letmein',
    'welcome',
    'admin',
    'admin123',
    'iloveyou',
    'monkey',
    'dragon',
    'master',
    'login',
    'princess',
    'football',
    'baseball',
    'sunshine',
    'shadow',
    'superman',
    'trustno1',
    'creator123',
    'admin@12345',
  ].map((p) => p.toLowerCase())
);

const KEYBOARD_SEQUENCES = [
  '0123456789',
  '9876543210',
  'abcdefghijklmnopqrstuvwxyz',
  'zyxwvutsrqponmlkjihgfedcba',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
];

function hasRepeatingChars(password: string): boolean {
  return /(.)\1{2,}/.test(password);
}

function hasSequentialChars(password: string, minRun = 4): boolean {
  const lower = password.toLowerCase();
  for (const seq of KEYBOARD_SEQUENCES) {
    for (let i = 0; i <= seq.length - minRun; i++) {
      const chunk = seq.slice(i, i + minRun);
      if (lower.includes(chunk)) return true;
    }
  }
  return false;
}

function hasWeakPattern(password: string): boolean {
  const trimmed = password.trim();
  if (!trimmed) return true;
  if (COMMON_WEAK_PASSWORDS.has(trimmed.toLowerCase())) return true;
  if (hasRepeatingChars(trimmed)) return true;
  if (hasSequentialChars(trimmed)) return true;
  return false;
}

export function evaluatePasswordRules(password: string): PasswordRuleResult[] {
  const value = typeof password === 'string' ? password : '';
  return [
    {
      id: 'minLength',
      label: `At least ${PASSWORD_MIN_LENGTH} characters`,
      met: value.length >= PASSWORD_MIN_LENGTH,
    },
    {
      id: 'uppercase',
      label: 'At least 1 uppercase letter (A–Z)',
      met: /[A-Z]/.test(value),
    },
    {
      id: 'lowercase',
      label: 'At least 1 lowercase letter (a–z)',
      met: /[a-z]/.test(value),
    },
    {
      id: 'digit',
      label: 'At least 1 number (0–9)',
      met: /[0-9]/.test(value),
    },
    {
      id: 'special',
      label: 'At least 1 special character (!@#$…)',
      met: PASSWORD_SPECIAL_CHAR_REGEX.test(value),
    },
    {
      id: 'noWeakPattern',
      label: 'No common or repeating patterns',
      met: value.length > 0 && !hasWeakPattern(value),
    },
  ];
}

/** Backend / form guard — returns null when valid. */
export function getPasswordPolicyError(password: unknown): string | null {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Password is required.';
  }
  const rules = evaluatePasswordRules(password);
  const firstFail = rules.find((r) => !r.met);
  if (!firstFail) return null;
  return `Password requirement not met: ${firstFail.label.toLowerCase()}.`;
}
