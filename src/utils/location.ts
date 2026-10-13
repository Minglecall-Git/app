import { UserProfile } from '../types';
import { getCountryFlag } from './flags';

export interface LocationPreset {
  id: string;
  city: string;
  country: string;
  countryCode: string;
  region: string;
  latitude: number;
  longitude: number;
  popularRank?: number;
  flag: string;
}

export const POPULAR_MOCK_LOCATIONS: LocationPreset[] = [
  { id: 'us-mia', city: 'Miami', country: 'United States', countryCode: 'US', region: 'North America', latitude: 25.7617, longitude: -80.1918, popularRank: 1, flag: '🇺🇸' },
  { id: 'us-nyc', city: 'New York', country: 'United States', countryCode: 'US', region: 'North America', latitude: 40.7128, longitude: -74.0060, popularRank: 2, flag: '🇺🇸' },
  { id: 'us-la', city: 'Los Angeles', country: 'United States', countryCode: 'US', region: 'North America', latitude: 34.0522, longitude: -118.2437, popularRank: 3, flag: '🇺🇸' },
  { id: 'us-lv', city: 'Las Vegas', country: 'United States', countryCode: 'US', region: 'North America', latitude: 36.1699, longitude: -115.1398, popularRank: 4, flag: '🇺🇸' },
  { id: 'es-mad', city: 'Madrid', country: 'Spain', countryCode: 'ES', region: 'Europe', latitude: 40.4168, longitude: -3.7038, popularRank: 5, flag: '🇪🇸' },
  { id: 'es-bcn', city: 'Barcelona', country: 'Spain', countryCode: 'ES', region: 'Europe', latitude: 41.3879, longitude: 2.1699, popularRank: 6, flag: '🇪🇸' },
  { id: 'fr-par', city: 'Paris', country: 'France', countryCode: 'FR', region: 'Europe', latitude: 48.8566, longitude: 2.3522, popularRank: 7, flag: '🇫🇷' },
  { id: 'gb-lon', city: 'London', country: 'United Kingdom', countryCode: 'GB', region: 'Europe', latitude: 51.5074, longitude: -0.1278, popularRank: 8, flag: '🇬🇧' },
  { id: 'jp-tyo', city: 'Tokyo', country: 'Japan', countryCode: 'JP', region: 'Asia', latitude: 35.6762, longitude: 139.6503, popularRank: 9, flag: '🇯🇵' },
  { id: 'kr-sel', city: 'Seoul', country: 'South Korea', countryCode: 'KR', region: 'Asia', latitude: 37.5665, longitude: 126.9780, popularRank: 10, flag: '🇰🇷' },
  { id: 'ae-dxb', city: 'Dubai', country: 'United Arab Emirates', countryCode: 'AE', region: 'Middle East', latitude: 25.2048, longitude: 55.2708, popularRank: 11, flag: '🇦🇪' },
  { id: 'br-rio', city: 'Rio de Janeiro', country: 'Brazil', countryCode: 'BR', region: 'South America', latitude: -22.9068, longitude: -43.1729, popularRank: 12, flag: '🇧🇷' },
  { id: 'co-med', city: 'Medellín', country: 'Colombia', countryCode: 'CO', region: 'South America', latitude: 6.2442, longitude: -75.5812, popularRank: 13, flag: '🇨🇴' },
  { id: 'it-rom', city: 'Rome', country: 'Italy', countryCode: 'IT', region: 'Europe', latitude: 41.9028, longitude: 12.4964, popularRank: 14, flag: '🇮🇹' },
  { id: 'au-syd', city: 'Sydney', country: 'Australia', countryCode: 'AU', region: 'Oceania', latitude: -33.8688, longitude: 151.2093, popularRank: 15, flag: '🇦🇺' },
  { id: 'ca-tor', city: 'Toronto', country: 'Canada', countryCode: 'CA', region: 'North America', latitude: 43.6532, longitude: -79.3832, popularRank: 16, flag: '🇨🇦' },
  { id: 'th-bkk', city: 'Bangkok', country: 'Thailand', countryCode: 'TH', region: 'Asia', latitude: 13.7563, longitude: 100.5018, popularRank: 17, flag: '🇹🇭' },
  { id: 'ph-mnl', city: 'Manila', country: 'Philippines', countryCode: 'PH', region: 'Asia', latitude: 14.5995, longitude: 120.9842, popularRank: 18, flag: '🇵🇭' },
  { id: 'mx-mxc', city: 'Mexico City', country: 'Mexico', countryCode: 'MX', region: 'North America', latitude: 19.4326, longitude: -99.1332, popularRank: 19, flag: '🇲🇽' },
  { id: 'de-ber', city: 'Berlin', country: 'Germany', countryCode: 'DE', region: 'Europe', latitude: 52.5200, longitude: 13.4050, popularRank: 20, flag: '🇩🇪' },
];

