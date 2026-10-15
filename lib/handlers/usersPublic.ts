const GALLERY_VIDEOS_SENTINEL_PREFIX = '__mc_gv1__:';

function splitGalleryPhotosAndVideos(gallery: unknown): { photos: string[]; videos: any[] | null } {
  const photos: string[] = [];
  let videos: any[] | null = null;
  if (!Array.isArray(gallery)) return { photos, videos };
  for (const item of gallery) {
    const s = String(item || '');
    if (s.startsWith(GALLERY_VIDEOS_SENTINEL_PREFIX)) {
      try {
        const parsed = JSON.parse(s.slice(GALLERY_VIDEOS_SENTINEL_PREFIX.length));
        videos = Array.isArray(parsed) ? parsed : [];
      } catch {
        videos = [];
      }
    } else if (s) {
      photos.push(s);
    }
  }
  return { photos, videos };
}

function resolveGalleryVideosFromRow(p: any): any[] {
  const fromCol = Array.isArray(p.gallery_videos)
    ? p.gallery_videos
    : Array.isArray(p.galleryVideos)
      ? p.galleryVideos
      : null;
  if (Array.isArray(fromCol) && fromCol.length > 0) return fromCol;
  const fromGallery = splitGalleryPhotosAndVideos(p.gallery).videos;
  if (Array.isArray(fromGallery) && fromGallery.length > 0) return fromGallery;
  return Array.isArray(fromCol) ? fromCol : [];
}

export function mapPublicProfileRow(p: any) {
  if (!p) return null;
  const split = splitGalleryPhotosAndVideos(Array.isArray(p.gallery) ? p.gallery : []);
  return {
    id: p.id,
    name: p.name || 'Member',
    gender: p.gender || 'male',
    age: Number(p.age) || 24,
    dob: p.dob || undefined,
    nationality: p.nationality || 'United States',
    countryCode: String(p.country_code || 'US').toUpperCase(),
    spokenLanguages: Array.isArray(p.spoken_languages) ? p.spoken_languages : ['English'],
    bio: p.bio || '',
    extendedBio: p.extended_bio || undefined,
    locationCity: p.location_city || undefined,
    zodiac: p.zodiac || undefined,
    interests: Array.isArray(p.interests) ? p.interests : [],
    tags: Array.isArray(p.tags) ? p.tags : [],
    interestedIn: Array.isArray(p.interested_in) ? p.interested_in : undefined,
    avatarUrl:
      p.avatar_url ||
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400',
    gallery: split.photos,
    galleryVideos: resolveGalleryVideosFromRow(p),
    introVideoUrl: p.intro_video_url || undefined,
    isVerified: Boolean(p.is_verified),
    onlineStatus: p.online_status || 'offline',
    role: p.role || 'male_user',
    responseRate: p.response_rate || undefined,
    hourlyCoinRate: Number(p.hourly_coin_rate) || 0,
    ratingScore: p.rating_score != null ? Number(p.rating_score) : undefined,
    totalReviewsCount: p.total_reviews_count != null ? Number(p.total_reviews_count) : undefined,
    totalCallsHosted: p.total_calls_hosted != null ? Number(p.total_calls_hosted) : undefined,
    exactLocation:
      p.exact_location ||
      (p.latitude != null && p.longitude != null
        ? {
            latitude: Number(p.latitude),
            longitude: Number(p.longitude),
            city: p.location_city || undefined,
            countryCode: p.country_code ? String(p.country_code).toUpperCase() : undefined,
          }
        : undefined),
    isUsingMockLocation: Boolean(p.is_using_mock_location),
    mockLocationCity: p.mock_location_city || undefined,
    mockLocationCountry: p.mock_location_country || undefined,
    mockLocationCountryCode: p.mock_location_country_code || undefined,
    createdAt: p.created_at,
  };
}

export const PUBLIC_PROFILE_SELECT = [
  'id',
  'name',
  'gender',
  'age',
  'dob',
  'nationality',
  'country_code',
  'spoken_languages',
  'bio',
  'extended_bio',
  'location_city',
  'zodiac',
  'interests',
  'tags',
  'interested_in',
  'avatar_url',
  'gallery',
  'gallery_videos',
  'intro_video_url',
  'is_verified',
  'online_status',
  'role',
  'response_rate',
  'hourly_coin_rate',
  'rating_score',
  'total_reviews_count',
  'total_calls_hosted',
  'latitude',
  'longitude',
  'is_using_mock_location',
  'mock_location_city',
  'mock_location_country',
  'created_at',
  'is_banned',
].join(', ');
