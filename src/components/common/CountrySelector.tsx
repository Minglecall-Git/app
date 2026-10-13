import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, Check, Globe, X } from 'lucide-react';
import { CountryItem, getAllowedCountries, findCountryByCodeOrName } from '../../utils/countries';
import { SvgFlag } from './SvgFlag';
import { useApp } from '../../context/AppContext';

interface CountrySelectorProps {
  value?: string; // Country code or name (e.g. 'US' or 'United States')
  onChange: (country: CountryItem) => void;
  allowedCodes?: string[];
  placeholder?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

export const CountrySelector: React.FC<CountrySelectorProps> = ({
  value,
  onChange,
  allowedCodes,
  placeholder = 'Select Country...',
  label,
  className = '',
  disabled = false,
  required = false,
}) => {
  const { systemSettings } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Available countries derived from systemSettings or explicit prop
  const activeAllowedCodes = allowedCodes || systemSettings.allowedCountryCodes;
  const availableCountries = useMemo(() => {
    return getAllowedCountries(activeAllowedCodes);
  }, [activeAllowedCodes]);

  // Current selected country item
  const selectedCountry = useMemo(() => {
    return findCountryByCodeOrName(value) || availableCountries[0];
  }, [value, availableCountries]);

  // Filtered countries
  const filteredCountries = useMemo(() => {
    if (!searchQuery.trim()) return availableCountries;
    const q = searchQuery.toLowerCase();
    return availableCountries.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [availableCountries, searchQuery]);

  // Close on outside click with safe delay so item clicks register cleanly
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('pointerdown', handleOutsideClick);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handleOutsideClick);
    };
  }, [isOpen]);

  const handleSelect = (c: CountryItem, e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onChange(c);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
          <span className="flex items-center space-x-1.5">
            <Globe className="w-3.5 h-3.5 text-indigo-400" />
            <span>{label}</span>
          </span>
          {required && <span className="text-[10px] text-indigo-400 font-mono">* Required</span>}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className={`w-full p-2.5 sm:p-3 bg-slate-950 border rounded-xl sm:rounded-2xl text-left flex items-center justify-between transition-all cursor-pointer select-none ${
          isOpen
            ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-slate-900 shadow-lg'
            : 'border-slate-800 hover:border-slate-700 bg-slate-950'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex items-center space-x-3 min-w-0 pointer-events-none">
          {selectedCountry ? (
            <>
              <SvgFlag countryCode={selectedCountry.code} size="sm" className="rounded shadow" />
              <div className="text-xs sm:text-sm font-bold text-white truncate flex items-center space-x-1.5 min-w-0">
                <span className="truncate">{selectedCountry.name}</span>
                <span className="text-[10px] font-mono text-slate-400 uppercase shrink-0">
                  ({selectedCountry.code})
                </span>
              </div>
            </>
          ) : (
            <span className="text-xs text-slate-400">{placeholder}</span>
          )}
        </div>

        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ml-2 pointer-events-none ${
            isOpen ? 'rotate-180 text-indigo-400' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute z-50 left-0 right-0 mt-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-72"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Search Input Header */}
          <div className="p-2.5 border-b border-slate-800 bg-slate-950/80 sticky top-0 z-10">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                autoFocus
                placeholder="Search country or code..."
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
          </div>

          {/* List items */}
          <div className="overflow-y-auto p-1.5 space-y-0.5 max-h-56">
            {filteredCountries.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 font-mono">
                No active countries found for "{searchQuery}"
              </div>
            ) : (
              filteredCountries.map((c) => {
                const isSelected = selectedCountry?.code.toUpperCase() === c.code.toUpperCase();
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={(e) => handleSelect(c, e)}
                    className={`w-full px-3 py-2 rounded-xl flex items-center justify-between text-left transition-colors cursor-pointer select-none ${
                      isSelected
                        ? 'bg-indigo-600/25 text-indigo-200 border border-indigo-500/40'
                        : 'hover:bg-slate-800/90 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0 pointer-events-none">
                      <SvgFlag countryCode={c.code} size="sm" className="rounded shadow-sm" />
                      <div className="text-xs font-bold truncate flex items-center space-x-1.5 min-w-0">
                        <span className={`truncate ${isSelected ? 'text-indigo-300' : 'text-white'}`}>
                          {c.name}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 uppercase shrink-0">
                          ({c.code})
                        </span>
                      </div>
                    </div>

                    {isSelected && <Check className="w-4 h-4 text-indigo-400 shrink-0 ml-2 pointer-events-none" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
