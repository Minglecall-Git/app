import React, { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

interface MegaGiftOverlayProps {
  giftName: string;
  giftIcon: string;
  animationType: string;
  cost: number;
  onComplete: () => void;
}

export const MegaGiftOverlay: React.FC<MegaGiftOverlayProps> = ({
  giftName,
  giftIcon,
  animationType,
  cost,
  onComplete,
}) => {
  // Keep latest callback without re-arming the dismiss timer on every parent re-render
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    // Trigger confetti explosions based on animation type
    if (animationType === 'rocket' || animationType === 'yacht' || animationType === 'car') {
      confetti({
        particleCount: 120,
        spread: 100,
        origin: { y: 0.6 },
        colors: ['#ec4899', '#f43f5e', '#eab308', '#a855f7', '#3b82f6'],
      });

      const end = Date.now() + 2500;
      const frame = () => {
        confetti({
          particleCount: 8,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
        });
        confetti({
          particleCount: 8,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      frame();
    } else {
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.7 },
        colors: ['#f43f5e', '#ec4899', '#fb7185'],
      });
    }

    const timer = window.setTimeout(() => {
      onCompleteRef.current();
    }, 2800);

    return () => window.clearTimeout(timer);
    // Only restart FX when the gift animation identity changes — not when parent re-renders
  }, [animationType, giftName, giftIcon, cost]);

  return (
    <div className="absolute inset-0 z-[60] pointer-events-none flex items-center justify-center p-4">
      <div className="relative animate-bounce bg-slate-900/90 border-2 border-pink-500 rounded-3xl p-6 shadow-2xl backdrop-blur-md flex flex-col items-center text-center space-y-2 max-w-sm">
        <div className="text-7xl animate-pulse">{giftIcon}</div>
        <h2 className="text-xl font-extrabold text-white tracking-tight">MEGA GIFT SENT!</h2>
        <div className="px-4 py-1.5 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white font-extrabold text-sm shadow-md">
          {giftName} ({cost} 🪙)
        </div>
        <p className="text-xs text-pink-200">Credited directly to female creator earnings ledger!</p>
      </div>
    </div>
  );
};
