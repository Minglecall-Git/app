export function cleanLiveKitEnv(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

export function getLiveKitEnv() {
  return {
    wsUrl: cleanLiveKitEnv(process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL),
    apiKey: cleanLiveKitEnv(process.env.LIVEKIT_API_KEY),
    apiSecret: cleanLiveKitEnv(process.env.LIVEKIT_API_SECRET),
  };
}

export function isLiveKitConfigured(): boolean {
  const { apiKey, apiSecret } = getLiveKitEnv();
  return Boolean(apiKey && apiSecret && apiKey !== 'devkey' && apiSecret !== 'secret');
}

export function livekitHttpHost(wsUrl: string): string {
  const u = cleanLiveKitEnv(wsUrl);
  if (!u) return '';
  return u.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
}
