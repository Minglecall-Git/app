import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Coins,
  DollarSign,
  Edit3,
  KeyRound,
  MapPin,
  Menu,
  User,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  ProfileNavIconName,
  ProfileNavItem,
  ProfileSectionKey,
  getProfileSectionLabel,
} from './profileNavConfig';

const ICON_MAP: Record<ProfileNavIconName, LucideIcon> = {
  User,
  MapPin,
  Edit3,
  DollarSign,
  Coins,
  Camera,
  KeyRound,
};

const COLLAPSE_STORAGE_KEY = 'minglecall:profile-sidebar-collapsed';

export interface ProfileShellProps {
  activeSection: ProfileSectionKey;
  onNavigateSection: (section: ProfileSectionKey) => void;
  navItems: ProfileNavItem[];
  brandName?: string;
  brandSubtitle?: string;
  sidebarUserChip?: React.ReactNode;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

function NavIcon({ name, className }: { name: ProfileNavIconName; className?: string }) {
  const Icon = ICON_MAP[name];
  return <Icon className={className || 'w-4 h-4 shrink-0'} />;
}

export const ProfileShell: React.FC<ProfileShellProps> = ({
  activeSection,
  onNavigateSection,
  navItems,
  brandName = 'My Profile',
  brandSubtitle = 'Account',
  sidebarUserChip,
  headerActions,
  children,
}) => {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const currentLabel = useMemo(
    () => getProfileSectionLabel(activeSection, navItems),
    [activeSection, navItems]
  );

  const handleNavClick = (section: ProfileSectionKey) => {
    onNavigateSection(section);
    closeMobile();
  };

  const renderNav = (mode: 'desktop' | 'mobile') => {
    const iconOnly = mode === 'desktop' && collapsed;

    return (
      <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-3 px-2 space-y-1 scrollbar-thin">
        {!iconOnly && (
          <div className="px-2.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Settings
          </div>
        )}
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const isActive = item.id === activeSection;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  id={item.buttonId}
                  title={iconOnly ? item.label : undefined}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600/90 text-white border border-indigo-500/50 shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white border border-transparent'
                  } ${iconOnly ? 'justify-center' : ''}`}
                >
                  <NavIcon name={item.icon} className="w-4 h-4 shrink-0" />
                  {!iconOnly && (
                    <>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge != null && item.badge !== '' && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded bg-pink-500/30 text-pink-200 text-[9px] font-mono font-bold">
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  };

  return (
    <div
      id="dedicated-user-profile-page"
      className="max-w-7xl w-full mx-auto h-full min-h-0 flex overflow-hidden bg-[#0B0D13] text-slate-100"
    >
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col shrink-0 h-full min-h-0 border-r border-slate-800 bg-[#12151F] transition-[width] duration-200 ${
          collapsed ? 'w-[64px]' : 'w-[260px]'
        }`}
      >
        <div
          className={`flex items-center gap-2 border-b border-slate-800 h-14 shrink-0 px-3 ${
            collapsed ? 'justify-center' : 'justify-between'
          }`}
        >
          {!collapsed && (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-indigo-400 text-[9px] font-mono font-bold uppercase tracking-wider">
                <User className="w-3 h-3" />
                <span className="truncate">{brandSubtitle}</span>
              </div>
              <div className="text-sm font-bold text-white truncate">{brandName}</div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
        {!collapsed && sidebarUserChip && (
          <div className="px-3 py-3 border-b border-slate-800 shrink-0">{sidebarUserChip}</div>
        )}
        {renderNav('desktop')}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 cursor-pointer"
            aria-label="Close menu"
            onClick={closeMobile}
          />
          <aside className="relative z-10 flex flex-col w-[80%] max-w-[320px] h-full min-h-0 bg-[#12151F] border-r border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between h-14 shrink-0 px-3 border-b border-slate-800">
              <div>
                <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-indigo-400">
                  {brandSubtitle}
                </div>
                <div className="text-sm font-bold text-white truncate">{brandName}</div>
              </div>
              <button
                type="button"
                onClick={closeMobile}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {sidebarUserChip && (
              <div className="px-3 py-3 border-b border-slate-800 shrink-0">{sidebarUserChip}</div>
            )}
            {renderNav('mobile')}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col h-full">
        <header className="shrink-0 z-30 border-b border-slate-800 bg-[#12151F]/95 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-3 sm:px-5 h-14">
            <button
              type="button"
              className="md:hidden p-2 rounded-lg text-slate-300 hover:bg-slate-800 cursor-pointer"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm sm:text-base font-bold text-white truncate">{currentLabel}</h1>
              <p className="hidden sm:block text-[11px] text-slate-500 truncate">Account settings</p>
            </div>
            {headerActions}
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-5 lg:px-6 pt-3 pb-24 md:pb-8">
          <div className="space-y-6 w-full">{children}</div>
        </div>
      </div>
    </div>
  );
};
