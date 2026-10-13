import type { WebSocket } from 'ws';
import type { UserProfile } from '../src/types';

export interface ConnectedSocket {
  id: string;
  userId: string;
  ws: WebSocket;
}

export interface CallState {
  id: string;
  callerId: string;
  receiverId: string;
  status: 'ringing' | 'active' | 'ended';
  startTime?: number;
  ringingAt?: number;
  coinsSpent?: number;
  coinsEarned?: number;
  teamLeaderId?: string | null;
  teamLeaderEarnedCoins?: number;
  durationSeconds?: number;
  billedMinutes?: number;
}

export interface LiveKitRuntimeConfig {
  apiKey: string;
  apiSecret: string;
  wsUrl: string;
}

export interface InfraRuntimeConfig {
  [key: string]: any;
}

/**
 * Shared in-memory runtime passed into modular route factories.
 * Keeps WebSocket/presence/user state in one place without duplicating Maps.
 */
export interface ServerRuntime {
  presenceMap: Map<string, 'online' | 'busy' | 'offline'>;
  userLastSeen: Map<string, number>;
  connectedSockets: ConnectedSocket[];
  activeCalls: Map<string, CallState>;
  serverUsers: Map<string, UserProfile>;
  creatorMetricsMap: Map<string, any>;
  livekitConfig: LiveKitRuntimeConfig;
  infraConfig: InfraRuntimeConfig;

  normalizeUserProfile: (p: any) => UserProfile;
  getAuthoritativeStatus: (userId: string) => 'online' | 'busy' | 'offline';
  getFormattedPresence: () => Record<string, 'online' | 'busy' | 'offline'>;
  getFormattedUsers: () => UserProfile[];
  getFormattedActiveCalls: () => any[];
  getFormattedCreatorMetrics: () => any;

  /** Apply client presence intent (online|offline only). Busy is server-derived from activeCalls. */
  applyPresenceHeartbeat: (
    userId: string,
    requestedStatus?: string | null,
    opts?: { persistStatus?: boolean; fromUnload?: boolean }
  ) => { status: 'online' | 'busy' | 'offline'; changed: boolean };

  /** Server-owned creator online-seconds accrual. Ignores client increments. */
  accrueCreatorOnlineTime: (
    creatorId: string,
    opts?: { forcePersist?: boolean; stop?: boolean }
  ) => any | null;

  /** Bump call/gift coin counters on creator_metrics (feeds targetBonus at close). */
  recordCreatorEarnCoins: (
    creatorId: string,
    opts: { callCoins?: number; giftCoins?: number }
  ) => any | null;

  toggleReadyNowForCreator: (creatorId: string, isReadyNow: boolean) => any;
  getFirstCallBonusAmounts: () => Promise<{ coins: number; usd: number }>;

  broadcastAll: (payload: any) => void;
  broadcastPresence: () => void;
  broadcastUsers: () => void;
  broadcastActiveCalls: () => void;
  broadcastCreatorMetrics: () => void;
  sendToUser?: (userId: string, payload: any) => number | void;

  /** Purge a user from all in-memory maps/sets after hard-delete. */
  purgeUserRuntimeState: (userId: string) => void;
  /** True if this userId was hard-deleted during this server process lifetime. */
  isUserHardDeleted: (userId: string) => boolean;
  /**
   * Clear volatile in-memory state for factory/granular reset.
   * When clearUsers is true, keep only the provided admin profile (if any).
   */
  resetVolatileRuntimeState: (opts?: {
    clearUsers?: boolean;
    adminUser?: UserProfile | null;
    clearActiveCalls?: boolean;
    clearPresence?: boolean;
  }) => void;
}
