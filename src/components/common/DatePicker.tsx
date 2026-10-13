import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ChevronDown,
  X,
} from 'lucide-react';

interface DatePickerProps {
  id?: string;
  value: string; // Format: YYYY-MM-DD
  onChange: (value: string, calculatedAge: number) => void;
  minAge?: number;
  label?: string;
  required?: boolean;
  disabled?: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function calculateAgeFromDob(dobString: string): number {
  if (!dobString) return 0;
  const parts = dobString.split('-');
  if (parts.length !== 3) return 0;
  const birthYear = parseInt(parts[0], 10);
  const birthMonth = parseInt(parts[1], 10) - 1;
  const birthDay = parseInt(parts[2], 10);

  const today = new Date();
  let age = today.getFullYear() - birthYear;
  const monthDiff = today.getMonth() - birthMonth;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDay)) {
    age--;
  }
  return isNaN(age) ? 0 : age;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  id = 'custom-date-picker',
  value,
  onChange,
  minAge = 18,
  label = 'Date of Birth (DOB)',
  required = true,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const nativeInputRef = useRef<HTMLInputElement>(null);

  // Maximum allowed date is today minus minAge years
  const maxYear = useMemo(() => {
    return new Date().getFullYear() - minAge;
  }, [minAge]);

  const minYear = 1920;

  // Parse initial date or default to 2000-01-01
  const parsedDate = useMemo(() => {
    if (value && value.includes('-')) {
      const [y, m, d] = value.split('-').map((v) => parseInt(v, 10));
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        return { year: y, month: m - 1, day: d };
      }
    }
    return { year: 2000, month: 0, day: 1 };
  }, [value]);

  const [viewYear, setViewYear] = useState<number>(parsedDate.year);
  const [viewMonth, setViewMonth] = useState<number>(parsedDate.month);

  // Sync view when value changes externally
  useEffect(() => {
    setViewYear(parsedDate.year);
    setViewMonth(parsedDate.month);
  }, [parsedDate.year, parsedDate.month]);

  // Close calendar popup on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const calculatedAge = useMemo(() => calculateAgeFromDob(value), [value]);
  const isAdult = calculatedAge >= minAge;

  // Format date display (e.g. "October 14, 2000")
  const formattedDisplay = useMemo(() => {
    if (!value) return 'Select your date of birth...';
    try {
      const [y, m, d] = value.split('-').map((v) => parseInt(v, 10));
      if (isNaN(y) || isNaN(m) || isNaN(d)) return value;
      const dateObj = new Date(y, m - 1, d);
      return dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return value;
    }
  }, [value]);

  // Quick Age Preset helper
  const handleQuickAgePreset = (targetAge: number) => {
    const today = new Date();
    const targetYear = today.getFullYear() - targetAge;
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const newDob = `${targetYear}-${m}-${d}`;
    onChange(newDob, targetAge);
    setViewYear(targetYear);
    setViewMonth(today.getMonth());
    setIsOpen(false);
  };

  // Calendar Day Click Handler
  const handleDaySelect = (day: number) => {
    const mStr = String(viewMonth + 1).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    const newDob = `${viewYear}-${mStr}-${dStr}`;
    const age = calculateAgeFromDob(newDob);
    onChange(newDob, age);
    setIsOpen(false);
  };

  // Month navigation
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      if (viewYear > minYear) {
        setViewYear(viewYear - 1);
        setViewMonth(11);
      }
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      if (viewYear < maxYear) {
        setViewYear(viewYear + 1);
        setViewMonth(0);
      }
    } else {
      if (viewYear === maxYear && viewMonth >= new Date().getMonth()) {
        return;
      }
      setViewMonth(viewMonth + 1);
    }
  };

  // Generate days in month
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();
    const days: (number | null)[] = [];

    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let d = 1; d <= totalDays; d++) {
      days.push(d);
    }
    return days;
  }, [viewYear, viewMonth]);

  // Year options list for fast selection
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = maxYear; y >= minYear; y--) {
      years.push(y);
    }
    return years;
  }, [maxYear]);

  // Native input change fallback
  const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      const age = calculateAgeFromDob(val);
      onChange(val, age);
    }
  };

  return (
    <div className="space-y-1.5" ref={containerRef}>
      {/* Label and Age indicator */}
      {label && (
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold text-slate-300 uppercase font-mono tracking-wider">
            {label} {required && '*'}
          </label>
          {value && (
            <div className="flex items-center space-x-1.5 text-[11px] font-bold">
              {isAdult ? (
                <span className="text-emerald-400 flex items-center space-x-1 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>{calculatedAge} Yrs (18+ Verified)</span>
                </span>
              ) : (
                <span className="text-rose-400 flex items-center space-x-1 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full animate-pulse">
                  <AlertCircle className="w-3 h-3 text-rose-400" />
                  <span>Must be 18+ (Currently {calculatedAge})</span>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Clickable Trigger Input */}
      <div className="relative">
        <button
          id={id}
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full bg-[#0F1115] border rounded-2xl pl-11 pr-10 py-3 text-xs text-left flex items-center justify-between transition-all cursor-pointer ${
            isOpen
              ? 'border-rose-500 ring-2 ring-rose-500/20 text-white'
              : !isAdult && value
              ? 'border-rose-500/70 text-rose-300'
              : 'border-slate-800 hover:border-slate-700 text-white'
          }`}
        >
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-sm text-white">{formattedDisplay}</span>
            {value && (
              <span className="text-[11px] font-mono text-slate-400">
                ({value})
              </span>
            )}
          </div>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${
              isOpen ? 'rotate-180 text-rose-400' : ''
            }`}
          />
        </button>

        {/* Left Calendar Icon - Click to toggle */}
        <div
          onClick={() => setIsOpen(!isOpen)}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-rose-400 cursor-pointer hover:scale-110 transition-transform"
        >
          <CalendarIcon className="w-4 h-4" />
        </div>

        {/* Hidden Native Date Input for Accessibility & Direct Browser Picker Trigger */}
        <input
          ref={nativeInputRef}
          type="date"
          tabIndex={-1}
          value={value}
          max={`${maxYear}-12-31`}
          min={`${minYear}-01-01`}
          onChange={handleNativeChange}
          className="sr-only"
        />
      </div>

      {/* Interactive Calendar Popover */}
      {isOpen && (
        <div className="relative z-50">
          <div className="absolute top-1 left-0 right-0 sm:right-auto sm:w-80 bg-[#161922] border border-slate-700/80 rounded-3xl shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-150 space-y-3">
            {/* Popover Header: Month & Year Selectors */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center space-x-1.5">
                {/* Month Dropdown */}
                <select
                  value={viewMonth}
                  onChange={(e) => setViewMonth(parseInt(e.target.value, 10))}
                  className="bg-slate-900 border border-slate-700 text-white text-xs font-bold rounded-xl px-2 py-1 focus:outline-none focus:border-rose-500 cursor-pointer"
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={idx} value={idx}>
                      {name}
                    </option>
                  ))}
                </select>

                {/* Year Dropdown */}
                <select
                  value={viewYear}
                  onChange={(e) => setViewYear(parseInt(e.target.value, 10))}
                  className="bg-slate-900 border border-slate-700 text-white text-xs font-bold rounded-xl px-2 py-1 focus:outline-none focus:border-rose-500 cursor-pointer font-mono"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleNextMonth}
                disabled={viewYear >= maxYear && viewMonth >= new Date().getMonth()}
                className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                title="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Quick 18+ Age Shortcut Presets */}
            <div className="flex items-center justify-between gap-1 bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800">
              <span className="text-[10px] text-slate-400 font-mono pl-1 flex items-center space-x-1">
                <Sparkles className="w-3 h-3 text-rose-400" />
                <span>Presets:</span>
              </span>
              <div className="flex items-center space-x-1">
                {[18, 21, 24, 28, 32].map((age) => (
                  <button
                    key={age}
                    type="button"
                    onClick={() => handleQuickAgePreset(age)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono transition-all cursor-pointer ${
                      calculatedAge === age
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {age}y
                  </button>
                ))}
              </div>
            </div>

            {/* Weekdays Header */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {DAYS_OF_WEEK.map((d, i) => (
                <div
                  key={i}
                  className="text-[10px] font-bold text-slate-500 font-mono uppercase"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar Days Grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} className="h-8" />;
                }

                const isSelected =
                  parsedDate.year === viewYear &&
                  parsedDate.month === viewMonth &&
                  parsedDate.day === day;

                // Check if day results in under 18
                const testM = String(viewMonth + 1).padStart(2, '0');
                const testD = String(day).padStart(2, '0');
                const testAge = calculateAgeFromDob(`${viewYear}-${testM}-${testD}`);
                const isUnderage = testAge < minAge;

                return (
                  <button
                    key={`day-${day}`}
                    type="button"
                    disabled={isUnderage}
                    onClick={() => handleDaySelect(day)}
                    className={`h-8 rounded-xl text-xs font-semibold flex items-center justify-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-tr from-rose-600 to-indigo-600 text-white font-bold shadow-md shadow-rose-600/30 ring-2 ring-rose-400'
                        : isUnderage
                        ? 'text-slate-600 opacity-30 cursor-not-allowed line-through'
                        : 'text-slate-200 hover:bg-slate-800 hover:text-white hover:scale-105'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* Footer with native system picker fallback */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
              <button
                type="button"
                onClick={() => {
                  try {
                    nativeInputRef.current?.showPicker?.();
                  } catch {
                    // Fallback
                  }
                }}
                className="text-rose-400 hover:text-rose-300 font-medium hover:underline cursor-pointer flex items-center space-x-1"
              >
                <CalendarIcon className="w-3 h-3" />
                <span>Open System Date Dialog</span>
              </button>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold text-[10px] cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
