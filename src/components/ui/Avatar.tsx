import React from 'react';

export interface AvatarProps {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8 text-[10px]',
  md: 'w-10 h-10 text-xs',
  lg: 'w-14 h-14 text-sm',
  xl: 'w-20 h-20 text-base',
};

const onlineDot = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
  xl: 'w-3.5 h-3.5',
};

function initials(name?: string) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt,
  name,
  size = 'md',
  online,
  className = '',
}) => {
  return (
    <div className={['relative inline-flex shrink-0', className].filter(Boolean).join(' ')}>
      {src ? (
        <img
          src={src}
          alt={alt || name || 'Avatar'}
          className={`${sizeClasses[size]} rounded-full object-cover border border-app bg-app-card-subtle`}
        />
      ) : (
        <div
          className={`${sizeClasses[size]} rounded-full border border-app bg-brand-soft text-brand font-bold flex items-center justify-center`}
        >
          {initials(name)}
        </div>
      )}
      {online ? (
        <span
          className={`absolute bottom-0 right-0 ${onlineDot[size]} rounded-full bg-emerald-400 border-2 border-[var(--app-bg)]`}
        />
      ) : null}
    </div>
  );
};
