/**
 * App chrome navigation catalog, validation, and parity defaults.
 * Used by Express admin CMS routes and the React client.
 */

export type NavAudienceRole =
  | 'admin'
  | 'team_leader'
  | 'male_user'
  | 'female_user'
  | 'female_host'
  | 'guest'
  | '*';

export type NavBarId =
  | 'main_header'
  | 'subheader'
  | 'mobile_bottom'
  | 'persona_menu'
  | 'logged_out_header'
  | 'brand';

export type NavSlot = 'left' | 'right' | 'default';

export type NavActionType = 'tab' | 'modal' | 'overlay' | 'system' | 'auth';

export type NavBadge =
  | 'none'
  | 'unread_messages'
  | 'missed_calls'
  | 'friend_requests'
  | 'unclaimed_rewards'
  | 'coin_balance';

export interface AppNavMeta {
  markText?: string;
  wordmarkPrimary?: string;
  wordmarkAccent?: string;
  imageUrl?: string;
  showMark?: boolean;
  showWordmark?: boolean;
  /** Visual cluster inside a bar (e.g. subheader primary vs secondary). */
  group?: 'primary' | 'secondary';
}

export interface AppNavItem {
  id: string;
  audienceRole: NavAudienceRole;
  bar: NavBarId;
  slot: NavSlot;
  label: string;
  icon: string;
  actionType: NavActionType;
  actionTarget: string;
  badge: NavBadge;
  meta: AppNavMeta | null;
  order: number;
  active: boolean;
  /** Set on a second-level item. Null for top-level buttons. */
  parentId: string | null;
}

export const NAV_AUDIENCE_ROLES: NavAudienceRole[] = [
  'admin',
  'team_leader',
  'male_user',
  'female_user',
  'female_host',
  'guest',
  '*',
];

export const NAV_SIGNED_IN_ROLES: NavAudienceRole[] = [
  'admin',
  'team_leader',
  'male_user',
  'female_user',
  'female_host',
];

export const NAV_BARS: NavBarId[] = [
  'brand',
  'main_header',
  'logged_out_header',
  'subheader',
  'mobile_bottom',
  'persona_menu',
];

export const NAV_ACTION_TYPES = new Set<NavActionType>(['tab', 'modal', 'overlay', 'system', 'auth']);

export const NAV_BADGES = new Set<NavBadge>([
  'none',
  'unread_messages',
  'missed_calls',
  'friend_requests',
  'unclaimed_rewards',
  'coin_balance',
]);

export interface NavDestination {
  id: string;
  label: string;
  icon: string;
  actionType: NavActionType;
  actionTarget: string;
  badge: NavBadge;
  /** Bars this destination may be placed on. */
  bars: NavBarId[];
}

