import React from 'react';

type SurfaceVariant = 'card' | 'subtle' | 'raised' | 'glass';

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const variantClasses: Record<SurfaceVariant, string> = {
  card: 'bg-app-card border border-app rounded-app-lg shadow-app-sm',
  subtle: 'bg-app-card-subtle border border-app rounded-app-lg',
  raised: 'bg-app-card border border-app rounded-app-xl shadow-app',
  glass: 'bg-app-surface/90 border border-app rounded-app-lg backdrop-blur-xl shadow-app-sm',
};

const padClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-6',
};

export const Surface: React.FC<SurfaceProps> = ({
  variant = 'card',
  padding = 'md',
  className = '',
  children,
  ...rest
}) => {
  return (
    <div
      className={[variantClasses[variant], padClasses[padding], className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
};
