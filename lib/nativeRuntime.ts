import type { ServerRuntime, ConnectedSocket, CallState } from '../server/runtimeTypes';
import type { UserProfile } from '../src/types';
import { normalizeUserProfile } from './normalizeUserProfile';
import { fetchProfilesAdmin, isSupabaseAdminConfigured } from '../server/supabaseAdmin';

let cachedRuntime: ServerRuntime | null = null;
let initPromise: Promise<ServerRuntime> | null = null;

function buildDefaultInfraConfig() {
  return {
    supabaseUrl:
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      '',
    supabasePublishableKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      '',
    supabaseAnonKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      '',
    r2AccountId: process.env.R2_ACCOUNT_ID || '',
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    r2BucketName: process.env.R2_BUCKET_NAME || 'minglecall-bucket',
    r2PublicUrl: process.env.R2_PUBLIC_URL || '',
    dbMaxPoolSize: 50,
    dbIdleTimeoutSeconds: 30,
    dbStatementTimeoutMs: 5000,
    dbQueryCachingEnabled: true,
    r2MaxImageSizeMb: 15,
    r2MaxVideoSizeMb: 100,
    r2AllowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'],
    r2CdnCacheTtlSeconds: 86400,
    autoModerationSensitivity: 'medium',
    nsfwFilterEnabled: true,
    bannedKeywords: ['scam', 'wire transfer', 'bank password', 'abuse', 'underage'],
    abuseReportAutoSuspendThreshold: 5,
    featureRealtimeChatEnabled: true,
    featureR2DirectUploadEnabled: true,
    featureVideoCallingEnabled: true,
    featureGeoDiscoveryEnabled: true,
    featureMaintenanceMode: false,
  };
}