export const NAV_DESTINATIONS: NavDestination[] = [
  { id: 'home', label: 'Home', icon: 'Home', actionType: 'tab', actionTarget: 'home', badge: 'none', bars: ['main_header', 'subheader', 'mobile_bottom', 'persona_menu', 'brand'] },
  { id: 'discovery', label: 'Discover', icon: 'LayoutGrid', actionType: 'tab', actionTarget: 'discovery', badge: 'none', bars: ['main_header', 'subheader', 'mobile_bottom', 'persona_menu'] },
  { id: 'swipe', label: 'Swipe', icon: 'Layers', actionType: 'tab', actionTarget: 'swipe', badge: 'none', bars: ['main_header', 'subheader', 'mobile_bottom', 'persona_menu'] },
  { id: 'moments', label: 'Moments', icon: 'Image', actionType: 'tab', actionTarget: 'moments', badge: 'none', bars: ['main_header', 'subheader', 'mobile_bottom', 'persona_menu'] },
  { id: 'profile', label: 'Profile', icon: 'User', actionType: 'tab', actionTarget: 'profile', badge: 'none', bars: ['main_header', 'subheader', 'mobile_bottom', 'persona_menu'] },
  { id: 'call_logs', label: 'Calls', icon: 'PhoneCall', actionType: 'tab', actionTarget: 'call_logs', badge: 'missed_calls', bars: ['main_header', 'subheader', 'mobile_bottom', 'persona_menu'] },
  { id: 'earnings', label: 'Earnings', icon: 'DollarSign', actionType: 'tab', actionTarget: 'earnings', badge: 'none', bars: ['main_header', 'subheader', 'mobile_bottom', 'persona_menu'] },
  { id: 'team_leader', label: 'Agency', icon: 'Crown', actionType: 'tab', actionTarget: 'team_leader', badge: 'none', bars: ['main_header', 'subheader', 'mobile_bottom', 'persona_menu'] },
  { id: 'admin', label: 'Admin', icon: 'Settings', actionType: 'tab', actionTarget: 'admin', badge: 'none', bars: ['main_header', 'subheader', 'mobile_bottom', 'persona_menu'] },
  { id: 'match', label: 'Match', icon: 'Zap', actionType: 'overlay', actionTarget: 'match', badge: 'none', bars: ['main_header', 'subheader', 'mobile_bottom', 'persona_menu'] },
  { id: 'chat', label: 'Chat', icon: 'MessageCircle', actionType: 'overlay', actionTarget: 'chat', badge: 'unread_messages', bars: ['main_header', 'subheader', 'mobile_bottom', 'persona_menu'] },
  { id: 'social_circle', label: 'Circle', icon: 'Users', actionType: 'overlay', actionTarget: 'social_circle', badge: 'none', bars: ['main_header', 'subheader', 'mobile_bottom', 'persona_menu'] },
  { id: 'friend_requests', label: 'Friends', icon: 'UserPlus', actionType: 'overlay', actionTarget: 'friend_requests', badge: 'friend_requests', bars: ['main_header', 'subheader', 'mobile_bottom', 'persona_menu'] },
  { id: 'daily_rewards', label: 'Rewards', icon: 'Gift', actionType: 'modal', actionTarget: 'daily_rewards', badge: 'unclaimed_rewards', bars: ['main_header', 'subheader', 'mobile_bottom', 'persona_menu'] },
  { id: 'store', label: 'Coins', icon: 'Coins', actionType: 'modal', actionTarget: 'store', badge: 'coin_balance', bars: ['main_header', 'subheader', 'mobile_bottom', 'persona_menu'] },
  { id: 'auth_login', label: 'Sign In', icon: 'LogIn', actionType: 'auth', actionTarget: 'auth_login', badge: 'none', bars: ['logged_out_header', 'main_header'] },
  { id: 'auth_register', label: 'Join free', icon: 'UserPlus', actionType: 'auth', actionTarget: 'auth_register', badge: 'none', bars: ['logged_out_header', 'main_header'] },
  { id: 'logout', label: 'Log Out', icon: 'LogOut', actionType: 'system', actionTarget: 'logout', badge: 'none', bars: ['persona_menu', 'mobile_bottom', 'main_header'] },
  { id: 'status_online', label: 'Available', icon: 'Circle', actionType: 'system', actionTarget: 'status_online', badge: 'none', bars: ['persona_menu'] },
  { id: 'status_busy', label: 'Busy', icon: 'Circle', actionType: 'system', actionTarget: 'status_busy', badge: 'none', bars: ['persona_menu'] },
  { id: 'status_offline', label: 'Offline', icon: 'Circle', actionType: 'system', actionTarget: 'status_offline', badge: 'none', bars: ['persona_menu'] },
  { id: 'install_pwa', label: 'Install app', icon: 'Download', actionType: 'system', actionTarget: 'install_pwa', badge: 'none', bars: ['persona_menu', 'main_header'] },
  { id: 'exit', label: 'Exit', icon: 'LogOut', actionType: 'system', actionTarget: 'exit', badge: 'none', bars: ['mobile_bottom'] },
  { id: 'none', label: 'More', icon: 'Menu', actionType: 'system', actionTarget: 'none', badge: 'none', bars: ['main_header', 'subheader', 'mobile_bottom'] },
];

