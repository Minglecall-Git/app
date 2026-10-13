import React from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'default' | 'brand' | 'muted';
}

const sizeMap = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
};

const toneMap = {
  default: 'bg-app-card border-app text-app-heading hover:bg-app-card-subtle',
  brand: 'bg-brand-soft border-brand/30 text-brand hover:bg-brand-muted',
  muted: 'bg-transparent border-transparent text-app-muted hover:text-app-heading hover:bg-brand-soft',
};

export const IconButton: React.FC<IconButtonProps> = ({
  label,
  size = 'md',
  tone = 'default',
  className = '',
  children,
  ...rest
}) => {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={[
        'inline-flex items-center justify-center rounded-full border transition-colors cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed active:scale-95',
        sizeMap[size],
        toneMap[tone],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
};
