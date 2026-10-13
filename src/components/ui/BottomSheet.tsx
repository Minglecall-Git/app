import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidthClass?: string;
  className?: string;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  open,
  onClose,
  title,
  children,
  maxWidthClass = 'max-w-lg',
  className = '',
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'var(--app-overlay)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={[
          'relative w-full bg-app-card border border-app shadow-app-lg',
          'rounded-t-app-xl sm:rounded-app-xl',
          'max-h-[92vh] flex flex-col overflow-hidden app-sheet-up',
          maxWidthClass,
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <span className="w-10 h-1 rounded-full bg-app-border" />
        </div>
        {(title || true) && (
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-2 sm:pt-4 pb-3 border-b border-app shrink-0">
            {title ? (
              <h2 className="font-display text-lg font-bold text-app-heading truncate">{title}</h2>
            ) : (
              <span />
            )}
            <IconButton label="Close" size="sm" tone="muted" onClick={onClose}>
              <X className="w-4 h-4" />
            </IconButton>
          </div>
        )}
        <div className="overflow-y-auto flex-1 p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
};
