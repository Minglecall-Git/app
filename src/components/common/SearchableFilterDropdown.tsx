import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

export interface SearchableFilterOption {
  value: string;
  label: string;
  subLabel?: string;
  icon?: React.ReactNode;
  badge?: string;
}

interface SearchableFilterDropdownProps {
  value: string;
  onChange: (val: string) => void;
  options: SearchableFilterOption[];
  allOptionLabel?: string;
  allOptionValue?: string;
  placeholder?: string;
  label?: string;
  icon?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  autoSort?: boolean; // Default true: automatically sorts options in ascending order (A to Z)
}

export const SearchableFilterDropdown: React.FC<SearchableFilterDropdownProps> = ({
  value,
  onChange,
  options,
  allOptionLabel,
  allOptionValue = 'all',
  placeholder = 'Search...',
  label,
  icon,
  className = '',
  disabled = false,
  autoSort = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Sorted options in ascending alphabetical order (A to Z)
  const sortedOptions = useMemo(() => {
    if (!autoSort) return options;
    return [...options].sort((a, b) => a.label.localeCompare(b.label));
  }, [options, autoSort]);

  // Real-time filtered options
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return sortedOptions;
    const q = searchQuery.toLowerCase().trim();
    return sortedOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.subLabel && opt.subLabel.toLowerCase().includes(q)) ||
        opt.value.toLowerCase().includes(q)
    );
  }, [sortedOptions, searchQuery]);

  // Current selected item
  const selectedOption = useMemo(() => {
    if (allOptionLabel && value === allOptionValue) {
      return {
        value: allOptionValue,
        label: allOptionLabel,
      };
    }
    return sortedOptions.find(
      (opt) =>
        opt.value.toLowerCase() === value.toLowerCase() ||
        opt.label.toLowerCase() === value.toLowerCase()
    );
  }, [value, sortedOptions, allOptionLabel, allOptionValue]);

  // Close on click outside
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

  const handleSelect = (val: string, e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onChange(val);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1.5">
          {icon}
          <span>{label}</span>
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
        className={`w-full p-2 bg-[#0F1115] border rounded-lg text-left flex items-center justify-between text-xs transition-all cursor-pointer select-none ${
          isOpen
            ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-slate-900 shadow-lg text-white'
            : 'border-slate-800 hover:border-slate-700 text-slate-200'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex items-center space-x-2 min-w-0 pointer-events-none truncate">
          {selectedOption?.icon}
          <span className="font-medium text-white truncate">
            {selectedOption ? selectedOption.label : allOptionLabel || placeholder}
          </span>
          {selectedOption?.subLabel && (
            <span className="text-[10px] text-slate-400 font-normal truncate">
              ({selectedOption.subLabel})
            </span>
          )}
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0 ml-1.5 pointer-events-none ${
            isOpen ? 'rotate-180 text-indigo-400' : ''
          }`}
        />
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          className="absolute z-50 left-0 right-0 mt-1.5 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-64"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Dynamic Search Bar Header */}
          <div className="p-2 border-b border-slate-800 bg-slate-950/90 sticky top-0 z-10">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                autoFocus
                placeholder={placeholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-7 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSearchQuery('');
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* List items (Sorted in Ascending Order A-Z) */}
          <div className="overflow-y-auto p-1 space-y-0.5 max-h-52 custom-scrollbar">
            {/* All option (if provided and no search query or query matches 'all') */}
            {allOptionLabel && (!searchQuery || allOptionLabel.toLowerCase().includes(searchQuery.toLowerCase())) && (
              <button
                type="button"
                onClick={(e) => handleSelect(allOptionValue, e)}
                className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-left transition-colors cursor-pointer text-xs select-none ${
                  value === allOptionValue
                    ? 'bg-indigo-600/25 text-indigo-200 border border-indigo-500/40 font-bold'
                    : 'hover:bg-slate-800 text-slate-300'
                }`}
              >
                <span>{allOptionLabel}</span>
                {value === allOptionValue && (
                  <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0 ml-1.5" />
                )}
              </button>
            )}

            {filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-500 font-mono">
                No matching items found for "{searchQuery}"
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected =
                  value.toLowerCase() === opt.value.toLowerCase() ||
                  value.toLowerCase() === opt.label.toLowerCase();

                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={(e) => handleSelect(opt.value, e)}
                    className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-left transition-colors cursor-pointer text-xs select-none ${
                      isSelected
                        ? 'bg-indigo-600/25 text-indigo-200 border border-indigo-500/40 font-bold'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2 min-w-0 pointer-events-none truncate">
                      {opt.icon}
                      <span className={isSelected ? 'text-indigo-300' : 'text-white'}>
                        {opt.label}
                      </span>
                      {opt.subLabel && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          ({opt.subLabel})
                        </span>
                      )}
                      {opt.badge && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono font-bold">
                          {opt.badge}
                        </span>
                      )}
                    </div>

                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0 ml-1.5" />
                    )}
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
