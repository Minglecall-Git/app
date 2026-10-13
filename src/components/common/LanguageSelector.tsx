import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Languages, Plus, X, Search, Check, ChevronDown } from 'lucide-react';
import { LanguageItem } from '../../types';
import { ALL_LANGUAGES, getAllowedLanguages, findLanguageByCodeOrName } from '../../utils/taxonomies';
import { useApp } from '../../context/AppContext';

interface LanguageSelectorProps {
  selectedLanguages: string[]; // e.g. ['English', 'Spanish'] or ['en', 'es']
  onChange: (languages: string[]) => void;
  allowedLanguages?: string[];
  maxSelectable?: number;
  label?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  selectedLanguages = [],
  onChange,
  allowedLanguages,
  maxSelectable = 10,
  label = 'Spoken Languages',
  placeholder = 'Add spoken languages...',
  className = '',
  disabled = false,
  required = false,
}) => {
  const { systemSettings } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Available languages derived from system settings
  const activeAllowed = allowedLanguages || systemSettings.allowedLanguages;
  const availableLanguages = useMemo(() => {
    return getAllowedLanguages(activeAllowed);
  }, [activeAllowed]);

  // Selected language names normalized
  const selectedNormalized = useMemo(() => {
    return new Set(
      selectedLanguages.map((l) => {
        const found = findLanguageByCodeOrName(l);
        return found ? found.name : l;
      })
    );
  }, [selectedLanguages]);

  // Filtered languages for dropdown
  const filteredLanguages = useMemo(() => {
    if (!searchQuery.trim()) return availableLanguages;
    const q = searchQuery.toLowerCase();
    return availableLanguages.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q)
    );
  }, [availableLanguages, searchQuery]);

  // Close dropdown on outside click with safe delay
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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

  const toggleLanguage = (langName: string) => {
    const exists = selectedNormalized.has(langName);
    if (exists) {
      if (selectedLanguages.length <= 1 && required) return; // keep at least 1 if required
      const next = selectedLanguages.filter((l) => {
        const found = findLanguageByCodeOrName(l);
        const name = found ? found.name : l;
        return name !== langName;
      });
      onChange(next);
    } else {
      if (selectedLanguages.length >= maxSelectable) return;
      onChange([...selectedLanguages, langName]);
    }
  };

  const removeLanguage = (langName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedLanguages.length <= 1 && required) return;
    const next = selectedLanguages.filter((l) => {
      const found = findLanguageByCodeOrName(l);
      const name = found ? found.name : l;
      return name !== langName;
    });
    onChange(next);
  };

  return (
    <div className={`space-y-2 ${className}`} ref={containerRef}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
            <Languages className="w-3.5 h-3.5 text-indigo-400" />
            <span>{label}</span>
          </label>
          <span className="text-[10px] font-mono text-slate-400">
            {selectedLanguages.length} / {maxSelectable} selected
          </span>
        </div>
      )}

      {/* Selected Language Chips Bar & Dropdown Opener */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`min-h-[46px] p-2 bg-slate-950 border rounded-xl sm:rounded-2xl flex flex-wrap items-center gap-1.5 transition-all cursor-pointer select-none relative ${
          isOpen
            ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-slate-900 shadow-lg'
            : 'border-slate-800 hover:border-slate-700'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {selectedLanguages.length === 0 ? (
          <span className="text-xs text-slate-500 px-1">{placeholder}</span>
        ) : (
          selectedLanguages.map((langStr) => {
            const langItem = findLanguageByCodeOrName(langStr);
            const displayName = langItem ? langItem.name : langStr;
            const nativeName = langItem ? langItem.nativeName : null;

            return (
              <span
                key={displayName}
                className="inline-flex items-center space-x-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold shadow-sm animate-in fade-in zoom-in-95 duration-100"
              >
                <span>{displayName}</span>
                {nativeName && nativeName !== displayName && (
                  <span className="text-[10px] text-indigo-400/80 font-normal">({nativeName})</span>
                )}
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => removeLanguage(displayName, e)}
                    className="p-0.5 hover:bg-indigo-500/30 text-indigo-300 hover:text-white rounded-md transition-colors"
                    title={`Remove ${displayName}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            );
          })
        )}

        <div className="ml-auto pl-1 flex items-center space-x-1 shrink-0 text-slate-400">
          <Plus className="w-4 h-4 hover:text-indigo-400 transition-colors" />
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-400' : ''}`} />
        </div>
      </div>

      {/* Interactive Dropdown Search & Grid */}
      {isOpen && (
        <div className="relative z-50">
          <div
            className="absolute left-0 right-0 top-1 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-72"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input Header */}
            <div className="p-2.5 border-b border-slate-800 bg-slate-950/90 sticky top-0 z-10 flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search language or native script..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-8 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-medium"
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
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold shrink-0 cursor-pointer"
              >
                Done
              </button>
            </div>

            {/* List items */}
            <div className="overflow-y-auto p-1.5 grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-56">
              {filteredLanguages.length === 0 ? (
                <div className="col-span-full py-6 text-center text-xs text-slate-500 font-mono">
                  No active languages match "{searchQuery}"
                </div>
              ) : (
                filteredLanguages.map((lang) => {
                  const isSelected = selectedNormalized.has(lang.name);
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleLanguage(lang.name);
                      }}
                      className={`p-2 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer select-none ${
                        isSelected
                          ? 'bg-indigo-600/25 text-indigo-200 border border-indigo-500/40 shadow-sm'
                          : 'bg-slate-950/40 hover:bg-slate-800 border border-slate-800/60 text-slate-300'
                      }`}
                    >
                      <div className="min-w-0 pr-2 pointer-events-none">
                        <div className="text-xs font-bold truncate flex items-center space-x-1.5">
                          <span className={isSelected ? 'text-indigo-300' : 'text-white'}>{lang.name}</span>
                          {lang.popular && (
                            <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[8px] font-mono font-bold">
                              TOP
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate">
                          {lang.nativeName} • {lang.region}
                        </div>
                      </div>

                      <div
                        className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 border transition-all pointer-events-none ${
                          isSelected
                            ? 'bg-indigo-600 border-indigo-500 text-white'
                            : 'border-slate-700 bg-slate-900'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
