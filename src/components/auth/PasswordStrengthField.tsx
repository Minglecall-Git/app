import React, { useEffect, useId, useMemo, useState } from 'react';
import { Check, Eye, EyeOff, KeyRound, X } from 'lucide-react';
import {
  evaluatePasswordStrength,
  PASSWORD_MIN_LENGTH,
  PASSWORD_STRONG_LENGTH,
  type PasswordStrengthResult,
} from '../../../shared/passwordPolicy';

export interface PasswordStrengthFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
  /** Show meter + rule checklist (register / reset). Default true. */
  showStrengthUi?: boolean;
  /** Optional confirm-match helper when this field is the confirm input */
  matchAgainst?: string;
  showMatchStatus?: boolean;
  className?: string;
  inputClassName?: string;
  onValidityChange?: (isValid: boolean, result: PasswordStrengthResult) => void;
}

export function PasswordStrengthField({
  id,
  label = 'Password',
  value,
  onChange,
  placeholder = `At least ${PASSWORD_MIN_LENGTH} characters`,
  autoComplete = 'new-password',
  required = true,
  disabled = false,
  showStrengthUi = true,
  matchAgainst,
  showMatchStatus = false,
  className = '',
  inputClassName = '',
  onValidityChange,
}: PasswordStrengthFieldProps) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const checklistId = `${fieldId}-checklist`;
  const meterId = `${fieldId}-meter`;
  const [visible, setVisible] = useState(false);

  const strength = useMemo(() => evaluatePasswordStrength(value), [value]);
  const unmetRules = useMemo(
    () => (value.length > 0 ? strength.rules.filter((rule) => !rule.met) : []),
    [strength.rules, value.length]
  );

  useEffect(() => {
    onValidityChange?.(strength.isValid, strength);
    // Intentionally omit onValidityChange from deps to avoid parent re-render loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strength.isValid, strength.label, strength.error, value]);

  const passwordsMatch =
    typeof matchAgainst === 'string' && matchAgainst.length > 0 && matchAgainst === value;

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={fieldId}
          className="block text-xs font-semibold text-slate-300 uppercase font-mono tracking-wider mb-1"
        >
          {label}
          {required ? ' *' : ''}
        </label>
      )}

      <div className="relative">
        <KeyRound
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none"
          aria-hidden
        />
        <input
          id={fieldId}
          type={visible ? 'text' : 'password'}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-invalid={showStrengthUi && value.length > 0 ? !strength.isValid : undefined}
          aria-describedby={
            showStrengthUi
              ? [meterId, unmetRules.length > 0 ? checklistId : null].filter(Boolean).join(' ') || undefined
              : undefined
          }
          className={
            inputClassName ||
            'w-full bg-app-input border border-hairline rounded-xl pl-10 pr-10 py-2.5 text-xs text-app-heading placeholder:text-app-muted focus:outline-none focus:border-rose-500 disabled:opacity-50'
          }
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-app-muted hover:text-app-heading transition-colors"
          title={visible ? 'Hide password' : 'Show password'}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      {showStrengthUi && (
        <div className="mt-2.5 space-y-2" id={meterId}>
          {value.length > 0 && (
            <>
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-slate-400">Password strength</span>
                <span className={`font-bold ${strength.colorClass}`} aria-live="polite">
                  {strength.label}
                </span>
              </div>
              <div
                className="w-full h-1.5 bg-app-input rounded-full overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={strength.percent}
                aria-label={`Password strength: ${strength.label}`}
              >
                <div
                  className={`h-full transition-all duration-300 ease-out ${strength.barClass}`}
                  style={{ width: `${strength.percent}%` }}
                />
              </div>
              {strength.isValid && strength.label !== 'Strong' && (
                <p className="text-[10px] text-slate-500 font-mono">
                  Tip: {PASSWORD_STRONG_LENGTH}+ characters reaches Strong.
                </p>
              )}
            </>
          )}
          {/* Only list unmet rules — hide satisfied requirements */}
          {unmetRules.length > 0 && (
            <ul id={checklistId} className="space-y-1 pt-0.5" aria-label="Unmet password requirements">
              {unmetRules.map((rule) => (
                <li
                  key={rule.id}
                  className="flex items-center gap-1.5 text-[10px] font-mono text-rose-400"
                >
                  <X className="w-3 h-3 shrink-0" aria-hidden />
                  <span>{rule.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showMatchStatus && typeof matchAgainst === 'string' && value.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] font-mono" aria-live="polite">
          {passwordsMatch ? (
            <span className="text-emerald-400 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              Passwords match
            </span>
          ) : (
            <span className="text-rose-400 flex items-center gap-1">
              <X className="w-3.5 h-3.5" />
              Passwords do not match
            </span>
          )}
        </div>
      )}
    </div>
  );
}