export interface EffectiveLocationResult {
  city: string;
  country: string;
  countryCode: string;
  flag: string;
  isMock: boolean;
  latitude?: number;
  longitude?: number;
  displayCity: string;
  displayString: string;
}

/**
 * Returns the effective location for any user.
 * If female host and has mock location enabled + active, returns the mock location.
 * Otherwise returns the exact/recorded location or default profile location.
 */
export function getUserEffectiveLocation(user: UserProfile | null | undefined): EffectiveLocationResult {
  if (!user) {
    return {
      city: 'Global',
      country: 'Online',
      countryCode: 'US',
      flag: '🌐',
      isMock: false,
      displayCity: 'Global, Online',
      displayString: 'Global Online',
    };
  }

  const isFemale = user.gender === 'female' || user.role === 'female_creator';

  // 1. Mock location check for female hosts
  if (isFemale && user.isUsingMockLocation && user.mockLocationCity) {
    const code = (user.mockLocationCountryCode || user.countryCode || 'US').toUpperCase();
    const country = user.mockLocationCountry || user.nationality || 'United States';
    const city = user.mockLocationCity;
    const flag = getCountryFlag(code, country);
    return {
      city,
      country,
      countryCode: code,
      flag,
      isMock: true,
      latitude: user.exactLocation?.latitude,
      longitude: user.exactLocation?.longitude,
      displayCity: `${city}, ${code}`,
      displayString: `${city}, ${code}`,
    };
  }

  // 2. Standard user location (user's configured countryCode and nationality take primary precedence)
  const code = (user.countryCode || user.exactLocation?.countryCode || 'US').toUpperCase();
  const country = user.nationality || user.exactLocation?.country || 'United States';
  let city = user.locationCity || user.exactLocation?.city;
  if (!city || city === country || (city.toLowerCase().includes('united states') && country !== 'United States') || (city.toLowerCase().includes('miami') && country !== 'United States' && !user.isUsingMockLocation)) {
    city = country;
  }
  const flag = getCountryFlag(code, country);
  const displayCity = city && city !== country ? `${city}, ${code}` : `${country} (${code})`;

  return {
    city: city || country,
    country,
    countryCode: code,
    flag,
    isMock: false,
    latitude: user.exactLocation?.latitude,
    longitude: user.exactLocation?.longitude,
    displayCity,
    displayString: displayCity,
  };
}

/**
 * Browser GPS location detection with reverse geocoding
 */
export async function detectExactBrowserLocation(): Promise<{
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  countryCode: string;
  accuracyMeters?: number;
}> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;

        try {
          // Free, high reliability reverse geocode client without API key
          const response = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
            { signal: AbortSignal.timeout(6000) }
          );

          if (response.ok) {
            const data = await response.json();
            const city = data.city || data.locality || data.principalSubdivision || 'Detected City';
            const country = data.countryName || 'United States';
            const countryCode = (data.countryCode || 'US').toUpperCase();

            resolve({
              latitude,
              longitude,
              city,
              country,
              countryCode,
              accuracyMeters: Math.round(accuracy),
            });
            return;
          }
        } catch (err) {
          console.warn('Reverse geocoding fetch timed out or failed, using approximate nearest city:', err);
        }

        // Fallback: estimate from coordinates
        const nearest = findNearestPreset(latitude, longitude);
        resolve({
          latitude,
          longitude,
          city: nearest.city,
          country: nearest.country,
          countryCode: nearest.countryCode,
          accuracyMeters: Math.round(accuracy),
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  });
}

function findNearestPreset(lat: number, lon: number): LocationPreset {
  let best = POPULAR_MOCK_LOCATIONS[0];
  let minDistance = Number.MAX_VALUE;

  for (const preset of POPULAR_MOCK_LOCATIONS) {
    const d = Math.hypot(preset.latitude - lat, preset.longitude - lon);
    if (d < minDistance) {
      minDistance = d;
      best = preset;
    }
  }

  return best;
}
