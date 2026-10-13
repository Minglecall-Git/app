/**
 * Public peer profile fetch (sanitized dating fields only).
 */
import { authFetch } from '../utils/apiClient';
import type { GalleryVideoItem, OnlineStatus, UserGender, UserProfile, UserRole } from '../types';

export type PublicProfileDto = Pick<
  UserProfile,
  | 'id'
  | 'name'
  | 'gender'
  | 'age'
  | 'nationality'
  | 'countryCode'
  | 'spokenLanguages'
  | 'bio'
  | 'interests'
  | 'avatarUrl'
  | 'gallery'
  | 'isVerified'
  | 'onlineStatus'
  | 'role'
  | 'hourlyCoinRate'
  | 'createdAt'
> & {
  dob?: string;
  extendedBio?: string;
  locationCity?: string;
  zodiac?: string;
  tags?: string[];
  interestedIn?: string[];
  galleryVideos?: GalleryVideoItem[];
  introVideoUrl?: string;
  responseRate?: string;
  ratingScore?: number;
  totalReviewsCount?: number;
  totalCallsHosted?: number;
  exactLocation?: UserProfile['exactLocation'];
  isUsingMockLocation?: boolean;
  mockLocationCity?: string;
  mockLocationCountry?: string;
  mockLocationCountryCode?: string;
};

/** Map sanitized public DTO into a UserProfile-shaped object for UI reuse. */
export function publicProfileToUserProfile(dto: PublicProfileDto): UserProfile {
  return {
    id: dto.id,
    name: dto.name || 'Member',
    email: '',
    gender: (dto.gender || 'male') as UserGender,
    genderLocked: true,
    age: Number(dto.age) || 24,
    dob: dto.dob || '2000-01-01',
    nationality: dto.nationality || 'United States',
    countryCode: String(dto.countryCode || 'US').toUpperCase(),
    spokenLanguages: Array.isArray(dto.spokenLanguages) ? dto.spokenLanguages : ['English'],
    bio: dto.bio || '',
    extendedBio: dto.extendedBio,
    locationCity: dto.locationCity,
    zodiac: dto.zodiac,
    interests: Array.isArray(dto.interests) ? dto.interests : [],
    tags: Array.isArray(dto.tags) ? dto.tags : [],
    interestedIn: dto.interestedIn,
    avatarUrl: dto.avatarUrl || '',
    gallery: Array.isArray(dto.gallery) ? dto.gallery : [],
    galleryVideos: Array.isArray(dto.galleryVideos) ? dto.galleryVideos : [],
    introVideoUrl: dto.introVideoUrl,
    isVerified: Boolean(dto.isVerified),
    onlineStatus: (dto.onlineStatus || 'offline') as OnlineStatus,
    role: (dto.role || 'male_user') as UserRole,
    createdAt: dto.createdAt || new Date().toISOString(),
    responseRate: dto.responseRate,
    coinBalance: 0,
    hourlyCoinRate: Number(dto.hourlyCoinRate) || 0,
    earningsCoins: 0,
    totalLifetimeEarnedUSD: 0,
    ratingScore: dto.ratingScore,
    totalReviewsCount: dto.totalReviewsCount,
    totalCallsHosted: dto.totalCallsHosted,
    exactLocation: dto.exactLocation,
    isUsingMockLocation: dto.isUsingMockLocation,
    mockLocationCity: dto.mockLocationCity,
    mockLocationCountry: dto.mockLocationCountry,
    mockLocationCountryCode: dto.mockLocationCountryCode,
  };
}

export async function fetchPublicProfile(userId: string): Promise<PublicProfileDto | null> {
  const id = String(userId || '').trim();
  if (!id) return null;
  try {
    const res = await authFetch(`/api/v1/users/${encodeURIComponent(id)}/public`);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.success || !json?.data?.user) return null;
    return json.data.user as PublicProfileDto;
  } catch (err) {
    console.error('[fetchPublicProfile]', err);
    return null;
  }
}
