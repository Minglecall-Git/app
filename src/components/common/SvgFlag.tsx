import React, { useState } from 'react';
import { findCountryByCodeOrName } from '../../utils/countries';
import { useApp } from '../../context/AppContext';
import { DEFAULT_FLAG_SIZES } from '../../constants/appDefaults';
import { FlagSizeVariant } from '../../types';

interface SvgFlagProps {
  countryCode?: string;
  nationality?: string;
  className?: string;
  size?: FlagSizeVariant | string;
  width?: number | string;
  height?: number | string;
  rounded?: boolean;
  shadow?: boolean;
  showFallbackEmoji?: boolean;
}

/**
 * High-performance Real Vector SVG Flag Component
 * Renders crisp, scalable SVG flags from verified CDN vector assets with graceful inline SVG fallbacks.
 * Flag dimensions are dynamically controlled from Admin Taxonomy Governance Settings (Width = Math.round(Height * 1.5)).
 */
export const SvgFlag: React.FC<SvgFlagProps> = ({
  countryCode,
  nationality,
  className = '',
  size = 'md',
  width,
  height,
  rounded = true,
  shadow = true,
  showFallbackEmoji = false,
}) => {
  const [loadError, setLoadError] = useState(false);

  // Safely attempt to read dynamic flag sizes from AppContext
  let dynamicFlagSizes = DEFAULT_FLAG_SIZES;
  try {
    const app = useApp();
    if (app?.systemSettings?.flagSizes) {
      dynamicFlagSizes = { ...DEFAULT_FLAG_SIZES, ...app.systemSettings.flagSizes };
    }
  } catch {
    // Graceful fallback to DEFAULT_FLAG_SIZES if rendered outside AppProvider
  }

  // Derive ISO 2-letter country code
  const resolvedCode = React.useMemo(() => {
    const rawCode = (countryCode || '').trim();
    if (rawCode.length === 2) {
      return rawCode.toUpperCase();
    }
    if (rawCode) {
      const match = findCountryByCodeOrName(rawCode);
      if (match) return match.code.toUpperCase();
    }
    const rawNat = (nationality || '').trim();
    if (rawNat.length === 2) {
      return rawNat.toUpperCase();
    }
    if (rawNat) {
      const match = findCountryByCodeOrName(rawNat);
      if (match) return match.code.toUpperCase();
    }
    return 'US';
  }, [countryCode, nationality]);

  const countryInfo = findCountryByCodeOrName(resolvedCode);
  const countryName = countryInfo ? countryInfo.name : resolvedCode;

  // Primary CDN SVG url (PureCatAmphetamine country-flag-icons / FlagCDN 3x2 vector SVGs)
  const flagSvgUrl = `https://purecatamphetamine.github.io/country-flag-icons/3x2/${resolvedCode}.svg`;
  const fallbackFlagSvgUrl = `https://flagcdn.com/${resolvedCode.toLowerCase()}.svg`;

  // Compute exact dimensions dynamically (Width is auto calculated as Math.round(Height * 1.5) by default)
  const computedDimensions = React.useMemo(() => {
    let finalHeight: number;
    let finalWidth: number;

    if (height) {
      finalHeight = typeof height === 'number' ? height : parseInt(String(height), 10) || 18;
      finalWidth = width
        ? typeof width === 'number'
          ? width
          : parseInt(String(width), 10) || Math.round(finalHeight * 1.5)
        : Math.round(finalHeight * 1.5);
    } else if (width) {
      finalWidth = typeof width === 'number' ? width : parseInt(String(width), 10) || 27;
      finalHeight = Math.round(finalWidth / 1.5);
    } else {
      const sizeKey = (size || 'md') as keyof typeof DEFAULT_FLAG_SIZES;
      finalHeight = dynamicFlagSizes[sizeKey] ?? DEFAULT_FLAG_SIZES[sizeKey] ?? 22;
      finalWidth = Math.round(finalHeight * 1.5);
    }

    return {
      width: `${finalWidth}px`,
      height: `${finalHeight}px`,
      minWidth: `${finalWidth}px`,
      maxWidth: `${finalWidth}px`,
      maxHeight: `${finalHeight}px`,
    };
  }, [size, width, height, dynamicFlagSizes]);

  const roundedClass = rounded ? 'rounded-[4px]' : '';
  const shadowClass = shadow ? 'shadow-sm' : '';

  if (loadError) {
    // Graceful fallback: render styled vector country badge with clean fallback
    return (
      <span
        style={computedDimensions}
        className={`inline-flex items-center justify-center shrink-0 overflow-hidden font-mono font-bold text-[10px] uppercase border border-slate-700 bg-slate-800 text-slate-200 select-none ${roundedClass} ${shadowClass} ${className}`}
        title={countryName}
      >
        {showFallbackEmoji && countryInfo?.flag ? (
          <span className="text-sm leading-none">{countryInfo.flag}</span>
        ) : (
          resolvedCode
        )}
      </span>
    );
  }

  return (
    <span
      style={computedDimensions}
      className={`inline-flex items-center justify-center shrink-0 overflow-hidden select-none border border-black/15 dark:border-white/20 bg-slate-800 ring-1 ring-black/5 dark:ring-white/10 ${roundedClass} ${shadowClass} ${className}`}
      title={countryName}
    >
      <img
        src={flagSvgUrl}
        alt={`${countryName} Flag`}
        loading="lazy"
        className="w-full h-full object-cover object-center transform transition-transform duration-200"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          if (target.src !== fallbackFlagSvgUrl) {
            target.src = fallbackFlagSvgUrl;
          } else {
            setLoadError(true);
          }
        }}
      />
    </span>
  );
};
