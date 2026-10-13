import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { LogOut } from 'lucide-react';
import { Button } from '../ui/Button';
import { activeNavItems, audienceForUser } from './ConfiguredChrome';
import { childNavItems } from '../../../shared/appNav';
import { dispatchNavAction, isNavItemActive, navDomId, NavIcon, type NavDispatchContext } from '../../navigation/appNavConfig';

interface GlobalBottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onExitApp: () => void;
  onOpenMatch: () => void;
  onOpenChat: (userId?: string) => void;
  isChatOpen: boolean;
  isMatchOpen: boolean;
  onCloseOverlays: () => void;
}

export const GlobalBottomNav: React.FC<GlobalBottomNavProps> = ({
  activeTab,
  setActiveTab,
  onExitApp,
  onOpenMatch,
  onOpenChat,
  isChatOpen,
  isMatchOpen,
  onCloseOverlays,
}) => {
  const {
    currentUser,
    isLoggedIn,
    unreadMessagesCount,
    pendingFriendRequestsCount,
    missedCallsCount,
    markCallLogsSeen,
    appNavItems,
  } = useApp();
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  if (!isLoggedIn) {
    return null;
  }

  const navCtx: NavDispatchContext = {
    activeTab,
    isChatOpen,
    isMatchOpen,
    setActiveTab: (tab) => {
      if (tab === 'call_logs') markCallLogsSeen();
      onCloseOverlays();
      setActiveTab(tab);
    },
    onOpenMatch: () => {
      onCloseOverlays();
      onOpenMatch();
    },
    onOpenChat: () => {
      onCloseOverlays();
      if (!isChatOpen) onOpenChat();
    },
    onCloseMenus: onCloseOverlays,
    markCallLogsSeen,
  };
  const items = activeNavItems(appNavItems, audienceForUser(currentUser), 'mobile_bottom');

  const itemClass = (active: boolean) =>
    `flex flex-col items-center justify-center min-w-[3.25rem] px-2 py-1 rounded-full transition-all cursor-pointer ${
      active ? 'text-brand' : 'text-app-muted hover:text-app-heading'
    }`;

  const glow = (active: boolean) =>
    active ? 'drop-shadow-[0_0_8px_rgba(255,51,102,0.55)]' : '';

  const countFor = (badge: string) => {
    if (badge === 'unread_messages') return unreadMessagesCount;
    if (badge === 'missed_calls') return missedCallsCount;
    if (badge === 'friend_requests') return pendingFriendRequestsCount;
    return 0;
  };

  return (
    <>
      {openMenuId && (
        <button
          type="button"
          aria-label="Close submenu"
          className="md:hidden fixed inset-0 z-[8900] cursor-default bg-transparent"
          onClick={() => setOpenMenuId(null)}
        />
      )}
      <nav
        id="global-bottom-navigation-bar"
        className="md:hidden fixed bottom-0 left-0 right-0 z-[9000] pointer-events-none pb-[env(safe-area-inset-bottom)] px-2"
      >
        <div className="pointer-events-auto mx-auto max-w-lg flex items-center justify-center gap-1.5">
          <div className="flex items-center justify-around gap-0.5 px-1.5 py-1.5 rounded-full bg-chrome backdrop-blur-xl border border-hairline shadow-app-lg">
            {items.filter((navItem) => !navItem.parentId).map((navItem) => {
              const active = isNavItemActive(navItem, { activeTab, isChatOpen, isMatchOpen, bar: 'mobile_bottom' });
              const count = countFor(navItem.badge);
              const children = childNavItems(items, navItem.id, true);
              const menuOpen = openMenuId === navItem.id && children.length > 0;
              return (
                <div key={navItem.id} className="relative flex flex-col items-center">
                  {menuOpen && (
                      <div className="absolute bottom-full left-1/2 z-10 mb-2 flex -translate-x-1/2 flex-col-reverse items-center gap-1">
                      {children.map((child, index) => (
                        <button
                          key={child.id}
                          type="button"
                          title={child.label}
                          onClick={() => {
                            setOpenMenuId(null);
                            dispatchNavAction(child, navCtx);
                          }}
                          style={{ animationDelay: `${index * 40}ms` }}
                          className="flex min-w-[3.25rem] animate-in slide-in-from-bottom-2 fade-in flex-col items-center rounded-2xl border border-hairline bg-chrome px-2 py-1.5 text-app-heading shadow-app-lg"
                        >
                          <NavIcon name={child.icon} className="mb-0.5 h-5 w-5" />
                          <span className="text-[9px] font-medium leading-none">{child.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    id={navDomId(navItem) || navItem.id}
                    type="button"
                    onClick={() => {
                      if (children.length) {
                        setOpenMenuId((current) => (current === navItem.id ? null : navItem.id));
                        return;
                      }
                      dispatchNavAction(navItem, navCtx);
                    }}
                    className={`${itemClass(active || menuOpen || (navItem.actionTarget === 'chat' && unreadMessagesCount > 0))} relative`}
                    title={navItem.label}
                  >
                    <div className="relative">
                      <NavIcon name={navItem.icon} className={`w-5 h-5 mb-0.5 ${glow(active || menuOpen)}`} />
                      {count > 0 && (
                        <span className="absolute -top-1.5 -right-2.5 px-1 min-w-[14px] h-[14px] rounded-full bg-brand text-white text-[8px] font-bold flex items-center justify-center border-2 border-[var(--app-bg)]">
                          {count > 9 ? '9+' : count}
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] font-medium leading-none">{navItem.label}</span>
                  </button>
                </div>
              );
            })}
          </div>

          <button
            id="global-nav-exit"
            type="button"
            onClick={() => {
              onCloseOverlays();
              setShowExitConfirm(true);
            }}
            className={`${itemClass(false)} px-2.5 py-1.5 rounded-full bg-chrome backdrop-blur-xl border border-hairline shadow-app-lg`}
            title="Exit"
          >
            <LogOut className="w-5 h-5 mb-0.5" />
            <span className="text-[9px] font-medium leading-none">Exit</span>
          </button>
        </div>
      </nav>

      {showExitConfirm && (
        <div
          id="global-exit-confirm-overlay"
          className="md:hidden fixed inset-0 z-[9500] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="global-exit-confirm-title"
          onClick={() => setShowExitConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-app-surface border border-app shadow-app-lg p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <h2 id="global-exit-confirm-title" className="text-base font-bold text-app-heading">
                Exit application?
              </h2>
              <p className="text-xs text-app-muted leading-relaxed">
                Close the app if your browser allows it. Otherwise you will return to the home screen.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowExitConfirm(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                id="global-exit-confirm-exit"
                onClick={() => {
                  setShowExitConfirm(false);
                  onExitApp();
                }}
              >
                Exit
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
