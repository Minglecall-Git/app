import React from 'react';

type ButtonVariant = 'primary' | 'flirt' | 'coin' | 'glass' | 'secondary' | 'ghost' | 'danger' | 'soft';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:brightness-110 shadow-brand border border-transparent',
  flirt: 'bg-flirt text-white hover:brightness-110 shadow-brand border border-transparent',
  coin: 'bg-coin text-slate-950 hover:brightness-110 shadow-app-sm border border-transparent font-display',
  glass:
    'glass-pill text-white hover:bg-white/15 border border-white/15',
  secondary:
    'bg-app-card text-app-heading border border-app hover:bg-app-card-subtle',
  ghost:
    'bg-transparent text-app-muted hover:text-app-heading hover:bg-brand-soft border border-transparent',
  danger:
    'bg-[#E11D48]/90 text-white hover:bg-[#F43F5E] border border-transparent',
  soft:
    'bg-brand-soft text-brand border border-brand/30 hover:bg-brand-muted',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-xs gap-1.5 rounded-[var(--radius-sm)]',
  md: 'h-11 px-4 text-sm gap-2 rounded-app',
  lg: 'h-12 px-5 text-sm gap-2 rounded-app-lg font-semibold',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'flirt',
  size = 'md',
  fullWidth,
  loading,
  className = '',
  disabled,
  children,
  ...rest
}) => {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center font-semibold transition-all duration-200 cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : null}
      {children}
    </button>
  );
};
