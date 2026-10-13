import React from 'react';
import {
  Circle,
  Coins,
  Compass,
  Crown,
  DollarSign,
  Download,
  Flame,
  Gift,
  Home,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  LogIn,
  LogOut,
  Menu,
  MessageCircle,
  PhoneCall,
  Settings,
  Sparkles,
  TrendingUp,
  User,
  UserPlus,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { AppNavItem } from '../../shared/appNav';

export const NAV_ICON_MAP: Record<string, LucideIcon> = {
  Circle,
  Coins,
  Compass,
  Crown,
  DollarSign,
  Download,
  Flame,
  Gift,
  Home,
  Image: ImageIcon,
  Layers,
  LayoutGrid,
  LogIn,
  LogOut,
  Menu,
  MessageCircle,
  PhoneCall,
  Settings,
  Sparkles,
  TrendingUp,
  User,
  UserPlus,
  Users,
  Zap,
};

export const NAV_ICON_NAMES = Object.keys(NAV_ICON_MAP);

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = NAV_ICON_MAP[name] || Circle;
  return <Icon className={className} />;
}

const DOM_IDS: Record<string, string> = {
  'main_header|left|home': 'nav-home-tab',
  'main_header|left|admin': 'nav-admin-tab',
  'main_header|right|daily_rewards': 'header-daily-rewards-btn',
  'main_header|right|store': 'header-coin-store-btn',
  'main_header|right|team_leader': 'header-leader-guild-pill',
  'logged_out_header|default|auth_login': 'header-signin-btn',
  'logged_out_header|default|auth_register': 'header-register-btn',
  'subheader|default|discovery': 'subheader-discovery-tab',
  'subheader|default|swipe': 'subheader-swipe-tab',
  'subheader|default|moments': 'subheader-moments-tab',
  'subheader|default|match': 'subheader-match-btn',
  'subheader|default|chat': 'subheader-chat-btn',
  'subheader|default|call_logs': 'subheader-call-logs-tab',
  'subheader|default|friend_requests': 'subheader-friend-requests-btn',
  'subheader|default|social_circle': 'subheader-social-circle-btn',
  'mobile_bottom|default|home': 'global-nav-home',
  'mobile_bottom|default|discovery': 'global-nav-discovery',
  'mobile_bottom|default|match': 'global-nav-match',
  'mobile_bottom|default|chat': 'global-nav-chat',
  'mobile_bottom|default|profile': 'global-nav-profile',
  'mobile_bottom|default|call_logs': 'global-nav-call-logs',
  'mobile_bottom|default|team_leader': 'global-nav-team-leader',
  'mobile_bottom|default|admin': 'global-nav-admin',
  'persona_menu|default|profile': 'persona-open-profile-btn',
  'persona_menu|default|earnings': 'persona-open-analytics-btn',
  'persona_menu|default|social_circle': 'persona-open-social-btn',
  'persona_menu|default|install_pwa': 'persona-install-app-btn',
  'persona_menu|default|logout': 'persona-logout-btn',
};

export function navDomId(item: AppNavItem): string | undefined {
  return DOM_IDS[`${item.bar}|${item.slot}|${item.actionTarget}`];
}

export interface NavDispatchContext {
  activeTab: string;
  isChatOpen?: boolean;
  isMatchOpen?: boolean;
  setActiveTab: (tab: string) => void;
  onOpenStore?: () => void;
  onOpenAuth?: (mode?: 'login' | 'register') => void;
  onOpenSocialCircle?: () => void;
  onOpenChat?: (userId?: string) => void;
  onOpenMatch?: () => void;
  onOpenRewards?: () => void;
  onLogout?: () => void;
  onStatus?: (status: 'online' | 'busy' | 'offline') => void;
  onExit?: () => void;
  onCloseMenus?: () => void;
  markCallLogsSeen?: () => void;
}

export function dispatchNavAction(item: AppNavItem, ctx: NavDispatchContext) {
  const target = item.actionTarget;
  if (target === 'none') return;
  ctx.onCloseMenus?.();
  if (target === 'call_logs') ctx.markCallLogsSeen?.();
  if (item.actionType === 'tab' || target === 'home' && item.bar === 'brand') {
    ctx.setActiveTab(target);
    return;
  }
  switch (target) {
    case 'match':
      ctx.onOpenMatch?.();
      return;
    case 'chat':
      ctx.onOpenChat?.();
      return;
    case 'social_circle':
    case 'friend_requests':
      if (ctx.onOpenSocialCircle) ctx.onOpenSocialCircle();
      else ctx.onOpenChat?.();
      return;
    case 'store':
      ctx.onOpenStore?.();
      return;
    case 'daily_rewards':
      ctx.onOpenRewards?.();
      return;
    case 'auth_login':
      ctx.onOpenAuth?.('login');
      return;
    case 'auth_register':
      ctx.onOpenAuth?.('register');
      return;
    case 'logout':
      ctx.onLogout?.();
      ctx.setActiveTab('home');
      return;
    case 'status_online':
      ctx.onStatus?.('online');
      return;
    case 'status_busy':
      ctx.onStatus?.('busy');
      return;
    case 'status_offline':
      ctx.onStatus?.('offline');
      return;
    case 'install_pwa':
      localStorage.removeItem('livecall_pwa_dismissed');
      window.location.reload();
      return;
    case 'exit':
      ctx.onExit?.();
      return;
    default:
      break;
  }
}

export function isNavItemActive(item: AppNavItem, ctx: { activeTab: string; isChatOpen?: boolean; isMatchOpen?: boolean; bar?: string }) {
  const overlays = Boolean(ctx.isChatOpen || ctx.isMatchOpen);
  if (item.actionTarget === 'match') return Boolean(ctx.isMatchOpen);
  if (item.actionTarget === 'chat') return Boolean(ctx.isChatOpen);
  if (item.actionType !== 'tab') return false;
  const tabMatch =
    ctx.activeTab === item.actionTarget ||
    (ctx.bar === 'mobile_bottom' && item.actionTarget === 'discovery' && ctx.activeTab === 'swipe');
  return tabMatch && !overlays;
}
