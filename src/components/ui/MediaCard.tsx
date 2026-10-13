import React, { useEffect, useRef, useState } from 'react';

export type MediaCardAspect = '3/4' | '9/16' | '2/3';

export interface MediaCardProps extends React.HTMLAttributes<HTMLDivElement> {
  src: string;
  alt: string;
  /** Single aspect when responsive pair not provided */
  aspect?: MediaCardAspect;
  /** Mobile aspect (default 9/16). Used with aspectDesktop for responsive cards. */
  aspectMobile?: MediaCardAspect;
  /** sm+ aspect (default 3/4) */
  aspectDesktop?: MediaCardAspect;
  /** Used when primary src fails or is empty — kept in React state so re-renders cannot wipe it. */
  fallbackSrc?: string;
  /** Hide photo layer (gradient + overlays still render). */
  showPhoto?: boolean;
  objectFit?: 'cover' | 'contain';
  objectPosition?: 'center' | 'top' | 'bottom';
  statusSlot?: React.ReactNode;
  metadata?: React.ReactNode;
  footer?: React.ReactNode;
  onImageError?: React.ReactEventHandler<HTMLImageElement>;
}

/** Full class strings so Tailwind JIT always emits them (no dynamic construction). */
const ASPECT_PAIR_CLASS: Record<string, string> = {
  '9/16__3/4': 'aspect-[9/16] sm:aspect-[3/4] min-h-[220px]',
  '9/16__2/3': 'aspect-[9/16] sm:aspect-[2/3] min-h-[220px]',
  '9/16__9/16': 'aspect-[9/16] sm:aspect-[9/16] min-h-[220px]',
  '2/3__3/4': 'aspect-[2/3] sm:aspect-[3/4] min-h-[200px]',
  '2/3__2/3': 'aspect-[2/3] sm:aspect-[2/3] min-h-[200px]',
  '2/3__9/16': 'aspect-[2/3] sm:aspect-[9/16] min-h-[200px]',
  '3/4__3/4': 'aspect-[3/4] sm:aspect-[3/4] min-h-[200px]',
  '3/4__2/3': 'aspect-[3/4] sm:aspect-[2/3] min-h-[200px]',
  '3/4__9/16': 'aspect-[3/4] sm:aspect-[9/16] min-h-[200px]',
};

const OBJECT_FIT_CLASS: Record<'cover' | 'contain', string> = {
  cover: 'object-cover',
  contain: 'object-contain',
};

const OBJECT_POS_CLASS: Record<'center' | 'top' | 'bottom', string> = {
  center: 'object-center',
  top: 'object-top',
  bottom: 'object-bottom',
};

export const MediaCard: React.FC<MediaCardProps> = ({
  src,
  alt,
  aspect = '3/4',
  aspectMobile,
  aspectDesktop,
  fallbackSrc,
  showPhoto = true,
  objectFit = 'cover',
  objectPosition = 'center',
  statusSlot,
  metadata,
  footer,
  onImageError,
  className = '',
  onClick,
  ...rest
}) => {
  const mobile = aspectMobile || (aspect === '9/16' || aspect === '2/3' ? aspect : '9/16');
  const desktop = aspectDesktop || (aspect === '3/4' || aspect === '2/3' ? aspect : '3/4');
  const resolvedAspectClass =
    ASPECT_PAIR_CLASS[`${mobile}__${desktop}`] || ASPECT_PAIR_CLASS['9/16__3/4'];

  const resolvedSrc = (src && String(src).trim()) || fallbackSrc || '';
  const [imgSrc, setImgSrc] = useState(resolvedSrc);
  const [loaded, setLoaded] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const next = (src && String(src).trim()) || fallbackSrc || '';
    setImgSrc(next);
    setUsedFallback(!(src && String(src).trim()) && Boolean(fallbackSrc));
    // Do not force opacity-0 if browser already has the image cached
    setLoaded(false);
  }, [src, fallbackSrc]);

  // After src changes / mount: mark loaded if image is already complete (cached)
  useEffect(() => {
    const el = imgRef.current;
    if (!el || !imgSrc) return;
    if (el.complete && el.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [imgSrc]);

  const handleError: React.ReactEventHandler<HTMLImageElement> = (e) => {
    if (!usedFallback && fallbackSrc && imgSrc !== fallbackSrc) {
      setUsedFallback(true);
      setLoaded(false);
      setImgSrc(fallbackSrc);
      return;
    }
    // Last resort: still show something rather than blank forever
    setLoaded(true);
    onImageError?.(e);
  };

  return (
    <div
      className={[
        'group relative overflow-hidden rounded-app-xl bg-app-card border border-hairline shadow-app-sm',
        'transition-transform duration-300 hover:scale-[1.01] app-fade-up',
        onClick ? 'cursor-pointer' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      {...rest}
    >
      <div className={`relative w-full ${resolvedAspectClass} overflow-hidden bg-slate-900`}>
        {showPhoto && !loaded && (
          <div
            className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-800 via-slate-750 to-slate-900"
            aria-hidden
          />
        )}
        {showPhoto && imgSrc ? (
          <img
            key={imgSrc}
            ref={imgRef}
            src={imgSrc}
            alt={alt}
            loading="eager"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={handleError}
            className={[
              'absolute inset-0 w-full h-full transition-opacity duration-300 group-hover:scale-105',
              OBJECT_FIT_CLASS[objectFit],
              OBJECT_POS_CLASS[objectPosition],
              loaded ? 'opacity-100' : 'opacity-0',
            ].join(' ')}
          />
        ) : null}
        {!showPhoto && (
          <div
            className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-black"
            aria-hidden
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10 pointer-events-none" />

        {statusSlot ? (
          <div className="absolute top-2 left-2 right-2 z-10 flex items-start justify-between gap-2">
            {statusSlot}
          </div>
        ) : null}

        {(metadata || footer) ? (
          <div className="absolute bottom-0 left-0 right-0 z-10 p-2.5 sm:p-3 pointer-events-none space-y-2">
            {metadata ? <div className="pointer-events-auto">{metadata}</div> : null}
            {footer ? <div className="pointer-events-auto">{footer}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};
