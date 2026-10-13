/**
 * Profile sidebar nav — flat L1 items mirroring UserProfilePage profileSection keys.
 * buttonIds stay stable for automation (profile-*-tab-btn).
 */

export type ProfileSectionKey =
  | 'overview'
  | 'location'
  | 'edit_bio'
  | 'rates_earnings'
  | 'media'
  | 'security';

export type ProfileNavIconName =
  | 'User'
  | 'MapPin'
  | 'Edit3'
  | 'DollarSign'
  | 'Coins'
  | 'Camera'
  | 'KeyRound';

export interface ProfileNavItem {
  id: ProfileSectionKey;
  label: string;
  icon: ProfileNavIconName;
  buttonId?: string;
  /** Optional badge text shown next to the label (e.g. MOCK READY) */
  badge?: string;
}

export const PROFILE_NAV_ITEMS: ProfileNavItem[] = [
  {
    id: 'overview',
    label: 'Profile Overview',
    icon: 'User',
    buttonId: 'profile-overview-tab-btn',
  },
  {
    id: 'location',
    label: 'Location & Geolocation',
    icon: 'MapPin',
    buttonId: 'profile-location-tab-btn',
  },
  {
    id: 'edit_bio',
    label: 'Edit Bio & Info',
    icon: 'Edit3',
    buttonId: 'profile-edit-bio-tab-btn',
  },
  {
    id: 'rates_earnings',
    label: 'Wallet',
    icon: 'Coins',
    buttonId: 'profile-menu-host-earnings-btn',
  },
  {
    id: 'media',
    label: 'Gallery & Moments',
    icon: 'Camera',
    buttonId: 'profile-media-tab-btn',
  },
  {
    id: 'security',
    label: 'Security & Password',
    icon: 'KeyRound',
    buttonId: 'profile-security-tab-btn',
  },
];

export function findProfileNavItem(id: ProfileSectionKey): ProfileNavItem | undefined {
  return PROFILE_NAV_ITEMS.find((item) => item.id === id);
}

export function getProfileSectionLabel(
  id: ProfileSectionKey,
  items: ProfileNavItem[] = PROFILE_NAV_ITEMS
): string {
  return items.find((item) => item.id === id)?.label || 'Profile';
}
