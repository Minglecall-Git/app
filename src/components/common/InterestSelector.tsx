import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Heart,
  Sparkles,
  Flame,
  Music,
  Palette,
  Gamepad2,
  Coffee,
  HeartPulse,
  Users,
  Search,
  Check,
  Plus,
  X,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { InterestCategory, InterestItem } from '../../types';
import {
  INTEREST_CATEGORIES,
  getAllowedInterests,
  findInterestByIdOrName,
} from '../../utils/taxonomies';
import { useApp } from '../../context/AppContext';

interface InterestSelectorProps {
  selectedInterests: string[]; // e.g. ['Travel & Adventure', 'Gaming & Esports'] or ids
  onChange: (interests: string[]) => void;
  allowedInterests?: string[];
  maxSelectable?: number;
  label?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

// Category Icon Mapper
export const getCategoryIcon = (category: InterestCategory, className = 'w-3.5 h-3.5') => {
  switch (category) {
    case 'lifestyle':
      return <Sparkles className={className} />;
    case 'sports':
      return <Flame className={className} />;
    case 'music':
      return <Music className={className} />;
    case 'art':
      return <Palette className={className} />;
    case 'tech':
      return <Gamepad2 className={className} />;
    case 'food':
      return <Coffee className={className} />;
    case 'wellness':
      return <HeartPulse className={className} />;
    case 'social':
      return <Users className={className} />;
    default:
      return <Heart className={className} />;
  }
};

export const InterestSelector: React.FC<InterestSelectorProps> = ({
  selectedInterests = [],
  onChange,
  allowedInterests,
  maxSelectable = 15,
  label = 'Interests & Passions',
  placeholder = 'Tap to add interests…',
  className = '',
  disabled = false,
}) => {
  const { systemSettings } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeAllowed = allowedInterests || systemSettings.allowedInterests;
  const availableInterests = useMemo(() => {
    return getAllowedInterests(activeAllowed);
  }, [activeAllowed]);

  const selectedNormalized = useMemo(() => {
    return new Set(
      selectedInterests.map((itemStr) => {
        const found = findInterestByIdOrName(itemStr);
        return found ? found.name : itemStr;
      })
    );
  }, [selectedInterests]);

  const filteredInterests = useMemo(() => {
    return availableInterests.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
      }
      return true;
    });
  }, [availableInterests, selectedCategory, searchQuery]);

  const groupedInterests = useMemo(() => {
    if (selectedCategory !== 'all') {
      return [{ key: selectedCategory, items: filteredInterests }];
    }
    const groups: { key: string; label: string; items: InterestItem[] }[] = [];
    for (const cat of INTEREST_CATEGORIES) {
      const items = filteredInterests.filter((i) => i.category === cat.key);
      if (items.length > 0) {
        groups.push({ key: cat.key, label: cat.name, items });
      }
    }
    return groups;
  }, [filteredInterests, selectedCategory]);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const maxMenuHeight = 360;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openUpward = spaceBelow < Math.min(maxMenuHeight, 240) && spaceAbove > spaceBelow;
    const available = Math.max(180, openUpward ? spaceAbove : spaceBelow);
    const height = Math.min(maxMenuHeight, available);

    setMenuStyle({
      position: 'fixed',
      left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.min(rect.width, 520) - 8)),
      width: Math.min(Math.max(rect.width, 300), window.innerWidth - 16),
      zIndex: 9999,
      maxHeight: height,
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top + gap }
        : { top: rect.bottom + gap }),
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    updateMenuPosition();

    const handleReposition = () => updateMenuPosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent | PointerEvent) => {
      const target = e.target as Node;
      const inTrigger = containerRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inTrigger && !inDropdown) {
        setIsOpen(false);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('pointerdown', handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handleClickOutside);
    };
  }, [isOpen]);

  const toggleInterest = (itemName: string) => {
    const exists = selectedNormalized.has(itemName);
    if (exists) {
      const next = selectedInterests.filter((i) => {
        const found = findInterestByIdOrName(i);
        const name = found ? found.name : i;
        return name !== itemName;
      });
      onChange(next);
    } else {
      if (selectedInterests.length >= maxSelectable) return;
      onChange([...selectedInterests, itemName]);
    }
  };

  const removeInterest = (itemName: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = selectedInterests.filter((i) => {
      const found = findInterestByIdOrName(i);
      const name = found ? found.name : i;
      return name !== itemName;
    });
    onChange(next);
  };

  const clearAll = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange([]);
  };

  const atLimit = selectedInterests.length >= maxSelectable;

  const dropdownPanel =
    isOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={dropdownRef}
            style={menuStyle}
            className="bg-[#12151F] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-slate-800 bg-slate-950/95 shrink-0 space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Search interests…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-pink-500/60 font-medium"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSearchQuery('');
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(false);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold shrink-0 transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedCategory('all');
                  }}
                  className={`px-2.5 py-1.5 rounded-lg shrink-0 text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                    selectedCategory === 'all'
                      ? 'bg-pink-600 text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  <span>All</span>
                </button>
                {INTEREST_CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedCategory(cat.key);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg shrink-0 text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                      selectedCategory === cat.key
                        ? 'bg-pink-600 text-white'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {getCategoryIcon(cat.key, 'w-3 h-3')}
                    <span className="whitespace-nowrap">{cat.name.split(' & ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-y-auto flex-1 min-h-0 p-2 space-y-3">
              {groupedInterests.length === 0 ||
              groupedInterests.every((g) => ('items' in g ? g.items.length === 0 : false)) ? (
                <div className="py-10 text-center text-xs text-slate-500 font-mono">
                  No interests match your search.
                </div>
              ) : (
                groupedInterests.map((group) => {
                  const items = group.items;
                  if (!items.length) return null;
                  const catMeta = INTEREST_CATEGORIES.find((c) => c.key === group.key);
                  const showHeader = selectedCategory === 'all' && catMeta;

                  return (
                    <div key={group.key} className="space-y-1.5">
                      {showHeader && (
                        <div className="flex items-center gap-1.5 px-1.5 pt-0.5">
                          <span className="text-pink-400/90">
                            {getCategoryIcon(catMeta.key, 'w-3 h-3')}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            {catMeta.name}
                          </span>
                          <span className="text-[10px] font-mono text-slate-600">{items.length}</span>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((interest) => {
                          const isSelected = selectedNormalized.has(interest.name);
                          const blocked = !isSelected && atLimit;
                          return (
                            <button
                              key={interest.id}
                              type="button"
                              disabled={blocked}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (blocked) return;
                                toggleInterest(interest.name);
                              }}
                              className={`inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-all cursor-pointer select-none border ${
                                isSelected
                                  ? 'bg-pink-600/25 border-pink-500/50 text-pink-200 shadow-sm'
                                  : blocked
                                    ? 'bg-slate-950/40 border-slate-800/60 text-slate-600 cursor-not-allowed'
                                    : 'bg-slate-950/70 border-slate-700/70 text-slate-300 hover:border-slate-500 hover:text-white'
                              }`}
                            >
                              <span
                                className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border ${
                                  isSelected
                                    ? 'bg-pink-600 border-pink-400 text-white'
                                    : 'border-slate-600 bg-slate-900'
                                }`}
                              >
                                {isSelected ? (
                                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                                ) : (
                                  <Plus className="w-2.5 h-2.5 text-slate-500" />
                                )}
                              </span>
                              <span className="truncate max-w-[160px]">{interest.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-3 py-2 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between shrink-0">
              <span className="text-[11px] font-mono text-slate-400">
                {selectedInterests.length}/{maxSelectable} selected
                {atLimit ? ' · limit reached' : ''}
              </span>
              {selectedInterests.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-[11px] font-semibold text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className={`space-y-2 ${className}`} ref={containerRef}>
      {label && (
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-pink-400" />
            <span>{label}</span>
          </label>
          <span className="text-[10px] font-mono text-slate-500">
            {selectedInterests.length}/{maxSelectable}
          </span>
        </div>
      )}

      <div
        ref={triggerRef}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled) return;
          if (!isOpen) updateMenuPosition();
          setIsOpen((prev) => !prev);
        }}
        className={`min-h-[52px] p-2.5 bg-slate-950 border rounded-2xl flex flex-wrap items-center gap-1.5 transition-all cursor-pointer select-none ${
          isOpen
            ? 'border-pink-500/70 ring-2 ring-pink-500/15 bg-slate-900 shadow-lg'
            : 'border-slate-800 hover:border-slate-600'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {selectedInterests.length === 0 ? (
          <span className="text-xs text-slate-500 px-1.5 py-1 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-slate-600" />
            {placeholder}
          </span>
        ) : (
          selectedInterests.map((itemStr) => {
            const itemObj = findInterestByIdOrName(itemStr);
            const displayName = itemObj ? itemObj.name : itemStr;
            const category = itemObj ? itemObj.category : 'lifestyle';

            return (
              <span
                key={displayName}
                className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-full bg-pink-950/50 border border-pink-500/35 text-pink-200 text-[11px] font-semibold"
              >
                <span className="text-pink-400/90">{getCategoryIcon(category, 'w-3 h-3')}</span>
                <span className="max-w-[140px] truncate">{displayName}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => removeInterest(displayName, e)}
                    className="p-0.5 hover:bg-pink-500/25 text-pink-300/80 hover:text-white rounded-full transition-colors"
                    title={`Remove ${displayName}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            );
          })
        )}

        <div className="ml-auto pl-1 flex items-center text-slate-500 pointer-events-none">
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-pink-400' : ''
            }`}
          />
        </div>
      </div>

      {dropdownPanel}
    </div>
  );
};
