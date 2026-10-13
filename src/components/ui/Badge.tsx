import React from 'react';

type BadgeTone = 'brand' | 'neutral' | 'success' | 'warning' | 'online' | 'friendRate' | 'skuTag';

export interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
  style?: React.CSSProperties;
}

const toneClasses: Record<BadgeTone, string> = {
  brand: 'bg-brand-soft text-brand border-brand/25',
  neutral: 'bg-app-card-subtle text-app-muted border-app',
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  warning: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  online: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
  friendRate: 'glass-pill text-white text-[10px] font-ticker font-medium',
  skuTag: 'bg-coin text-slate-950 border-transparent font-display font-bold uppercase tracking-wide text-[9px]',
};

export const Badge: React.FC<BadgeProps> = ({ children, tone = 'neutral', className = '', style }) => {
  return (
    <span
      style={style}
      className={[
        'inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md border',
        toneClasses[tone],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {tone === 'online' ? <span className="online-dot" /> : null}
      {children}
    </span>
  );
};
