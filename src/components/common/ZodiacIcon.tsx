import React from 'react';
import { findZodiacByKeyOrName } from '../../utils/taxonomies';
import { ZodiacElement } from '../../types';

interface ZodiacIconProps {
  sign?: string; // e.g. 'aries', 'Aries', '♈', etc.
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showElementColor?: boolean;
  withBadge?: boolean;
  showLabel?: boolean;
}

const SIZE_MAP = {
  xs: 'w-3.5 h-3.5',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8',
};

// Element color schemes
const ELEMENT_COLORS: Record<ZodiacElement, { bg: string; text: string; stroke: string; gradient: string }> = {
  fire: {
    bg: 'bg-gradient-to-br from-rose-500/20 to-orange-500/20 border-orange-500/30',
    text: 'text-orange-400',
    stroke: '#f97316',
    gradient: 'from-amber-400 to-rose-500',
  },
  earth: {
    bg: 'bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border-emerald-500/30',
    text: 'text-emerald-400',
    stroke: '#10b981',
    gradient: 'from-emerald-400 to-teal-500',
  },
  air: {
    bg: 'bg-gradient-to-br from-cyan-500/20 to-sky-500/20 border-cyan-500/30',
    text: 'text-cyan-400',
    stroke: '#06b6d4',
    gradient: 'from-cyan-400 to-indigo-400',
  },
  water: {
    bg: 'bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border-indigo-500/30',
    text: 'text-indigo-400',
    stroke: '#818cf8',
    gradient: 'from-blue-400 to-purple-500',
  },
};

/**
 * Pure Vector SVG Astronomical Zodiac Glyph Renderer
 */
const ZodiacSvgGlyph: React.FC<{ signKey: string; stroke?: string; className?: string }> = ({
  signKey,
  stroke = 'currentColor',
  className = 'w-full h-full',
}) => {
  switch (signKey.toLowerCase()) {
    case 'aries':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M12 21V8" />
          <path d="M12 8C10.5 4 6 4 6 7c0 3.5 6 7 6 7" />
          <path d="M12 8c1.5-4 6-4 6-1 0 3.5-6 7-6 7" />
        </svg>
      );
    case 'taurus':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <circle cx="12" cy="14" r="6" />
          <path d="M6 4c0 4 3 7 6 7s6-3 6-7" />
        </svg>
      );
    case 'gemini':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M4 4c5 2 11 2 16 0" />
          <path d="M4 20c5-2 11-2 16 0" />
          <path d="M8 5v14" />
          <path d="M16 5v14" />
        </svg>
      );
    case 'cancer':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <circle cx="7" cy="9" r="3" />
          <circle cx="17" cy="15" r="3" />
          <path d="M10 9c0-3 3-5 7-5 2 0 4 1 4 3" />
          <path d="M14 15c0 3-3 5-7 5-2 0-4-1-4-3" />
        </svg>
      );
    case 'leo':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <circle cx="7" cy="15" r="3" />
          <path d="M8.5 12.5C9 8 13 4 17 4c2.5 0 4 2 4 4.5s-2 4-4 4.5-3 2-3 4.5a2.5 2.5 0 0 0 5 0" />
        </svg>
      );
    case 'virgo':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M3 6v10c0 2 2 3 4 3s3-1 3-3V6" />
          <path d="M10 6v10c0 2 2 3 4 3s3-1 3-3V6" />
          <path d="M17 6v11c0 3 2 4 4 4" />
          <path d="M17 14c2.5 1 4.5 4 4.5 4" />
          <path d="M17 18c2-2 4-4 4-6" />
        </svg>
      );
    case 'libra':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M3 19h18" />
          <path d="M3 15h6a3 3 0 0 1 6 0h6" />
          <path d="M9 15a3 3 0 1 1 6 0" />
          <path d="M5 8h14" />
        </svg>
      );
    case 'scorpio':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M3 6v10c0 2 2 3 4 3s3-1 3-3V6" />
          <path d="M10 6v10c0 2 2 3 4 3s3-1 3-3V6" />
          <path d="M17 6v12c0 2 1.5 3 3 3" />
          <path d="M19 19l2 2-2 2" />
          <path d="M21 21h-3" />
        </svg>
      );
    case 'sagittarius':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M5 19L20 4" />
          <path d="M13 4h7v7" />
          <path d="M7 13l4 4" />
        </svg>
      );
    case 'capricorn':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M4 6v9c0 3 2 5 5 5s4-2 4-5V5" />
          <path d="M13 13c1.5-2 3.5-3 5.5-2a3 3 0 0 1 1.5 4c-1.5 3-4.5 4-4.5 4" />
        </svg>
      );
    case 'aquarius':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M3 8l3-3 3 3 3-3 3 3 3-3 3 3" />
          <path d="M3 16l3-3 3 3 3-3 3 3 3-3 3 3" />
        </svg>
      );
    case 'pisces':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M6 4c3 4 3 12 0 16" />
          <path d="M18 4c-3 4-3 12 0 16" />
          <path d="M4 12h16" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v18" />
          <path d="M3 12h18" />
        </svg>
      );
  }
};

/**
 * Real Vector SVG Zodiac Icon Component
 */
export const ZodiacIcon: React.FC<ZodiacIconProps> = ({
  sign,
  size = 'md',
  className = '',
  showElementColor = true,
  withBadge = false,
  showLabel = false,
}) => {
  const zodiacInfo = findZodiacByKeyOrName(sign);
  const element: ZodiacElement = zodiacInfo?.element || 'fire';
  const color = ELEMENT_COLORS[element];
  const sizeClass = SIZE_MAP[size] || SIZE_MAP.md;

  if (!zodiacInfo) {
    if (!sign) return null;
    return (
      <span className={`inline-flex items-center text-xs font-mono text-slate-400 ${className}`}>
        {sign}
      </span>
    );
  }

  const iconElement = (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${sizeClass} ${
        showElementColor ? color.text : 'text-slate-300'
      } ${className}`}
      title={`${zodiacInfo.name} (${zodiacInfo.dateRange}) - ${zodiacInfo.element.toUpperCase()} Element`}
    >
      <ZodiacSvgGlyph
        signKey={zodiacInfo.key}
        stroke={showElementColor ? color.stroke : 'currentColor'}
      />
    </span>
  );

  if (withBadge) {
    return (
      <span
        className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl border text-xs font-mono font-bold shadow-sm select-none ${color.bg} ${color.text} ${className}`}
        title={`${zodiacInfo.name} • ${zodiacInfo.dateRange} • ${element.toUpperCase()}`}
      >
        <span className={sizeClass}>
          <ZodiacSvgGlyph signKey={zodiacInfo.key} stroke={color.stroke} />
        </span>
        <span>{zodiacInfo.name}</span>
        <span className="text-[10px] opacity-75 capitalize">({element})</span>
      </span>
    );
  }

  if (showLabel) {
    return (
      <span className={`inline-flex items-center space-x-1.5 text-xs font-medium ${className}`}>
        {iconElement}
        <span className="font-semibold text-slate-200">{zodiacInfo.name}</span>
      </span>
    );
  }

  return iconElement;
};
