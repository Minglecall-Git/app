/**
 * Production password policy — shared by React forms and Express auth routes.
 * Keep this module free of React / DOM / Node-only APIs so both sides can import it.
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

export type PasswordStrengthLabel = 'Weak' | 'Fair' | 'Good' | 'Strong';

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3;
  label: PasswordStrengthLabel;
  /** Tailwind-friendly color token for the meter / label */
  colorClass: string;
  /** Solid bar fill class */
  barClass: string;
  /** 0–100 width for the strength bar */
  percent: number;
  rules: PasswordRuleResult[];
  /** True when every minimum policy rule is satisfied */
  isValid: boolean;
  /** First failing rule message, or null when valid */
  error: string | null;
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

/**
 * Score strength for the meter. Policy validity is separate from score:
 * a password can show progress while still failing a required rule.
 */
export function scorePasswordStrength(password: string, rules: PasswordRuleResult[]): {
  score: 0 | 1 | 2 | 3;
  label: PasswordStrengthLabel;
  colorClass: string;
  barClass: string;
  percent: number;
} {
  const value = typeof password === 'string' ? password : '';
  const map: Record<
    0 | 1 | 2 | 3,
    { label: PasswordStrengthLabel; colorClass: string; barClass: string; percent: number }
  > = {
    0: { label: 'Weak', colorClass: 'text-rose-400', barClass: 'bg-rose-500', percent: value ? 25 : 0 },
    1: { label: 'Fair', colorClass: 'text-orange-400', barClass: 'bg-orange-500', percent: 50 },
    2: { label: 'Good', colorClass: 'text-amber-300', barClass: 'bg-amber-400', percent: 75 },
    3: { label: 'Strong', colorClass: 'text-emerald-400', barClass: 'bg-emerald-500', percent: 100 },
  };

  if (!value) return { score: 0, ...map[0] };

  const metCount = rules.filter((r) => r.met).length;
  const allRequired = rules.every((r) => r.met);

  let score: 0 | 1 | 2 | 3;
  if (!allRequired) {
    score = metCount <= 3 ? 0 : 1;
  } else if (value.length >= PASSWORD_STRONG_LENGTH) {
    score = 3;
  } else if (value.length >= 10) {
    score = 2;
  } else {
    score = 1;
  }

  return { score, ...map[score] };
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const rules = evaluatePasswordRules(password);
  const scored = scorePasswordStrength(password, rules);
  const isValid = rules.every((r) => r.met);
  const firstFail = rules.find((r) => !r.met);

  return {
    ...scored,
    rules,
    isValid,
    error: isValid
      ? null
      : firstFail
        ? `Password requirement not met: ${firstFail.label.toLowerCase()}.`
        : 'Password does not meet security requirements.',
  };
}

/** Backend / form guard — returns null when valid. */
export function getPasswordPolicyError(password: unknown): string | null {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Password is required.';
  }
  return evaluatePasswordStrength(password).error;
}

export function isPasswordPolicyValid(password: unknown): boolean {
  return getPasswordPolicyError(password) === null;
}