function createNativeRuntime(): ServerRuntime {
  const presenceMap = new Map<string, 'online' | 'busy' | 'offline'>();
  const userLastSeen = new Map<string, number>();
  const connectedSockets: ConnectedSocket[] = [];
  const activeCalls = new Map<string, CallState>();
  const serverUsers = new Map<string, UserProfile>();
  const creatorMetricsMap = new Map<string, any>();
  const deletedUserTombstones = new Set<string>();
  const quickMatchLiveHosts = new Set<string>();
  const quickMatchActiveCallers = new Set<string>();

  const livekitConfig = {
    apiKey: process.env.LIVEKIT_API_KEY || '',
    apiSecret: process.env.LIVEKIT_API_SECRET || '',
    wsUrl: process.env.LIVEKIT_URL || 'wss://your-livekit-project.livekit.cloud',
  };

  const infraConfig = buildDefaultInfraConfig();

  const getAuthoritativeStatus = (userId: string): 'online' | 'busy' | 'offline' => {
    if (!userId) return 'offline';
    const isBusy = Array.from(activeCalls.values()).some(
      (c) => (c.callerId === userId || c.receiverId === userId) && c.status !== 'ended'
    );
    if (isBusy) return 'busy';
    const explicitStatus = presenceMap.get(userId);
    if (explicitStatus === 'offline') return 'offline';
    const lastSeen = userLastSeen.get(userId) || 0;
    const isRecentlyActive = Date.now() - lastSeen < 12000;
    const isConnected = connectedSockets.some((c) => c.userId === userId);
    if (explicitStatus === 'busy' && (isConnected || isRecentlyActive)) return 'busy';
    if (isConnected) return 'online';
    if (explicitStatus === 'online' && isRecentlyActive) return 'online';
    if (isRecentlyActive) return 'online';
    return 'offline';
  };

  const getFormattedPresence = (): Record<string, 'online' | 'busy' | 'offline'> => {
    const obj: Record<string, 'online' | 'busy' | 'offline'> = {};
    for (const [uid] of serverUsers.entries()) {
      obj[uid] = getAuthoritativeStatus(uid);
    }
    for (const [uid] of presenceMap.entries()) {
      if (!obj[uid]) obj[uid] = getAuthoritativeStatus(uid);
    }
    return obj;
  };

  const getFormattedUsers = (): UserProfile[] => {
    const isUuid = (id: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    const sorted = Array.from(serverUsers.values()).sort((a, b) => {
      if (isUuid(a.id) && !isUuid(b.id)) return -1;
      if (!isUuid(a.id) && isUuid(b.id)) return 1;
      return 0;
    });
    const seenEmails = new Set<string>();
    const result: UserProfile[] = [];
    for (const u of sorted) {
      const cleanEmail = u.email ? String(u.email).toLowerCase().trim() : null;
      if (cleanEmail) {
        if (seenEmails.has(cleanEmail)) continue;
        seenEmails.add(cleanEmail);
      }
      const sanitized: any = { ...u, onlineStatus: getAuthoritativeStatus(u.id) };
      delete sanitized.password;
      delete sanitized.password_hash;
      delete sanitized.passwordHash;
      result.push(sanitized as UserProfile);
    }
    return result;
  };

  const broadcastAll = (_payload: any) => {
    /* No WebSocket server on Next-native runtime; Realtime clients use Supabase channels. */
  };

  const sendToUser = (_userId: string, _payload: any): number => 0;

  const getFormattedActiveCalls = () =>
    Array.from(activeCalls.values())
      .filter((c) => c.status === 'active' || c.status === 'ringing')
      .map((c) => ({
        id: c.id,
        callerId: c.callerId,
        receiverId: c.receiverId,
        status: c.status,
        startTime: c.startTime || Date.now(),
        durationSeconds: c.startTime ? Math.max(0, Math.floor((Date.now() - c.startTime) / 1000)) : 0,
      }));

  const broadcastActiveCalls = () => {
    broadcastAll({ type: 'admin:active_calls_update', activeCalls: getFormattedActiveCalls() });
  };

  const broadcastPresence = () => {
    broadcastAll({ type: 'presence:all', presence: getFormattedPresence() });
  };

  const broadcastUsers = () => {
    broadcastAll({ type: 'users:all', users: getFormattedUsers() });
  };

  const getFormattedCreatorMetrics = () => {
    const obj: Record<string, any> = {};
    for (const [k, v] of creatorMetricsMap.entries()) obj[k] = v;
    return obj;
  };

  const broadcastCreatorMetrics = () => {
    broadcastAll({ type: 'creator_metrics:all', metrics: getFormattedCreatorMetrics() });
  };

  const purgeUserRuntimeState = (userId: string) => {
    const id = String(userId || '').trim();
    if (!id) return;
    deletedUserTombstones.add(id);
    serverUsers.delete(id);
    presenceMap.delete(id);
    userLastSeen.delete(id);
    creatorMetricsMap.delete(id);
    quickMatchLiveHosts.delete(id);
    quickMatchActiveCallers.delete(id);
    for (const [callId, call] of Array.from(activeCalls.entries())) {
      if (call.callerId === id || call.receiverId === id) activeCalls.delete(callId);
    }
  };

  const resetVolatileRuntimeState = (opts?: {
    clearUsers?: boolean;
    adminUser?: UserProfile | null;
    clearActiveCalls?: boolean;
    clearPresence?: boolean;
  }) => {
    if (opts?.clearActiveCalls !== false) activeCalls.clear();
    if (opts?.clearPresence !== false) {
      presenceMap.clear();
      userLastSeen.clear();
    }
    creatorMetricsMap.clear();
    quickMatchLiveHosts.clear();
    quickMatchActiveCallers.clear();
    if (opts?.clearUsers) {
      const admin =
        opts.adminUser ||
        Array.from(serverUsers.values()).find((u) => u.role === 'admin') ||
        null;
      for (const [id, u] of Array.from(serverUsers.entries())) {
        if (u.role !== 'admin') deletedUserTombstones.add(id);
      }
      serverUsers.clear();
      if (admin?.id) {
        deletedUserTombstones.delete(admin.id);
        serverUsers.set(admin.id, { ...admin, onlineStatus: 'online' });
        presenceMap.set(admin.id, 'online');
      }
    }
  };

  const runtime: ServerRuntime = {
    presenceMap,
    userLastSeen,
    connectedSockets,
    activeCalls,
    serverUsers,
    creatorMetricsMap,
    livekitConfig,
    infraConfig,
    normalizeUserProfile,
    getAuthoritativeStatus,
    getFormattedPresence,
    getFormattedUsers,
    getFormattedActiveCalls,
    getFormattedCreatorMetrics,
    applyPresenceHeartbeat: (userId, requestedStatus) => {
      const status =
        requestedStatus === 'offline'
          ? 'offline'
          : getAuthoritativeStatus(userId) === 'offline'
            ? 'online'
            : getAuthoritativeStatus(userId);
      if (requestedStatus === 'online' || requestedStatus === 'offline') {
        presenceMap.set(userId, requestedStatus);
        userLastSeen.set(userId, Date.now());
      }
      return { status, changed: true };
    },
    accrueCreatorOnlineTime: (creatorId) => creatorMetricsMap.get(creatorId) || null,
    recordCreatorEarnCoins: (creatorId) => creatorMetricsMap.get(creatorId) || null,
    toggleReadyNowForCreator: (creatorId, isReadyNow) => {
      const existing = creatorMetricsMap.get(creatorId) || { creatorId, isReadyNow: false };
      const updated = { ...existing, isReadyNow };
      creatorMetricsMap.set(creatorId, updated);
      return updated;
    },
    getFirstCallBonusAmounts: async () => ({ coins: 0, usd: 0 }),
    broadcastAll,
    broadcastPresence,
    broadcastUsers,
    broadcastActiveCalls,
    broadcastCreatorMetrics,
    sendToUser,
    purgeUserRuntimeState,
    isUserHardDeleted: (userId: string) => deletedUserTombstones.has(String(userId || '').trim()),
    resetVolatileRuntimeState,
  };

  if (isSupabaseAdminConfigured()) {
    void fetchProfilesAdmin()
      .then((res) => {
        if (!res?.success || !res.profiles?.length) return;
        const isUuid = (id: string) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
        const sortedProfiles = [...res.profiles].sort((a, b) => {
          if (isUuid(a.id) && !isUuid(b.id)) return -1;
          if (!isUuid(a.id) && isUuid(b.id)) return 1;
          return 0;
        });
        const emailMap = new Map<string, UserProfile>();
        serverUsers.clear();
        presenceMap.clear();
        for (const p of sortedProfiles) {
          const normalized = normalizeUserProfile(p);
          const cleanEmail = normalized.email ? String(normalized.email).toLowerCase().trim() : null;
          if (cleanEmail) {
            if (emailMap.has(cleanEmail)) continue;
            emailMap.set(cleanEmail, normalized);
          }
          if (deletedUserTombstones.has(normalized.id)) continue;
          const status = String(
            (normalized as any).accountStatus || (p as any).account_status || 'active'
          ).toLowerCase();
          // Soft-closed stay in DB for payouts/audit but not in live directory
          if (status === 'closed_pending_payout' || status === 'deactivated') {
            continue;
          }
          serverUsers.set(normalized.id, { ...normalized, onlineStatus: 'offline' });
          presenceMap.set(normalized.id, 'offline');
        }
      })
      .catch((err) => {
        console.warn('[nativeRuntime] Initial profile fetch warning:', err?.message || err);
      });
  }

  return runtime;
}

/** In-memory ServerRuntime for Next.js Route Handlers. */
export async function getServerRuntime(): Promise<ServerRuntime> {
  if (cachedRuntime) return cachedRuntime;
  if (!initPromise) {
    initPromise = Promise.resolve().then(() => {
      cachedRuntime = createNativeRuntime();
      return cachedRuntime;
    });
  }
  return initPromise;
}

export function resetNativeRuntimeCache() {
  cachedRuntime = null;
  initPromise = null;
}