const DEST_BY_TARGET = new Map(NAV_DESTINATIONS.map((d) => [d.actionTarget, d]));

export function isNavAudienceRole(value: string): value is NavAudienceRole {
  return (NAV_AUDIENCE_ROLES as string[]).includes(value);
}

export function isNavBarId(value: string): value is NavBarId {
  return (NAV_BARS as string[]).includes(value);
}

export function validateNavItem(input: Partial<AppNavItem>): string | null {
  const audience = String(input.audienceRole || '');
  const bar = String(input.bar || '');
  const slot = String(input.slot || 'default');
  const actionType = String(input.actionType || '') as NavActionType;
  const actionTarget = String(input.actionTarget || '').trim();
  const label = String(input.label || '').trim();
  const badge = String(input.badge || 'none') as NavBadge;

  if (!isNavAudienceRole(audience)) return 'Invalid audience role';
  if (!isNavBarId(bar)) return 'Invalid navigation bar';
  if (slot !== 'left' && slot !== 'right' && slot !== 'default') return 'Invalid slot';
  if (bar === 'main_header' && slot === 'default') return 'Main header items must use left or right slot';
  if (bar !== 'main_header' && slot !== 'default') return 'Only the main header uses left/right slots';
  if (bar === 'brand' && audience !== '*') return 'Brand rows must use audience *';
  if (bar === 'logged_out_header' && audience !== 'guest') return 'Logged-out header must use the guest audience';
  if (bar !== 'brand' && bar !== 'logged_out_header' && (audience === '*' || audience === 'guest')) {
    return 'Signed-in bars require a signed-in audience role';
  }
  if (!label) return 'Label is required';
  if (label.length > 40) return 'Label must be 40 characters or fewer';
  if (!NAV_ACTION_TYPES.has(actionType)) return 'Invalid action type';
  if (!actionTarget) return 'Action target is required';
  if (!NAV_BADGES.has(badge)) return 'Invalid badge';

  const dest = DEST_BY_TARGET.get(actionTarget);
  if (!dest) return `Unknown action target: ${actionTarget}`;
  if (dest.actionType !== actionType) return `Action type for ${actionTarget} must be ${dest.actionType}`;
  if (!dest.bars.includes(bar) && bar !== 'brand') return `${actionTarget} cannot be placed on ${bar}`;
  if (bar === 'brand' && actionType !== 'tab') return 'Brand click target must be a tab';
  return null;
}

export const NAV_SUBMENU_BARS = new Set<NavBarId>(['main_header', 'subheader', 'mobile_bottom']);

/** One child level. Children must match the parent slice. */
export function validateNavSlice(items: AppNavItem[]): string | null {
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const item of items) {
    if (!item.parentId) continue;
    if (item.actionTarget === 'none') return 'A submenu item must navigate somewhere';
    const parent = byId.get(item.parentId);
    if (!parent) return 'Submenu item must belong to a button in the same bar';
    if (parent.parentId) return 'Submenus can only be one level deep';
    if (!NAV_SUBMENU_BARS.has(item.bar)) return 'This bar does not support submenus';
    if (parent.audienceRole !== item.audienceRole || parent.bar !== item.bar || parent.slot !== item.slot) {
      return 'Submenu item must stay on the same bar as its parent';
    }
  }
  return null;
}

export function topLevelNavItems(items: AppNavItem[]): AppNavItem[] {
  return items
    .filter((item) => !item.parentId)
    .slice()
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

export function childNavItems(items: AppNavItem[], parentId: string, activeOnly = false): AppNavItem[] {
  return items
    .filter((item) => item.parentId === parentId && (!activeOnly || item.active))
    .slice()
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

export function resolveAudienceRole(user?: {
  role?: string | null;
  gender?: string | null;
} | null): NavAudienceRole {
  const role = String(user?.role || '');
  if (role === 'admin') return 'admin';
  if (role === 'team_leader' || role === 'agency_manager') return 'team_leader';
  if (role === 'female_creator' || role === 'female_host') return 'female_host';
  if (role === 'female_user') return 'female_user';
  if (role === 'male_user') return 'male_user';
  if (user?.gender === 'female') return 'female_user';
  return 'male_user';
}

function navItem(
  audienceRole: NavAudienceRole,
  bar: NavBarId,
  slot: NavSlot,
  actionTarget: string,
  order: number,
  overrides: Partial<Pick<AppNavItem, 'label' | 'icon' | 'badge' | 'meta' | 'active'>> = {}
): AppNavItem {
  const dest = DEST_BY_TARGET.get(actionTarget);
  if (!dest) throw new Error(`Missing nav destination ${actionTarget}`);
  const id =
    bar === 'brand'
      ? 'brand_global'
      : `nav_${audienceRole}_${bar}_${slot}_${actionTarget}`;
  return {
    id,
    audienceRole,
    bar,
    slot,
    label: overrides.label ?? dest.label,
    icon: overrides.icon ?? dest.icon,
    actionType: dest.actionType,
    actionTarget,
    badge: overrides.badge ?? dest.badge,
    meta: overrides.meta ?? null,
    order,
    active: overrides.active ?? true,
    parentId: null,
  };
}

const SUBHEADER: Array<{ target: string; label?: string; icon?: string; group: 'primary' | 'secondary' }> = [
  { target: 'discovery', label: 'Discover', icon: 'LayoutGrid', group: 'primary' },
  { target: 'swipe', label: 'Swipe', icon: 'Layers', group: 'primary' },
  { target: 'moments', label: 'Moments', icon: 'Image', group: 'primary' },
  { target: 'match', label: 'Match', icon: 'Zap', group: 'primary' },
  { target: 'chat', label: 'Chat', icon: 'MessageCircle', group: 'primary' },
  { target: 'call_logs', label: 'Calls', icon: 'PhoneCall', group: 'secondary' },
  { target: 'friend_requests', label: 'Friends', icon: 'UserPlus', group: 'secondary' },
  { target: 'social_circle', label: 'Circle', icon: 'Users', group: 'secondary' },
];

function subheaderFor(role: NavAudienceRole): AppNavItem[] {
  return SUBHEADER.map((entry, index) =>
    navItem(role, 'subheader', 'default', entry.target, index + 1, {
      label: entry.label,
      icon: entry.icon,
      meta: { group: entry.group },
    })
  );
}

function personaFor(role: NavAudienceRole): AppNavItem[] {
  const earningsLabel =
    role === 'female_host' || role === 'team_leader'
      ? 'Earnings & Analytics'
      : role === 'female_user'
        ? 'Activity & Performance'
        : 'Spending & Analytics';
  const rows: AppNavItem[] = [
    navItem(role, 'persona_menu', 'default', 'status_online', 1, { label: 'Available' }),
    navItem(role, 'persona_menu', 'default', 'status_busy', 2, { label: 'Busy' }),
    navItem(role, 'persona_menu', 'default', 'status_offline', 3, { label: 'Offline' }),
    navItem(role, 'persona_menu', 'default', 'profile', 4, { label: 'Profile' }),
    navItem(role, 'persona_menu', 'default', 'earnings', 5, { label: earningsLabel, icon: role === 'male_user' || role === 'admin' ? 'TrendingUp' : 'DollarSign' }),
    navItem(role, 'persona_menu', 'default', 'social_circle', 6, { label: 'Friends & Social Circle', icon: 'Users' }),
    navItem(role, 'persona_menu', 'default', 'install_pwa', 7, { label: 'Install LiveCall PWA App', icon: 'Download' }),
    navItem(role, 'persona_menu', 'default', 'logout', 8, { label: 'Log Out', icon: 'LogOut' }),
  ];
  if (role === 'male_user' || role === 'admin') {
    rows.splice(3, 0, navItem(role, 'persona_menu', 'default', 'store', 0, { label: 'Top Up', icon: 'Coins', badge: 'coin_balance' }));
  }
  return rows.map((row, index) => ({ ...row, order: index + 1 }));
}

function mobileFor(role: NavAudienceRole): AppNavItem[] {
  const targets = ['home', 'discovery', 'match', 'chat', 'profile'];
  if (role === 'female_user' || role === 'female_host' || role === 'admin' || role === 'team_leader') {
    targets.push('call_logs');
  }
  if (role === 'team_leader') targets.push('team_leader');
  if (role === 'admin') targets.push('admin');
  return targets.map((target, index) => {
    const label =
      target === 'home' ? 'Home'
      : target === 'discovery' ? 'Discover'
      : target === 'match' ? 'Match'
      : target === 'chat' ? 'Chat'
      : target === 'profile' ? 'Profile'
      : target === 'call_logs' ? 'Logs'
      : target === 'team_leader' ? 'Agency'
      : 'Admin';
    const icon =
      target === 'discovery' ? 'Compass'
      : target === 'match' ? 'Flame'
      : target === 'home' ? 'Home'
      : undefined;
    return navItem(role, 'mobile_bottom', 'default', target, index + 1, { label, icon });
  });
}

function mainHeaderFor(role: NavAudienceRole): AppNavItem[] {
  const left: AppNavItem[] = [
    navItem(role, 'main_header', 'left', 'home', 1, { label: 'Home', icon: 'Home' }),
  ];
  if (role === 'admin') {
    left.push(navItem(role, 'main_header', 'left', 'admin', 2, { label: 'Admin', icon: 'Settings' }));
  }
  const right: AppNavItem[] = [
    navItem(role, 'main_header', 'right', 'daily_rewards', 1, { label: 'Rewards', icon: 'Gift', badge: 'unclaimed_rewards' }),
  ];
  if (role === 'male_user' || role === 'admin') {
    right.push(navItem(role, 'main_header', 'right', 'store', 2, { label: 'Buy', icon: 'Coins', badge: 'coin_balance' }));
  }
  if (role === 'team_leader') {
    right.push(navItem(role, 'main_header', 'right', 'team_leader', 2, { label: 'Agency', icon: 'Crown' }));
  }
  return [...left, ...right];
}

export function buildDefaultAppNavItems(): AppNavItem[] {
  const brand: AppNavItem = {
    id: 'brand_global',
    audienceRole: '*',
    bar: 'brand',
    slot: 'default',
    label: 'Minglecall',
    icon: 'Sparkles',
    actionType: 'tab',
    actionTarget: 'home',
    badge: 'none',
    meta: {
      markText: 'M',
      wordmarkPrimary: 'Mingle',
      wordmarkAccent: 'call',
      imageUrl: '',
      showMark: true,
      showWordmark: true,
    },
    order: 0,
    active: true,
    parentId: null,
  };

  const guest: AppNavItem[] = [
    navItem('guest', 'logged_out_header', 'default', 'auth_login', 1, { label: 'Sign In', icon: 'LogIn' }),
    navItem('guest', 'logged_out_header', 'default', 'auth_register', 2, { label: 'Join free', icon: 'UserPlus' }),
  ];

  const signedIn = NAV_SIGNED_IN_ROLES.flatMap((role) => [
    ...mainHeaderFor(role),
    ...subheaderFor(role),
    ...mobileFor(role),
    ...personaFor(role),
  ]);

  return [brand, ...guest, ...signedIn];
}

export const INITIAL_APP_NAV_ITEMS: AppNavItem[] = buildDefaultAppNavItems();

/** Keep saved slices from the DB; fill any missing audience+bar from defaults. */
export function mergeNavWithDefaults(dbItems: AppNavItem[]): AppNavItem[] {
  if (!dbItems.length) return INITIAL_APP_NAV_ITEMS.map((item) => ({ ...item, meta: item.meta ? { ...item.meta } : null }));
  const covered = new Set(dbItems.map((item) => `${item.audienceRole}|${item.bar}`));
  const fillers = INITIAL_APP_NAV_ITEMS.filter((item) => !covered.has(`${item.audienceRole}|${item.bar}`));
  return [...dbItems, ...fillers];
}

export function sliceKey(audienceRole: string, bar: string, slot?: string | null): string {
  return slot ? `${audienceRole}|${bar}|${slot}` : `${audienceRole}|${bar}`;
}

export function itemsForSlice(
  items: AppNavItem[],
  audienceRole: NavAudienceRole,
  bar: NavBarId,
  slot?: NavSlot | null
): AppNavItem[] {
  return items
    .filter((item) => item.audienceRole === audienceRole && item.bar === bar && (slot ? item.slot === slot : true))
    .slice()
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

export function mapNavRow(row: any): AppNavItem {
  const meta = row?.meta && typeof row.meta === 'object' ? row.meta : null;
  return {
    id: String(row.id),
    audienceRole: row.audience_role,
    bar: row.bar,
    slot: row.slot || 'default',
    label: row.label || '',
    icon: row.icon || 'Circle',
    actionType: row.action_type || 'tab',
    actionTarget: row.action_target || 'home',
    badge: row.badge || 'none',
    meta,
    order: Number(row.order_num ?? 0),
    active: row.active ?? true,
    parentId: row.parent_id || row.parentId || null,
  };
}

export function navItemToRow(item: AppNavItem) {
  return {
    id: item.id,
    audience_role: item.audienceRole,
    bar: item.bar,
    slot: item.slot || 'default',
    label: item.label,
    icon: item.icon || 'Circle',
    action_type: item.actionType,
    action_target: item.actionTarget,
    badge: item.badge || 'none',
    meta: item.meta || null,
    order_num: Number(item.order ?? 0),
    active: item.active ?? true,
    parent_id: item.parentId || null,
    updated_at: new Date().toISOString(),
  };
}

export function normalizeNavPayload(raw: any, fallback?: Partial<AppNavItem>): AppNavItem | { error: string } {
  const dest = DEST_BY_TARGET.get(String(raw?.actionTarget || raw?.action_target || fallback?.actionTarget || ''));
  const item: AppNavItem = {
    id: String(raw?.id || fallback?.id || `nav_${Date.now()}`),
    audienceRole: (raw?.audienceRole || raw?.audience_role || fallback?.audienceRole) as NavAudienceRole,
    bar: (raw?.bar || fallback?.bar) as NavBarId,
    slot: (raw?.slot || fallback?.slot || 'default') as NavSlot,
    label: String(raw?.label ?? fallback?.label ?? dest?.label ?? '').trim(),
    icon: String(raw?.icon || fallback?.icon || dest?.icon || 'Circle'),
    actionType: (raw?.actionType || raw?.action_type || fallback?.actionType || dest?.actionType) as NavActionType,
    actionTarget: String(raw?.actionTarget || raw?.action_target || fallback?.actionTarget || ''),
    badge: (raw?.badge || fallback?.badge || dest?.badge || 'none') as NavBadge,
    meta: raw?.meta ?? fallback?.meta ?? null,
    order: Number(raw?.order ?? raw?.order_num ?? fallback?.order ?? 0),
    active: raw?.active ?? fallback?.active ?? true,
    parentId: raw?.parentId || raw?.parent_id || fallback?.parentId || null,
  };
  const error = validateNavItem(item);
  if (error) return { error };
  return item;
}
